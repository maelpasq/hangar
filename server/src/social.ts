// Social du compte Hangar (docs/COMPTE.md, phase 7) : profils vus dans l'app, amis, présence,
// activité, messages privés et signalements. Tout passe par le jeton du poste ; le temps réel
// (présence, nouveaux messages) part vers la connexion WebSocket de chaque compte (`live.ts`).
//
// Confidentialité : chaque information partagée a sa visibilité (`all`, `friends`, `none`),
// appliquée ici, jamais dans l'app. Un compte qui n'a pas activé les amis est invisible (recherche,
// présence) ; un blocage, dans un sens ou dans l'autre, coupe tout.
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, like, lt, ne, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { badgeDefsOf, badgeExists, heldBadges, legacyOf, setBadge } from './badges';
import { webhookOf } from './bug';
import { seal, unseal } from './crypto';
import type { AvatarStore, Db, Env } from './env';
import { imageType, isUserId, totalPlay } from './profile';
import { activity, badges, devices, entries, friends, messages, reports, social, user } from './schema';

/** Envoi d'un évènement aux connexions temps réel de ces comptes (remplacé dans les tests). */
export type Hub = (userIds: string[], event: Record<string, unknown>) => Promise<void>;

type Vars = { Variables: { device: { userId: string; deviceId: string } } };
export type Vis = 'all' | 'friends' | 'none';
export type Relation = 'self' | 'friend' | 'out' | 'in' | 'blocked' | 'blockedBy' | 'none';
type SocialRow = typeof social.$inferSelect;
type Game = { id: string; name: string };

const VIS: Vis[] = ['all', 'friends', 'none'];
/** Code ami : 8 caractères sans ceux qu'on confond (0/O, 1/I/L). */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Sans signe de vie depuis 10 minutes (l'app en envoie toutes les 4) : hors ligne. */
export const STALE = 10 * 60_000;
const MAX_TEXT = 2000;
const MESSAGES_PER_MINUTE = 30;
const REQUESTS_PER_HOUR = 30;
const REPORTS_PER_DAY = 20;
/** Lignes « jeux ajoutés » par heure : garde-fou contre un client qui inonde ses amis. */
const ADDED_PER_HOUR = 20;
const MAX_PENDING = 100;
const PAGE = 50;
export const BANNER_MAX = 1024 * 1024;
export const bannerKey = (userId: string) => `banners/${userId}`;
const REASONS = ['spam', 'harcelement', 'contenu', 'autre'];
/** Un même jeu relancé dans l'heure n'ajoute pas d'activité. */
const PLAY_AGAIN = 3_600_000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Numéro de version de Hangar : 1.2.28 ou 1.2.28.2. */
const APP_VERSION = /^\d{1,4}(\.\d{1,4}){2,3}$/;

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 && s.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s) ? s : null;
};
const parse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};
const newId = () => crypto.randomUUID();

/** Comptes certifiés parmi `ids` : la pastille à côté de leur pseudo, partout dans l'app. */
export async function certifiedAmong(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ id: badges.userId })
    .from(badges)
    .where(and(inArray(badges.userId, ids), eq(badges.badge, 'certifie')));
  return new Set(rows.map((r) => r.id));
}

/**
 * Compte administrateur : son adresse, vérifiée, est celle du secret `ADMIN_EMAIL` du Worker
 * (jamais dans le dépôt). Lui seul donne ou retire les badges ; sans ce secret, personne.
 */
export async function isAdmin(db: Db, env: Env, id: string): Promise<boolean> {
  const admin = env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin) return false;
  const [u] = await db.select({ email: user.email, verified: user.emailVerified }).from(user).where(eq(user.id, id));
  return !!u && u.verified && u.email.trim().toLowerCase() === admin;
}

/**
 * Jeux installés, rangés par poste (`{ [deviceId]: Game[] }`) : chaque poste n'envoie que les siens,
 * le profil montre l'union des postes connectés. Ancien format (une seule liste, écrasée par le
 * dernier poste synchronisé) : gardé sous la clé `''` jusqu'au premier envoi au nouveau format.
 */
type DeviceGames = Record<string, Game[]>;
function deviceGames(raw: string | null): DeviceGames {
  const v = parse<unknown>(raw, null);
  if (Array.isArray(v)) return { '': v as Game[] };
  return isObject(v) ? (v as DeviceGames) : {};
}

/** Postes encore connectés d'un compte. */
async function liveDevices(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: devices.deviceId })
    .from(devices)
    .where(and(eq(devices.userId, userId), isNotNull(devices.tokenHash)));
  return new Set(rows.map((r) => r.id));
}

/** Bibliothèque installée d'un compte : union des listes de ses postes connectés, sans doublon. */
async function libraryOf(db: Db, userId: string, raw: string | null): Promise<Game[]> {
  const byDevice = deviceGames(raw);
  const live = await liveDevices(db, userId);
  const seen = new Set<string>();
  const out: Game[] = [];
  for (const [device, list] of Object.entries(byDevice)) {
    if (device !== '' && !live.has(device)) continue;
    for (const g of Array.isArray(list) ? list : []) {
      if (!isObject(g) || typeof g.id !== 'string' || seen.has(g.id)) continue;
      seen.add(g.id);
      out.push(g);
    }
  }
  return out;
}

/** Nombre de launchers différents d'une bibliothèque (« steam:123 » : Steam ; « @exe|dossier » : aucun). */
export function storeCount(games: Game[]): number {
  return new Set(games.filter((g) => !g.id.startsWith('@') && g.id.includes(':')).map((g) => g.id.split(':')[0])).size;
}

/** Un jeu tel que l'app le décrit : identifiant portable et nom. */
function game(v: unknown): Game | null {
  if (!isObject(v)) return null;
  const id = text(v.id, 512);
  const name = text(v.name, 200);
  return id && name ? { id, name } : null;
}

/** Nom comparable d'un launcher à l'autre : sans accents, symboles (™, ®, :, -...) ni casse. */
export function gameKey(name: string): string {
  return name
    .replace(/[™®©℠]/g, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Jeux en commun, quel que soit le launcher : même identifiant (même store) ou même nom
 * normalisé (Steam chez l'un, Epic, GOG ou dossier local chez l'autre). Renvoie la version
 * de `mine` (jaquette et lancement depuis la bibliothèque de celui qui regarde), sans doublon.
 */
export function commonGames(mine: Game[], theirs: Game[]): Game[] {
  const byId = new Map(mine.map((g) => [g.id, g]));
  const byName = new Map<string, Game>();
  for (const g of mine) {
    const k = gameKey(g.name);
    if (k && !byName.has(k)) byName.set(k, g);
  }
  const out: Game[] = [];
  const seen = new Set<string>();
  for (const g of theirs) {
    const k = gameKey(g.name);
    const m = byId.get(g.id) ?? (k ? byName.get(k) : undefined);
    if (!m || seen.has(m.id) || (k && seen.has(`#${k}`))) continue;
    seen.add(m.id);
    if (k) seen.add(`#${k}`);
    out.push(m);
  }
  return out;
}

export function newCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
}

/** Code ami saisi (« abcd-2345 », espaces, tirets) : sa forme rangée, ou null. */
export function normCode(q: string): string | null {
  const c = q.replace(/[\s-]/g, '').toUpperCase();
  return c.length === 8 && [...c].every((ch) => CODE_CHARS.includes(ch)) ? c : null;
}

export const sees = (vis: string, rel: Relation) => rel === 'self' || vis === 'all' || (vis === 'friends' && rel === 'friend');
export const convoOf = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Présence vue par quelqu'un : `hidden` si le statut lui est caché ; le jeu en cours a sa propre
 * visibilité. Un compte sans signe de vie récent est hors ligne, quoi que dise `online`.
 */
export function presence(row: SocialRow | undefined, rel: Relation, now = Date.now()) {
  if (!row || (!row.enabled && rel !== 'self')) return { state: 'offline' as const, game: null };
  const live = row.online && now - row.seen < STALE;
  const playing = live ? parse<{ id: string; name: string; since: number } | null>(row.playing, null) : null;
  const game = playing && sees(row.gameVis, rel) ? playing : null;
  if (game) return { state: 'playing' as const, game };
  if (!sees(row.statusVis, rel)) return { state: 'hidden' as const, game: null };
  return { state: live ? ('online' as const) : ('offline' as const), game: null };
}

/** Réglages sociaux d'un compte, créés au premier besoin (désactivés, code ami tiré au hasard). */
export async function ensureSocial(db: Db, userId: string): Promise<SocialRow> {
  for (let i = 0; i < 5; i++) {
    const [row] = await db.select().from(social).where(eq(social.userId, userId));
    if (row) return row;
    await db.insert(social).values({ userId, code: newCode(), createdAt: Date.now() }).onConflictDoNothing();
  }
  throw new Error('code ami');
}

async function friendIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: friends.otherId })
    .from(friends)
    .where(and(eq(friends.userId, userId), eq(friends.state, 'friend')));
  return rows.map((r) => r.id);
}

/** Présence envoyée aux amis (ce qu'un ami voit). */
export async function pushPresence(db: Db, hub: Hub, userId: string): Promise<void> {
  const ids = await friendIds(db, userId);
  if (!ids.length) return;
  const [row] = await db.select().from(social).where(eq(social.userId, userId));
  await hub(ids, { type: 'presence', id: userId, presence: presence(row, 'friend') });
}

/**
 * Connexion temps réel ouverte (`online`) ou fermée : appelé par la connexion du compte. Hors
 * ligne, le jeu en cours est oublié (PC éteint pendant une partie).
 */
export async function setOnline(db: Db, hub: Hub, userId: string, online: boolean, now = Date.now()): Promise<void> {
  const set = online ? { online, seen: now } : { online, seen: now, playing: null };
  const done = await db.update(social).set(set).where(eq(social.userId, userId)).returning({ id: social.userId });
  if (done.length) await pushPresence(db, hub, userId);
}

/** Signe de vie de la connexion temps réel. */
export async function touch(db: Db, userId: string, now = Date.now()): Promise<void> {
  await db.update(social).set({ seen: now, online: true }).where(eq(social.userId, userId));
}

/** Tout le social d'un compte supprimé (liens des deux côtés, messages, activité, signalements). */
export async function deleteSocial(db: Db, bucket: AvatarStore | undefined, id: string) {
  await bucket?.delete(bannerKey(id));
  return [
    db.delete(social).where(eq(social.userId, id)),
    db.delete(friends).where(or(eq(friends.userId, id), eq(friends.otherId, id))),
    db.delete(activity).where(eq(activity.userId, id)),
    db.delete(messages).where(or(eq(messages.fromId, id), eq(messages.toId, id))),
    db.delete(reports).where(or(eq(reports.reporterId, id), eq(reports.targetId, id))),
    db.delete(badges).where(eq(badges.userId, id))
  ] as const;
}

/** Activité de plus de 30 jours : effacée au ménage quotidien. */
export async function cleanActivity(db: Db, now: number): Promise<void> {
  await db.delete(activity).where(lt(activity.at, now - 30 * 86_400_000));
}

interface Deps {
  /** Version de l'avatar d'un compte (champ `image`), ou null. */
  avatarOf(image: string | null): Promise<string | null>;
  loadAvatar(u: { id: string; image: string | null }): Promise<{ type: string; bytes: Uint8Array<ArrayBuffer> } | null>;
}

/** Signalement tel qu'il est enregistré. */
export type ReportRow = typeof reports.$inferSelect;

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harcelement: 'Harcèlement',
  contenu: 'Contenu inapproprié',
  autre: 'Autre'
};

/** Message Discord d'un signalement : noms et identifiants des deux comptes, motif, message cité. */
export function reportEmbed(r: ReportRow, names: Record<string, string>) {
  const who = (id: string) => `${names[id] ?? '(compte supprimé)'}\n\`${id}\``;
  const [code, ...rest] = r.reason.split(' : ');
  const reason = [REASON_LABELS[code] ?? code, rest.join(' : ')].filter(Boolean).join(' : ');
  const fields = [
    { name: 'Signalé', value: who(r.targetId), inline: true },
    { name: 'Par', value: who(r.reporterId), inline: true },
    { name: 'Motif', value: reason.slice(0, 1024) }
  ];
  if (r.excerpt !== null) fields.push({ name: 'Message', value: (r.excerpt || '*(vide)*').slice(0, 1024) });
  return {
    title: r.messageId ? '🚩 Message signalé' : '🚩 Compte signalé',
    color: 0xe5484d,
    fields,
    timestamp: new Date(r.at).toISOString()
  };
}

/**
 * Prévient le développeur sur le webhook Discord (le même que les bugs). Au mieux : un échec est
 * journalisé (jamais l'adresse) et n'empêche pas le signalement, déjà enregistré.
 */
export async function notifyReport(db: Db, env: Env, r: ReportRow): Promise<boolean> {
  const webhook = webhookOf(env);
  if (!webhook) return false;
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, [r.reporterId, r.targetId]));
  const names = Object.fromEntries(rows.map((u) => [u.id, u.name]));
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ embeds: [reportEmbed(r, names)], allowed_mentions: { parse: [] } }),
    redirect: 'manual'
  }).catch(() => null);
  if (!res?.ok) console.error(`[hangar] signalement de compte non relayé (${res?.status ?? 'réseau'})`);
  return !!res?.ok;
}

export function socialRoutes(db: Db, env: Env, hub: Hub, deps: Deps) {
  const r = new Hono<Vars>();
  const bucket = env.AVATARS;

  const relation = async (me: string, other: string): Promise<Relation> => {
    if (me === other) return 'self';
    const rows = await db
      .select()
      .from(friends)
      .where(or(and(eq(friends.userId, me), eq(friends.otherId, other)), and(eq(friends.userId, other), eq(friends.otherId, me))));
    const mine = rows.find((x) => x.userId === me)?.state;
    const theirs = rows.find((x) => x.userId === other)?.state;
    if (mine === 'blocked') return 'blocked';
    if (theirs === 'blocked') return 'blockedBy';
    return (mine as Relation | undefined) ?? 'none';
  };

  /** Carte d'un compte (liste d'amis, recherche) : pseudo, avatar, présence vue par `rel`. */
  const cards = async (ids: string[], rels: Map<string, Relation>) => {
    if (!ids.length) return [];
    const users = await db.select({ id: user.id, name: user.name, image: user.image }).from(user).where(inArray(user.id, ids));
    const rows = await db.select().from(social).where(inArray(social.userId, ids));
    const byId = new Map(rows.map((x) => [x.userId, x]));
    const certified = await certifiedAmong(db, ids);
    const out = [];
    for (const u of users) {
      const rel = rels.get(u.id) ?? 'none';
      out.push({
        id: u.id,
        name: u.name.trim() || 'Joueur',
        certified: certified.has(u.id),
        avatar: await deps.avatarOf(u.image),
        relation: rel,
        presence: presence(byId.get(u.id), rel)
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  };

  /**
   * Un autre compte visible par `me` : pas bloqué, et amis activés. Un compte qui désactive les
   * amis devient invisible, même pour ses amis (son lien reste, sans profil ni présence).
   */
  const reachable = async (me: string, id: string) => {
    if (!isUserId(id)) return null;
    const rel = await relation(me, id);
    if (rel === 'blocked' || rel === 'blockedBy') return null;
    const [row] = await db.select().from(social).where(eq(social.userId, id));
    if (rel !== 'self' && !row?.enabled) return null;
    const [u] = await db.select().from(user).where(eq(user.id, id));
    return u ? { rel, row, u } : null;
  };

  const meOn = async (me: string) => (await ensureSocial(db, me)).enabled;

  /** Qui envoie un évènement (notification chez l'autre). */
  const who = async (id: string) => {
    const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, id));
    return { id, name: u?.name.trim() || 'Joueur' };
  };

  // --- Réglages ---

  /** Réglages, et la pastille certifiée du compte (à côté de son propre pseudo dans l'app). */
  const settingsOf = async (row: SocialRow) => ({
    enabled: row.enabled,
    certified: (await certifiedAmong(db, [row.userId])).size > 0,
    code: row.code,
    findable: row.findable,
    privacy: { status: row.statusVis, game: row.gameVis, play: row.playVis, library: row.libraryVis },
    banner: row.banner
  });

  r.get('/me', async (c) => c.json(await settingsOf(await ensureSocial(db, c.get('device').userId))));

  r.put('/me', async (c) => {
    const me = c.get('device').userId;
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body)) return c.json({ error: 'requete' }, 400);
    const prev = await ensureSocial(db, me);
    const set: Partial<SocialRow> = {};
    if ('enabled' in body) {
      if (typeof body.enabled !== 'boolean') return c.json({ error: 'requete' }, 400);
      set.enabled = body.enabled;
      if (!body.enabled) Object.assign(set, { online: false, playing: null });
    }
    if ('findable' in body) {
      if (typeof body.findable !== 'boolean') return c.json({ error: 'requete' }, 400);
      set.findable = body.findable;
    }
    if ('privacy' in body) {
      const p = body.privacy;
      if (!isObject(p)) return c.json({ error: 'requete' }, 400);
      const cols = { status: 'statusVis', game: 'gameVis', play: 'playVis', library: 'libraryVis' } as const;
      for (const [k, col] of Object.entries(cols)) {
        if (!(k in p)) continue;
        if (!VIS.includes(p[k] as Vis)) return c.json({ error: 'requete' }, 400);
        set[col] = p[k] as Vis;
      }
    }
    if (body.newCode === true) set.code = newCode();
    if (!Object.keys(set).length) return c.json(await settingsOf(prev));
    const [row] = await db.update(social).set(set).where(eq(social.userId, me)).returning();
    await pushPresence(db, hub, me);
    return c.json(await settingsOf(row));
  });

  /** Vitrine (jeux les plus joués, jeux favoris, collections mises en avant) et bibliothèque, envoyées par l'app. */
  r.put('/showcase', async (c) => {
    const me = c.get('device').userId;
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body) || !Array.isArray(body.top) || !Array.isArray(body.collections) || !Array.isArray(body.games)) {
      return c.json({ error: 'requete' }, 400);
    }
    // `favorites` : facultatif (versions de l'app d'avant les jeux favoris).
    const favs: unknown[] = body.favorites === undefined ? [] : Array.isArray(body.favorites) ? body.favorites : [null];
    if (body.top.length > 10 || favs.length > 5 || body.collections.length > 3 || body.games.length > 10_000) {
      return c.json({ error: 'requete' }, 400);
    }
    const favorites = favs.map(game);
    if (favorites.some((g) => !g)) return c.json({ error: 'requete' }, 400);
    // `version` : version de Hangar du poste qui envoie (facultative, versions de l'app d'avant).
    const version = typeof body.version === 'string' ? body.version : null;
    if (body.version !== undefined && !(version && APP_VERSION.test(version))) return c.json({ error: 'requete' }, 400);
    const top = [];
    for (const t of body.top as unknown[]) {
      const g = game(t);
      const ms = isObject(t) ? t.ms : null;
      if (!g || typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return c.json({ error: 'requete' }, 400);
      top.push({ ...g, ms: Math.round(ms) });
    }
    const collections = [];
    for (const col of body.collections as unknown[]) {
      const name = isObject(col) ? text(col.name, 60) : null;
      const list = isObject(col) && Array.isArray(col.games) ? col.games : null;
      if (!name || !list || list.length > 500) return c.json({ error: 'requete' }, 400);
      const games = list.map(game);
      if (games.some((g) => !g)) return c.json({ error: 'requete' }, 400);
      collections.push({ name, games: games as Game[] });
    }
    const games = (body.games as unknown[]).map(game);
    if (games.some((g) => !g)) return c.json({ error: 'requete' }, 400);
    const row = await ensureSocial(db, me);
    // Jeux installés de ce poste seulement : ceux des autres postes connectés sont gardés.
    const live = await liveDevices(db, me);
    const byDevice: DeviceGames = {};
    for (const [device, list] of Object.entries(deviceGames(row.games))) if (live.has(device)) byDevice[device] = list;
    byDevice[c.get('device').deviceId] = games as Game[];
    await db
      .update(social)
      .set({ showcase: JSON.stringify({ top, favorites, collections, version }), games: JSON.stringify(byDevice) })
      .where(eq(social.userId, me));
    return c.json({ ok: true });
  });

  r.put('/banner', bodyLimit({ maxSize: BANNER_MAX, onError: (c) => c.json({ error: 'trop_gros' }, 413) }), async (c) => {
    const me = c.get('device').userId;
    if (!bucket) return c.json({ error: 'indisponible' }, 503);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const type = imageType(bytes);
    if (!type || type === 'image/gif') return c.json({ error: 'image' }, 400);
    await ensureSocial(db, me);
    await bucket.put(bannerKey(me), bytes, { httpMetadata: { contentType: type } });
    const banner = Date.now().toString(36);
    await db.update(social).set({ banner }).where(eq(social.userId, me));
    return c.json({ ok: true, banner });
  });

  r.delete('/banner', async (c) => {
    const me = c.get('device').userId;
    await bucket?.delete(bannerKey(me));
    await db.update(social).set({ banner: null }).where(eq(social.userId, me));
    return c.json({ ok: true });
  });

  // --- Profils et recherche ---

  r.get('/users/:id', async (c) => {
    const me = c.get('device').userId;
    const found = await reachable(me, c.req.param('id'));
    if (!found) return c.json({ error: 'introuvable' }, 404);
    const { rel, row, u } = found;
    const vis = row ?? (await ensureSocial(db, u.id));
    const showcase = parse<{
      top: (Game & { ms: number })[];
      favorites?: Game[];
      collections: { name: string; games: Game[] }[];
      version?: string | null;
    }>(
      vis.showcase,
      { top: [], collections: [] }
    );
    const play = sees(vis.playVis, rel);
    const lib = sees(vis.libraryVis, rel);
    let playMs: number | null = null;
    if (play) {
      const times = await db
        .select({ key: entries.key, value: entries.value })
        .from(entries)
        .where(and(eq(entries.userId, u.id), like(entries.key, 'time:%'), eq(entries.deleted, false)));
      playMs = totalPlay(times).playMs;
    }
    let common: Game[] | null = null;
    let count: number | null = null;
    let stores: number | null = null;
    if (lib) {
      const theirs = await libraryOf(db, u.id, vis.games);
      count = theirs.length;
      stores = storeCount(theirs);
      if (rel !== 'self') {
        const [mine] = await db.select({ games: social.games }).from(social).where(eq(social.userId, me));
        common = commonGames(await libraryOf(db, me, mine?.games ?? null), theirs).slice(0, 60);
      }
    }
    const recent = await db.select().from(activity).where(eq(activity.userId, u.id)).orderBy(desc(activity.at)).limit(20);
    const held = await heldBadges(db, u.id);
    const admin = await isAdmin(db, env, me);
    return c.json({
      id: u.id,
      name: u.name.trim() || 'Joueur',
      // `badges` : pour les versions d'avant la phase 4 ; `badgeDefs` : de quoi afficher chacun.
      badges: legacyOf(held),
      badgeDefs: held,
      // Seul l'administrateur le reçoit à true : l'app lui montre alors les boutons des badges,
      // avec la liste de ceux qu'il peut donner (`allBadges`).
      canBadge: admin,
      allBadges: admin ? (await badgeDefsOf(db, true)).map(({ position: _, active: __, ...d }) => d) : undefined,
      avatar: await deps.avatarOf(u.image),
      banner: vis.banner,
      since: u.createdAt.getTime(),
      relation: rel,
      code: rel === 'self' ? vis.code : null,
      presence: presence(vis, rel),
      playMs,
      games: count,
      stores,
      version: showcase.version ?? null,
      top: play ? showcase.top : null,
      favorites: lib ? (showcase.favorites ?? []) : null,
      collections: lib ? showcase.collections : null,
      common,
      activity: recent.filter((a) => sees(a.kind === 'play' ? vis.gameVis : vis.libraryVis, rel)).slice(0, 10).map(activityView)
    });
  });

  /** Donne (`on: true`) ou retire un badge. Administrateur seulement : personne ne peut en demander. */
  r.put('/users/:id/badges', async (c) => {
    const me = c.get('device').userId;
    if (!(await isAdmin(db, env, me))) return c.json({ error: 'interdit' }, 403);
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body) || !(await badgeExists(db, body.badge)) || typeof body.on !== 'boolean') {
      return c.json({ error: 'requete' }, 400);
    }
    const id = c.req.param('id');
    const [u] = isUserId(id) ? await db.select({ id: user.id }).from(user).where(eq(user.id, id)) : [];
    if (!u) return c.json({ error: 'introuvable' }, 404);
    await setBadge(db, hub, id, body.badge as string, body.on);
    const held = await heldBadges(db, id);
    return c.json({ badges: legacyOf(held), badgeDefs: held });
  });

  r.get('/users/:id/avatar', async (c) => {
    const found = await reachable(c.get('device').userId, c.req.param('id'));
    const pic = found ? await deps.loadAvatar(found.u).catch(() => null) : null;
    if (!pic) return c.json({ error: 'introuvable' }, 404);
    return c.body(pic.bytes, 200, { 'content-type': pic.type, 'cache-control': 'private, no-store' });
  });

  r.get('/users/:id/banner', async (c) => {
    const found = await reachable(c.get('device').userId, c.req.param('id'));
    const obj = found?.row?.banner && bucket ? await bucket.get(bannerKey(found.u.id)) : null;
    const bytes = obj ? new Uint8Array(await obj.arrayBuffer()) : null;
    const type = bytes && imageType(bytes);
    if (!bytes || !type) return c.json({ error: 'introuvable' }, 404);
    return c.body(bytes, 200, { 'content-type': type, 'cache-control': 'private, no-store' });
  });

  /** Recherche par code ami (exact) ou par pseudo (comptes qui l'acceptent). */
  r.get('/search', async (c) => {
    const me = c.get('device').userId;
    const q = (c.req.query('q') ?? '').replace(/\s+/g, ' ').trim();
    if ([...q].length < 2 || q.length > 32) return c.json({ users: [] });
    const code = normCode(q);
    const byCode = code
      ? await db.select({ id: social.userId }).from(social).where(and(eq(social.code, code), eq(social.enabled, true)))
      : [];
    const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const byName = await db
      .select({ id: user.id })
      .from(user)
      .innerJoin(social, eq(social.userId, user.id))
      .where(
        and(
          eq(social.enabled, true),
          eq(social.findable, true),
          ne(user.id, me),
          sql`${user.name} like ${`%${escaped}%`} escape '\\'`
        )
      )
      .limit(20);
    const ids = [...new Set([...byCode, ...byName].map((x) => x.id))].filter((id) => id !== me);
    const rels = new Map<string, Relation>();
    for (const id of ids) rels.set(id, await relation(me, id));
    const ok = ids.filter((id) => !['blocked', 'blockedBy'].includes(rels.get(id)!));
    return c.json({ users: await cards(ok, rels) });
  });

  // --- Amis ---

  r.get('/friends', async (c) => {
    const me = c.get('device').userId;
    const rows = await db.select().from(friends).where(eq(friends.userId, me));
    const rels = new Map(rows.map((x) => [x.otherId, (x.state === 'blocked' ? 'blocked' : x.state) as Relation]));
    const all = await cards([...rels.keys()], rels);
    const since = new Map(rows.map((x) => [x.otherId, x.since]));
    const pick = (rel: Relation) => all.filter((x) => x.relation === rel).map((x) => ({ ...x, since: since.get(x.id) ?? 0 }));
    return c.json({ friends: pick('friend'), incoming: pick('in'), outgoing: pick('out'), blocked: pick('blocked') });
  });

  /** Demande d'ami, ou acceptation d'une demande reçue. */
  r.post('/friends/:id', async (c) => {
    const me = c.get('device').userId;
    const id = c.req.param('id');
    if (!(await meOn(me))) return c.json({ error: 'amis_desactives' }, 403);
    const found = await reachable(me, id);
    if (!found || found.rel === 'self' || !found.row?.enabled) return c.json({ error: 'introuvable' }, 404);
    const now = Date.now();
    if (found.rel === 'friend' || found.rel === 'out') return c.json({ ok: true, relation: found.rel });
    if (found.rel === 'in') {
      await db.batch([
        db.update(friends).set({ state: 'friend', since: now }).where(and(eq(friends.userId, me), eq(friends.otherId, id))),
        db.update(friends).set({ state: 'friend', since: now }).where(and(eq(friends.userId, id), eq(friends.otherId, me)))
      ]);
      await hub([id], { type: 'accepted', from: await who(me) });
      await hub([me], { type: 'friends' });
      await pushPresence(db, hub, me);
      await hub([me], { type: 'presence', id, presence: presence(found.row, 'friend') });
      return c.json({ ok: true, relation: 'friend' });
    }
    const [{ pending }] = await db
      .select({ pending: sql<number>`count(*)` })
      .from(friends)
      .where(and(eq(friends.userId, me), eq(friends.state, 'out')));
    const [{ recent }] = await db
      .select({ recent: sql<number>`count(*)` })
      .from(friends)
      .where(and(eq(friends.userId, me), eq(friends.state, 'out'), gt(friends.since, now - 3_600_000)));
    if (pending >= MAX_PENDING || recent >= REQUESTS_PER_HOUR) return c.json({ error: 'trop' }, 429);
    await db.batch([
      db.insert(friends).values({ userId: me, otherId: id, state: 'out', since: now }),
      db.insert(friends).values({ userId: id, otherId: me, state: 'in', since: now })
    ]);
    await hub([id], { type: 'request', from: await who(me) });
    await hub([me], { type: 'friends' });
    return c.json({ ok: true, relation: 'out' });
  });

  /** Retire un ami, annule une demande envoyée ou refuse une demande reçue. */
  r.delete('/friends/:id', async (c) => {
    const me = c.get('device').userId;
    const id = c.req.param('id');
    const live = ['friend', 'in', 'out'];
    await db.batch([
      db.delete(friends).where(and(eq(friends.userId, me), eq(friends.otherId, id), inArray(friends.state, live))),
      db.delete(friends).where(and(eq(friends.userId, id), eq(friends.otherId, me), inArray(friends.state, live)))
    ]);
    await hub([id, me], { type: 'friends' });
    return c.json({ ok: true });
  });

  r.post('/blocks/:id', async (c) => {
    const me = c.get('device').userId;
    const id = c.req.param('id');
    if (!isUserId(id) || id === me) return c.json({ error: 'requete' }, 400);
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, id));
    if (!u) return c.json({ error: 'introuvable' }, 404);
    await db.batch([
      db.delete(friends).where(and(eq(friends.userId, id), eq(friends.otherId, me), ne(friends.state, 'blocked'))),
      db
        .insert(friends)
        .values({ userId: me, otherId: id, state: 'blocked', since: Date.now() })
        .onConflictDoUpdate({ target: [friends.userId, friends.otherId], set: { state: 'blocked', since: Date.now() } })
    ]);
    await hub([id, me], { type: 'friends' });
    return c.json({ ok: true });
  });

  r.delete('/blocks/:id', async (c) => {
    const me = c.get('device').userId;
    await db
      .delete(friends)
      .where(and(eq(friends.userId, me), eq(friends.otherId, c.req.param('id')), eq(friends.state, 'blocked')));
    await hub([me], { type: 'friends' });
    return c.json({ ok: true });
  });

  // --- Présence et activité ---

  /** Jeu en cours de ce poste (null : plus aucun). Un jeu lancé entre dans l'activité. */
  r.put('/presence', async (c) => {
    const me = c.get('device').userId;
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body) || !('game' in body)) return c.json({ error: 'requete' }, 400);
    const g = body.game === null ? null : game(body.game);
    if (body.game !== null && !g) return c.json({ error: 'requete' }, 400);
    const row = await ensureSocial(db, me);
    if (!row.enabled) return c.json({ ok: true });
    const now = Date.now();
    const prev = parse<{ id: string; since: number } | null>(row.playing, null);
    const playing = g ? { ...g, since: prev?.id === g.id ? prev.since : now } : null;
    await db.update(social).set({ playing: playing && JSON.stringify(playing), seen: now }).where(eq(social.userId, me));
    if (g && prev?.id !== g.id) {
      const [last] = await db
        .select()
        .from(activity)
        .where(and(eq(activity.userId, me), eq(activity.kind, 'play')))
        .orderBy(desc(activity.at))
        .limit(1);
      if (!last || parse<Game | null>(last.data, null)?.id !== g.id || now - last.at > PLAY_AGAIN) {
        await db.insert(activity).values({ id: newId(), userId: me, kind: 'play', data: JSON.stringify(g), at: now });
      }
    }
    await pushPresence(db, hub, me);
    return c.json({ ok: true });
  });

  /** Nouveaux jeux dans la bibliothèque : une ligne d'activité par envoi. */
  r.post('/activity', async (c) => {
    const me = c.get('device').userId;
    const body: unknown = await c.req.json().catch(() => null);
    const list = isObject(body) && Array.isArray(body.added) ? body.added : null;
    if (!list || !list.length || list.length > 500) return c.json({ error: 'requete' }, 400);
    const games = list.map(game);
    if (games.some((g) => !g)) return c.json({ error: 'requete' }, 400);
    const row = await ensureSocial(db, me);
    if (!row.enabled) return c.json({ ok: true });
    const now = Date.now();
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(activity)
      .where(and(eq(activity.userId, me), eq(activity.kind, 'added'), gt(activity.at, now - 3_600_000)));
    if (n >= ADDED_PER_HOUR) return c.json({ error: 'trop' }, 429);
    const data = JSON.stringify({ games: games.slice(0, 8), count: games.length });
    await db.insert(activity).values({ id: newId(), userId: me, kind: 'added', data, at: Date.now() });
    const ids = await friendIds(db, me);
    if (ids.length && row.libraryVis !== 'none') await hub(ids, { type: 'activity' });
    return c.json({ ok: true });
  });

  /** Activité des amis, la plus récente d'abord, selon ce que chacun partage. */
  r.get('/activity', async (c) => {
    const me = c.get('device').userId;
    const ids = await friendIds(db, me);
    if (!ids.length) return c.json({ items: [] });
    const rows = await db.select().from(social).where(and(inArray(social.userId, ids), eq(social.enabled, true)));
    const vis = new Map(rows.map((x) => [x.userId, x]));
    const items = await db
      .select({ a: activity, name: user.name })
      .from(activity)
      .innerJoin(user, eq(user.id, activity.userId))
      .where(inArray(activity.userId, [...vis.keys()].length ? [...vis.keys()] : ['-']))
      .orderBy(desc(activity.at))
      .limit(200);
    const shown = items
      .filter(({ a }) => {
        const v = vis.get(a.userId)!;
        return sees(a.kind === 'play' ? v.gameVis : v.libraryVis, 'friend');
      })
      .slice(0, PAGE)
      .map(({ a, name }) => ({ ...activityView(a), userId: a.userId, userName: name.trim() || 'Joueur' }));
    return c.json({ items: shown });
  });

  // --- Messages ---

  type MessageRow = typeof messages.$inferSelect;
  const open = async (m: MessageRow) => {
    const payload = parse<{ text?: string; game?: Game }>(
      await unseal(env.SECRETS_KEY, `msg:${m.id}`, m.body, m.nonce).catch(() => null),
      {}
    );
    return { id: m.id, from: m.fromId, to: m.toId, kind: m.kind, text: payload.text ?? '', game: payload.game ?? null, at: m.at, readAt: m.readAt };
  };

  r.get('/conversations', async (c) => {
    const me = c.get('device').userId;
    const mine = or(eq(messages.fromId, me), eq(messages.toId, me));
    const lasts = await db
      .select({ convo: messages.convo, at: sql<number>`max(${messages.at})` })
      .from(messages)
      .where(mine)
      .groupBy(messages.convo)
      .orderBy(desc(sql`max(${messages.at})`))
      .limit(PAGE);
    const unread = await db
      .select({ from: messages.fromId, n: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.toId, me), isNull(messages.readAt)))
      .groupBy(messages.fromId);
    const counts = new Map(unread.map((u) => [u.from, u.n]));
    const out = [];
    for (const l of lasts) {
      const [m] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.convo, l.convo), eq(messages.at, l.at)))
        .limit(1);
      if (!m) continue;
      const other = m.fromId === me ? m.toId : m.fromId;
      // Comme GET /messages/:id : rien d'un compte bloqué (dans un sens ou dans l'autre).
      const rel = await relation(me, other);
      if (rel === 'blocked' || rel === 'blockedBy') continue;
      out.push({ with: other, last: await open(m), unread: counts.get(other) ?? 0 });
    }
    return c.json({ conversations: out });
  });

  r.get('/messages/:id', async (c) => {
    const me = c.get('device').userId;
    const id = c.req.param('id');
    const before = Number(c.req.query('before') ?? 0);
    const rel = await relation(me, id);
    if (!isUserId(id) || rel === 'blocked' || rel === 'blockedBy') return c.json({ messages: [], more: false });
    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.convo, convoOf(me, id)), before > 0 ? lt(messages.at, before) : undefined))
      .orderBy(desc(messages.at))
      .limit(PAGE + 1);
    const more = rows.length > PAGE;
    const list = await Promise.all(rows.slice(0, PAGE).reverse().map(open));
    return c.json({ messages: list, more });
  });

  /** Message texte ou invitation sur un jeu, entre amis seulement. */
  r.post('/messages/:id', async (c) => {
    const me = c.get('device').userId;
    const id = c.req.param('id');
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body)) return c.json({ error: 'requete' }, 400);
    const invite = 'game' in body ? game(body.game) : null;
    const msg = invite ? null : text(body.text, MAX_TEXT);
    if (!invite && !msg) return c.json({ error: 'requete' }, 400);
    if (!(await meOn(me)) || (await relation(me, id)) !== 'friend') return c.json({ error: 'pas_ami' }, 403);
    // Un ami qui a désactivé les amis ne reçoit plus rien.
    const [them] = await db.select({ enabled: social.enabled }).from(social).where(eq(social.userId, id));
    if (!them?.enabled) return c.json({ error: 'pas_ami' }, 403);
    const now = Date.now();
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.fromId, me), gt(messages.at, now - 60_000)));
    if (n >= MESSAGES_PER_MINUTE) return c.json({ error: 'trop' }, 429);
    const mid = newId();
    const payload = invite ? { game: invite } : { text: msg };
    const sealed = await seal(env.SECRETS_KEY, `msg:${mid}`, JSON.stringify(payload));
    const row = {
      id: mid,
      convo: convoOf(me, id),
      fromId: me,
      toId: id,
      kind: invite ? 'invite' : 'text',
      body: sealed.value,
      nonce: sealed.nonce,
      at: now,
      readAt: null
    };
    await db.insert(messages).values(row);
    const view = await open(row);
    await hub([id, me], { type: 'message', message: view, from: await who(me) });
    return c.json({ message: view });
  });

  r.post('/messages/:id/read', async (c) => {
    const me = c.get('device').userId;
    const id = c.req.param('id');
    const now = Date.now();
    const done = await db
      .update(messages)
      .set({ readAt: now })
      .where(and(eq(messages.convo, convoOf(me, id)), eq(messages.toId, me), isNull(messages.readAt)))
      .returning({ id: messages.id });
    if (done.length) await hub([me, id], { type: 'read', by: me, with: id, at: now });
    return c.json({ ok: true });
  });

  // --- Signalements ---

  r.post('/reports', async (c) => {
    const me = c.get('device').userId;
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body) || typeof body.userId !== 'string' || !isUserId(body.userId) || body.userId === me) {
      return c.json({ error: 'requete' }, 400);
    }
    if (!REASONS.includes(body.reason as string)) return c.json({ error: 'requete' }, 400);
    const now = Date.now();
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(reports)
      .where(and(eq(reports.reporterId, me), gt(reports.at, now - 86_400_000)));
    if (n >= REPORTS_PER_DAY) return c.json({ error: 'trop' }, 429);
    let excerpt: string | null = null;
    let messageId: string | null = null;
    if (typeof body.messageId === 'string') {
      const [m] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.id, body.messageId), eq(messages.fromId, body.userId), eq(messages.toId, me)));
      if (!m) return c.json({ error: 'introuvable' }, 404);
      const v = await open(m);
      messageId = m.id;
      excerpt = v.kind === 'invite' ? `Invitation : ${v.game?.name ?? ''}` : v.text;
    }
    const note = text(body.note, 500);
    const row = {
      id: newId(),
      reporterId: me,
      targetId: body.userId,
      messageId,
      excerpt,
      reason: note ? `${body.reason} : ${note}` : (body.reason as string),
      at: now,
      status: 'ouvert',
      handledAt: null
    };
    await db.insert(reports).values(row);
    await notifyReport(db, env, row);
    return c.json({ ok: true });
  });

  // --- Connexion temps réel ---

  r.get('/live', async (c) => {
    const me = c.get('device').userId;
    if (!env.LIVE) return c.json({ error: 'indisponible' }, 503);
    if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') return c.json({ error: 'websocket' }, 426);
    if (!(await meOn(me))) return c.json({ error: 'amis_desactives' }, 403);
    const stub = env.LIVE.get(env.LIVE.idFromName(me));
    const headers = new Headers(c.req.raw.headers);
    headers.set('x-hangar-user', me);
    headers.delete('authorization');
    return stub.fetch(new Request('https://live/connect', { headers }));
  });

  return r;
}

function activityView(a: typeof activity.$inferSelect) {
  return { id: a.id, kind: a.kind, at: a.at, data: parse<Record<string, unknown>>(a.data, {}) };
}

/** Partie sociale de l'export (RGPD) : réglages, liens, activité, messages en clair. */
export async function exportSocial(db: Db, env: Env, me: string) {
  const [row] = await db.select().from(social).where(eq(social.userId, me));
  const links = await db
    .select({ id: friends.otherId, state: friends.state, since: friends.since, name: user.name })
    .from(friends)
    .leftJoin(user, eq(user.id, friends.otherId))
    .where(eq(friends.userId, me));
  const acts = await db.select().from(activity).where(eq(activity.userId, me)).orderBy(asc(activity.at));
  const msgs = await db
    .select()
    .from(messages)
    .where(or(eq(messages.fromId, me), eq(messages.toId, me)))
    .orderBy(asc(messages.at));
  const opened = [];
  for (const m of msgs) {
    const plain = await unseal(env.SECRETS_KEY, `msg:${m.id}`, m.body, m.nonce).catch(() => null);
    opened.push({ from: m.fromId === me ? 'moi' : m.fromId, to: m.toId === me ? 'moi' : m.toId, kind: m.kind, content: parse(plain, null), at: m.at, readAt: m.readAt });
  }
  return {
    settings: row
      ? {
          enabled: row.enabled,
          code: row.code,
          findable: row.findable,
          privacy: { status: row.statusVis, game: row.gameVis, play: row.playVis, library: row.libraryVis },
          showcase: parse(row.showcase, null)
        }
      : null,
    badges: (await heldBadges(db, me)).map((b) => b.id),
    friends: links.map((l) => ({ id: l.id, name: l.name, state: l.state, since: l.since })),
    activity: acts.map(activityView),
    messages: opened
  };
}
