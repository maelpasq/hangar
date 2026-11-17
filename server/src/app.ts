// API du compte Hangar (docs/COMPTE.md, section 8). L'app s'identifie par un jeton de poste
// (`Authorization: Bearer`), obtenu après la connexion dans le navigateur.
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createAuth, providers, resendMailer } from './auth';
import { BACKGROUND_WEBP } from './background';
import { type Keys } from './admin/access';
import { adminRoutes } from './admin/routes';
import { bugRoute } from './bug';
import { hashToken, pkceChallenge, randomToken, seal, unseal } from './crypto';
import type { Db, Env, Mailer } from './env';
import { GEIST_WOFF2 } from './font';
import { loginPage, pageHeaders, statusPage } from './login-page';
import { deleteAccount } from './lifecycle';
import { LOGO_PNG } from './logo';
import {
  AVATAR_MAX,
  COVER_HASH,
  COVER_MAX,
  MAX_COVERS,
  avatarKey,
  coverKey,
  avatarVersion,
  cleanName,
  imageType,
  providerAvatar,
  sha256Hex
} from './profile';
import { covers, devices, entries, gameSessions, loginCodes, profiles, secrets, session, user } from './schema';
import { type Hub, exportSocial, socialRoutes } from './social';

/** Changements par envoi ; une page de lecture en contient au plus le double (voir `page`). */
const MAX_CHANGES = 1000;
const PAGE = MAX_CHANGES * 2;
const MAX_KEY = 512;
const MAX_VALUE = 16 * 1024;
/** Éléments par compte : garde-fou contre un client fou, très au-dessus d'une vraie bibliothèque. */
const MAX_ENTRIES = 50_000;
/** Sessions de jeu par compte : même garde-fou (dix parties par jour pendant plus de 50 ans). */
const MAX_SESSIONS = 200_000;
const CODE_TTL = 2 * 60_000;
const DEVICE_ID = /^[0-9a-f]{32}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const STATE = /^[A-Za-z0-9_-]{8,128}$/;
const KEY = /^[a-z]+:.+$/s;
// Clé SteamGridDB, et connexions des launchers partagées entre les postes (clé Steam, jetons).
const SECRET_NAMES = ['steamgriddb', 'compte-steam', 'compte-gog', 'compte-epic', 'compte-xbox'];
const bytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const FONT = bytes(GEIST_WOFF2);
const LOGO = bytes(LOGO_PNG);
const BACKGROUND = bytes(BACKGROUND_WEBP);

type Device = typeof devices.$inferSelect;
type Vars = { Variables: { device: Device } };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

/** Retour vers l'app : uniquement l'adresse locale, sur le port qu'elle a ouvert. */
function loopback(q: URLSearchParams): { port: number; challenge: string; state: string } | null {
  const port = Number(q.get('port'));
  const challenge = q.get('challenge') ?? '';
  const state = q.get('state') ?? '';
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
  if (!CHALLENGE.test(challenge) || !STATE.test(state)) return null;
  return { port, challenge, state };
}

/**
 * Garde des pages entières : `rows` (triées par `seq`) en contient une de trop si la suite existe.
 * Les lignes d'un même envoi partagent leur `seq` : un groupe coupé est laissé à la page suivante.
 */
function page<T extends { seq: number }>(rows: T[], current: number): { rows: T[]; cursor: number; more: boolean } {
  if (rows.length <= PAGE) return { rows, cursor: current, more: false };
  const cut = rows[PAGE].seq;
  const kept = rows.filter((r) => r.seq < cut);
  return { rows: kept, cursor: kept[kept.length - 1].seq, more: true };
}

export function createApp(
  db: Db,
  env: Env,
  sendMail: Mailer = resendMailer(env),
  hub: Hub = async () => {},
  accessKeys?: Keys
) {
  const auth = createAuth(db, env, sendMail);
  const app = new Hono<Vars>();

  // Dashboard d'administration : sa propre adresse, rien d'autre n'y répond (src/admin/routes.ts).
  let admin: ReturnType<typeof adminRoutes> | undefined;
  app.use('*', async (c, next) => {
    if (env.ADMIN_HOST && new URL(c.req.url).hostname === env.ADMIN_HOST) {
      admin ??= adminRoutes(db, env, { hub, loadAvatar, keys: accessKeys });
      return admin.fetch(c.req.raw);
    }
    await next();
  });

  app.onError((err, c) => {
    console.error('[hangar]', err);
    return c.json({ error: 'erreur' }, 500);
  });
  app.notFound((c) => c.json({ error: 'introuvable' }, 404));
  // Les jaquettes et les signalements de bug ont leur propre limite (`PUT /covers/:hash`, `POST /bug`).
  const limit = bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: 'trop_gros' }, 413) });
  app.use('*', (c, next) => (c.req.path.startsWith('/covers/') || c.req.path === '/bug' ? next() : limit(c, next)));

  app.get('/', (c) => c.json({ name: 'Hangar', ok: true }));

  // Signalement de bug, avec ou sans compte (src/bug.ts).
  app.route('/bug', bugRoute(db, env));

  // --- Profil (pseudo, avatar) ---

  const bucket = env.AVATARS;

  /** Version de l'avatar d'un compte (l'app le retélécharge quand elle change), ou null. */
  const avatarOf = async (image: string | null): Promise<string | null> => {
    if (!bucket || !image) return null;
    if (image.startsWith('r2:')) return image.slice(3);
    const url = providerAvatar(image);
    return url ? `p${(await hashToken(url)).slice(0, 12)}` : null;
  };

  /** Avatar d'un compte : celui de R2, ou celui du service de connexion, copié dans R2 au passage. */
  const loadAvatar = async (u: { id: string; image: string | null }) => {
    if (!bucket || !u.image) return null;
    if (u.image.startsWith('r2:')) {
      const obj = await bucket.get(avatarKey(u.id));
      const bytes = obj ? new Uint8Array(await obj.arrayBuffer()) : null;
      const type = bytes && imageType(bytes);
      return bytes && type ? { type, bytes } : null;
    }
    const url = providerAvatar(u.image);
    // `manual` : une redirection n'est pas suivie et compte comme un échec (Workers refuse `error`).
    const res = url ? await fetch(url, { redirect: 'manual' }).catch(() => null) : null;
    if (!res?.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const type = imageType(bytes);
    if (!type || bytes.length > AVATAR_MAX) return null;
    await bucket.put(avatarKey(u.id), bytes, { httpMetadata: { contentType: type } });
    await db
      .update(user)
      .set({ image: `r2:${avatarVersion()}`, updatedAt: new Date() })
      .where(and(eq(user.id, u.id), eq(user.image, u.image)));
    return { type, bytes };
  };

  // --- Connexion (navigateur) ---

  app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));

  app.get('/login', (c) => {
    const nonce = randomToken();
    const ok = loopback(new URL(c.req.url).searchParams);
    const html = ok ? loginPage(nonce, providers(env)) : statusPage(nonce, 'invalid');
    return c.body(html, ok ? 200 : 400, pageHeaders(nonce));
  });

  /** Fin de la connexion : l'app y renvoie le navigateur une fois le code reçu sur son adresse locale. */
  for (const end of ['done', 'refused'] as const) {
    app.get(`/login/${end}`, (c) => {
      const nonce = randomToken();
      return c.body(statusPage(nonce, end), 200, pageHeaders(nonce));
    });
  }

  app.get('/login/logo.png', (c) =>
    c.body(LOGO, 200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' })
  );

  app.get('/login/fond.webp', (c) =>
    c.body(BACKGROUND, 200, { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' })
  );

  app.get('/login/geist.woff2', (c) =>
    c.body(FONT, 200, { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=31536000, immutable' })
  );

  /** Connectée dans le navigateur : rend un code à usage unique à l'app, sur son adresse locale. */
  app.get('/desktop/finish', async (c) => {
    const url = new URL(c.req.url);
    const target = loopback(url.searchParams);
    const current = target ? await auth.api.getSession({ headers: c.req.raw.headers }) : null;
    if (!target || !current) return c.redirect(`/login${url.search}`, 302);
    const code = randomToken();
    const now = Date.now();
    await db.batch([
      db.delete(loginCodes).where(sql`${loginCodes.expiresAt} < ${now}`),
      db.insert(loginCodes).values({
        codeHash: await hashToken(code),
        userId: current.user.id,
        challenge: target.challenge,
        expiresAt: now + CODE_TTL
      }),
      // La session du navigateur a fait son travail : le poste aura son propre jeton.
      db.delete(session).where(eq(session.id, current.session.id))
    ]);
    return c.redirect(`http://127.0.0.1:${target.port}/?code=${code}&state=${target.state}`, 302);
  });

  /** L'app échange le code (et le vérifieur PKCE) contre le jeton de ce poste. */
  app.post('/desktop/token', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body)) return c.json({ error: 'requete' }, 400);
    const code = str(body.code, 128);
    const verifier = str(body.verifier, 128);
    const deviceId = str(body.deviceId, 32);
    const name = str(typeof body.deviceName === 'string' ? body.deviceName.trim() : null, 60) ?? 'PC';
    if (!code || !verifier || !deviceId || !DEVICE_ID.test(deviceId)) return c.json({ error: 'requete' }, 400);

    const [row] = await db
      .delete(loginCodes)
      .where(eq(loginCodes.codeHash, await hashToken(code)))
      .returning();
    if (!row || row.expiresAt < Date.now() || row.challenge !== (await pkceChallenge(verifier))) {
      return c.json({ error: 'code' }, 401);
    }
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const now = Date.now();
    await db.batch([
      db.insert(profiles).values({ userId: row.userId, createdAt: now }).onConflictDoNothing(),
      db
        .insert(devices)
        .values({ userId: row.userId, deviceId, name, tokenHash, createdAt: now, lastSeen: now })
        .onConflictDoUpdate({ target: [devices.userId, devices.deviceId], set: { name, tokenHash, lastSeen: now } })
    ]);
    return c.json({ token });
  });

  // --- Tout le reste demande le jeton du poste ---

  const api = new Hono<Vars>();

  api.use('*', async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const [device] = token
      ? await db
          .select()
          .from(devices)
          .where(eq(devices.tokenHash, await hashToken(token)))
      : [];
    if (!device) return c.json({ error: 'non_connecte' }, 401);
    const now = Date.now();
    if (now - device.lastSeen > 3_600_000) {
      await db
        .update(devices)
        .set({ lastSeen: now })
        .where(and(eq(devices.userId, device.userId), eq(devices.deviceId, device.deviceId)));
    }
    c.set('device', device);
    await next();
  });

  const deviceList = async (me: Device) =>
    (await db.select().from(devices).where(eq(devices.userId, me.userId)).orderBy(asc(devices.createdAt))).map((d) => ({
      id: d.deviceId,
      name: d.name,
      createdAt: d.createdAt,
      lastSeen: d.lastSeen,
      connected: d.tokenHash !== null,
      current: d.deviceId === me.deviceId
    }));

  api.get('/me', async (c) => {
    const me = c.get('device');
    const [u] = await db.select().from(user).where(eq(user.id, me.userId));
    if (!u) return c.json({ error: 'non_connecte' }, 401);
    return c.json({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        image: u.image,
        avatar: await avatarOf(u.image),
        createdAt: u.createdAt.getTime()
      },
      devices: await deviceList(me)
    });
  });

  /** Pseudo du profil. */
  api.put('/me', async (c) => {
    const me = c.get('device');
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body)) return c.json({ error: 'requete' }, 400);
    const name = 'name' in body ? cleanName(body.name) : undefined;
    if (name === null) return c.json({ error: 'pseudo' }, 400);
    if (name) await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, me.userId));
    return c.json({ ok: true });
  });

  api.get('/me/avatar', async (c) => {
    const me = c.get('device');
    const [u] = await db.select({ id: user.id, image: user.image }).from(user).where(eq(user.id, me.userId));
    const pic = u ? await loadAvatar(u) : null;
    if (!pic) return c.json({ error: 'introuvable' }, 404);
    return c.body(pic.bytes, 200, { 'content-type': pic.type, 'cache-control': 'private, no-store' });
  });

  /** Avatar envoyé par l'app : un carré déjà réduit, PNG, JPEG ou WebP. */
  api.put('/me/avatar', async (c) => {
    const me = c.get('device');
    if (!bucket) return c.json({ error: 'indisponible' }, 503);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const type = imageType(bytes);
    if (bytes.length > AVATAR_MAX) return c.json({ error: 'trop_gros' }, 413);
    if (!type || type === 'image/gif') return c.json({ error: 'image' }, 400);
    await bucket.put(avatarKey(me.userId), bytes, { httpMetadata: { contentType: type } });
    const version = avatarVersion();
    await db.update(user).set({ image: `r2:${version}`, updatedAt: new Date() }).where(eq(user.id, me.userId));
    return c.json({ ok: true, avatar: version });
  });

  api.delete('/me/avatar', async (c) => {
    const me = c.get('device');
    await bucket?.delete(avatarKey(me.userId));
    await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, me.userId));
    return c.json({ ok: true });
  });

  /** Déconnecte ce poste. Ses données restent sur le compte et sur le poste. */
  api.post('/logout', async (c) => {
    const me = c.get('device');
    await db
      .update(devices)
      .set({ tokenHash: null })
      .where(and(eq(devices.userId, me.userId), eq(devices.deviceId, me.deviceId)));
    return c.json({ ok: true });
  });

  api.put('/devices/:id', async (c) => {
    const me = c.get('device');
    const body: unknown = await c.req.json().catch(() => null);
    const name = isObject(body) && typeof body.name === 'string' ? str(body.name.trim(), 60) : null;
    if (!name) return c.json({ error: 'requete' }, 400);
    const done = await db
      .update(devices)
      .set({ name })
      .where(and(eq(devices.userId, me.userId), eq(devices.deviceId, c.req.param('id'))))
      .returning({ id: devices.deviceId });
    return done.length ? c.json({ ok: true }) : c.json({ error: 'introuvable' }, 404);
  });

  /** Déconnecte un autre poste à distance (PC perdu ou vendu). */
  api.delete('/devices/:id', async (c) => {
    const me = c.get('device');
    const done = await db
      .update(devices)
      .set({ tokenHash: null })
      .where(and(eq(devices.userId, me.userId), eq(devices.deviceId, c.req.param('id'))))
      .returning({ id: devices.deviceId });
    return done.length ? c.json({ ok: true }) : c.json({ error: 'introuvable' }, 404);
  });

  // --- Synchro ---

  const since = (raw: string | undefined): number | null => {
    const n = Number(raw ?? 0);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  };
  const cursorOf = db
    .select({ cursor: profiles.cursor })
    .from(profiles)
    .where(eq(profiles.userId, sql.placeholder('user')))
    .prepare();
  const nextSeq = (userId: string) => sql`(select ${profiles.cursor} from ${profiles} where ${profiles.userId} = ${userId})`;
  const bump = (userId: string) =>
    db
      .update(profiles)
      .set({ cursor: sql`${profiles.cursor} + 1` })
      .where(eq(profiles.userId, userId))
      .returning({ cursor: profiles.cursor });

  api.get('/sync', async (c) => {
    const me = c.get('device');
    const from = since(c.req.query('since'));
    if (from === null) return c.json({ error: 'requete' }, 400);
    // Le curseur est lu avant les lignes : au pire, la fois suivante relit quelques lignes.
    const [current] = await cursorOf.all({ user: me.userId });
    const rows = await db
      .select()
      .from(entries)
      .where(and(eq(entries.userId, me.userId), gt(entries.seq, from)))
      .orderBy(asc(entries.seq))
      .limit(PAGE + 1);
    const p = page(rows, current?.cursor ?? 0);
    return c.json({
      cursor: p.cursor,
      more: p.more,
      changes: p.rows.map((r) => ({
        key: r.key,
        value: r.deleted ? null : r.value,
        updatedAt: r.updatedAt,
        deviceId: r.deviceId
      }))
    });
  });

  /** Envoi groupé. La modification la plus récente gagne, élément par élément. */
  api.post('/sync', async (c) => {
    const me = c.get('device');
    const body: unknown = await c.req.json().catch(() => null);
    const list = isObject(body) && Array.isArray(body.changes) ? body.changes : null;
    if (!list || list.length > MAX_CHANGES) return c.json({ error: 'requete' }, 400);
    const now = Date.now();
    const rows = new Map<string, Omit<typeof entries.$inferInsert, 'seq'>>();
    for (const ch of list as unknown[]) {
      if (!isObject(ch)) return c.json({ error: 'requete' }, 400);
      const key = str(ch.key, MAX_KEY);
      const deleted = ch.value === null;
      const value = deleted ? null : str(ch.value, MAX_VALUE);
      if (!key || !KEY.test(key) || (!deleted && value === null) || !isTime(ch.updatedAt)) {
        return c.json({ error: 'requete' }, 400);
      }
      // Une horloge en avance ne doit pas gagner pour toujours : jamais plus tard que maintenant.
      const updatedAt = Math.min(ch.updatedAt, now);
      const prev = rows.get(key);
      if (prev && prev.updatedAt >= updatedAt) continue;
      rows.set(key, { userId: me.userId, key, value, updatedAt, deviceId: me.deviceId, deleted });
    }
    if (!rows.size) {
      const [current] = await cursorOf.all({ user: me.userId });
      return c.json({ cursor: current?.cursor ?? 0 });
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(entries)
      .where(eq(entries.userId, me.userId));
    if (count + rows.size > MAX_ENTRIES) return c.json({ error: 'plein' }, 413);
    const [bumped] = await db.batch([
      bump(me.userId),
      db
        .insert(entries)
        .values([...rows.values()].map((r) => ({ ...r, seq: nextSeq(me.userId) })))
        .onConflictDoUpdate({
          target: [entries.userId, entries.key],
          set: {
            value: sql`excluded.value`,
            updatedAt: sql`excluded.updated_at`,
            deviceId: sql`excluded.device_id`,
            deleted: sql`excluded.deleted`,
            seq: sql`excluded.seq`
          },
          setWhere: sql`excluded.updated_at > ${entries.updatedAt}`
        })
    ]);
    return c.json({ cursor: bumped[0]?.cursor ?? 0 });
  });

  // --- Sessions de jeu ---

  api.get('/sessions', async (c) => {
    const me = c.get('device');
    const from = since(c.req.query('since'));
    if (from === null) return c.json({ error: 'requete' }, 400);
    const [current] = await cursorOf.all({ user: me.userId });
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.userId, me.userId), gt(gameSessions.seq, from)))
      .orderBy(asc(gameSessions.seq))
      .limit(PAGE + 1);
    const p = page(rows, current?.cursor ?? 0);
    return c.json({
      cursor: p.cursor,
      more: p.more,
      sessions: p.rows.map((r) => ({ id: r.id, gameId: r.gameId, start: r.start, end: r.end, deviceId: r.deviceId }))
    });
  });

  /** Ajout seulement : une session déjà connue (même identifiant) est ignorée. */
  api.post('/sessions', async (c) => {
    const me = c.get('device');
    const body: unknown = await c.req.json().catch(() => null);
    const list = isObject(body) && Array.isArray(body.sessions) ? body.sessions : null;
    if (!list || list.length > MAX_CHANGES) return c.json({ error: 'requete' }, 400);
    const rows = new Map<string, Omit<typeof gameSessions.$inferInsert, 'seq'>>();
    for (const s of list as unknown[]) {
      if (!isObject(s)) return c.json({ error: 'requete' }, 400);
      const id = str(s.id, 64);
      const gameId = str(s.gameId, MAX_KEY);
      if (!id || !gameId || !isTime(s.start) || !isTime(s.end) || s.end < s.start) {
        return c.json({ error: 'requete' }, 400);
      }
      rows.set(id, { userId: me.userId, id, gameId, start: s.start, end: s.end, deviceId: me.deviceId });
    }
    if (!rows.size) {
      const [current] = await cursorOf.all({ user: me.userId });
      return c.json({ cursor: current?.cursor ?? 0 });
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(gameSessions)
      .where(eq(gameSessions.userId, me.userId));
    if (count + rows.size > MAX_SESSIONS) return c.json({ error: 'plein' }, 413);
    const [bumped] = await db.batch([
      bump(me.userId),
      db
        .insert(gameSessions)
        .values([...rows.values()].map((r) => ({ ...r, seq: nextSeq(me.userId) })))
        .onConflictDoNothing()
    ]);
    return c.json({ cursor: bumped[0]?.cursor ?? 0 });
  });

  // --- Secrets (clé SteamGridDB, connexions des launchers), chiffrés au repos, hors de la synchro et de l'export ---

  const secretName = (name: string) => (SECRET_NAMES.includes(name) ? name : null);
  const secretOf = (me: Device, name: string) => and(eq(secrets.userId, me.userId), eq(secrets.name, name));

  api.get('/secrets/:name', async (c) => {
    const me = c.get('device');
    const name = secretName(c.req.param('name'));
    const [row] = name ? await db.select().from(secrets).where(secretOf(me, name)) : [];
    if (!name || !row) return c.json({ error: 'introuvable' }, 404);
    const value = await unseal(env.SECRETS_KEY, `${me.userId}:${name}`, row.value, row.nonce);
    return c.json({ value, updatedAt: row.updatedAt });
  });

  api.put('/secrets/:name', async (c) => {
    const me = c.get('device');
    const name = secretName(c.req.param('name'));
    const body: unknown = await c.req.json().catch(() => null);
    // Jeton de rafraîchissement Microsoft : jusqu'à quelques milliers de caractères.
    const plain = isObject(body) ? str(body.value, 4096) : null;
    if (!name) return c.json({ error: 'introuvable' }, 404);
    if (!plain) return c.json({ error: 'requete' }, 400);
    const sealed = await seal(env.SECRETS_KEY, `${me.userId}:${name}`, plain);
    const updatedAt = Date.now();
    await db
      .insert(secrets)
      .values({ userId: me.userId, name, ...sealed, updatedAt })
      .onConflictDoUpdate({ target: [secrets.userId, secrets.name], set: { ...sealed, updatedAt } });
    return c.json({ ok: true, updatedAt });
  });

  api.delete('/secrets/:name', async (c) => {
    const me = c.get('device');
    const name = secretName(c.req.param('name'));
    if (!name) return c.json({ error: 'introuvable' }, 404);
    await db.delete(secrets).where(secretOf(me, name));
    return c.json({ ok: true });
  });

  // --- Jaquettes en fichier local (docs/COMPTE.md, section 3) ---
  // L'app envoie l'image puis l'élément `cover:<jeu>` = `file:<empreinte>` ; les autres postes la
  // téléchargent. Les images plus désignées par aucun élément partent au ménage quotidien.

  const coverOf = async (userId: string, hash: string) =>
    (await db.select().from(covers).where(and(eq(covers.userId, userId), eq(covers.hash, hash))))[0];

  api.put(
    '/covers/:hash',
    bodyLimit({ maxSize: COVER_MAX, onError: (c) => c.json({ error: 'trop_gros' }, 413) }),
    async (c) => {
      const me = c.get('device');
      const hash = c.req.param('hash');
      if (!bucket) return c.json({ error: 'indisponible' }, 503);
      if (!COVER_HASH.test(hash)) return c.json({ error: 'requete' }, 400);
      if (await coverOf(me.userId, hash)) return c.json({ ok: true });
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const type = imageType(bytes);
      if (!type || type === 'image/gif' || (await sha256Hex(bytes)) !== hash) return c.json({ error: 'image' }, 400);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(covers)
        .where(eq(covers.userId, me.userId));
      if (count >= MAX_COVERS) return c.json({ error: 'plein' }, 413);
      await bucket.put(coverKey(me.userId, hash), bytes, { httpMetadata: { contentType: type } });
      await db
        .insert(covers)
        .values({ userId: me.userId, hash, size: bytes.length, type, createdAt: Date.now() })
        .onConflictDoNothing();
      return c.json({ ok: true });
    }
  );

  api.get('/covers/:hash', async (c) => {
    const me = c.get('device');
    const hash = c.req.param('hash');
    const row = COVER_HASH.test(hash) ? await coverOf(me.userId, hash) : undefined;
    const obj = row && bucket ? await bucket.get(coverKey(me.userId, hash)) : null;
    if (!row || !obj) return c.json({ error: 'introuvable' }, 404);
    return c.body(new Uint8Array(await obj.arrayBuffer()), 200, {
      'content-type': row.type,
      'cache-control': 'private, no-store'
    });
  });

  // --- Export et suppression (RGPD) ---

  api.get('/export', async (c) => {
    const me = c.get('device');
    const [u] = await db.select().from(user).where(eq(user.id, me.userId));
    const all = await db.select().from(entries).where(eq(entries.userId, me.userId)).orderBy(asc(entries.key));
    const played = await db.select().from(gameSessions).where(eq(gameSessions.userId, me.userId)).orderBy(asc(gameSessions.start));
    const pics = await db.select().from(covers).where(eq(covers.userId, me.userId)).orderBy(asc(covers.createdAt));
    const kept = await db.select({ name: secrets.name, updatedAt: secrets.updatedAt }).from(secrets).where(eq(secrets.userId, me.userId));
    return c.json({
      exportedAt: Date.now(),
      user: u
        ? {
            email: u.email,
            name: u.name,
            avatar: u.image ? (u.image.startsWith('r2:') ? 'image envoyée' : u.image) : null,
            createdAt: u.createdAt.getTime()
          }
        : null,
      devices: await deviceList(me),
      // Les images elles-mêmes restent sur tes PC (dossier des jaquettes de Hangar).
      covers: pics.map((r) => ({ hash: r.hash, type: r.type, size: r.size, createdAt: r.createdAt })),
      // Valeurs chiffrées, jamais exportées : elles sont aussi dans le coffre de tes PC.
      secrets: kept,
      social: await exportSocial(db, env, me.userId),
      entries: all.filter((r) => !r.deleted).map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt, deviceId: r.deviceId })),
      sessions: played.map((r) => ({ id: r.id, gameId: r.gameId, start: r.start, end: r.end, deviceId: r.deviceId }))
    });
  });

  /** Supprime le compte et tout ce qui lui est rattaché. Rien n'est gardé. */
  api.delete('/me', async (c) => {
    await deleteAccount(db, bucket, c.get('device').userId);
    return c.json({ ok: true });
  });

  // Le social, sous /social (docs/COMPTE.md, phase 7).
  api.route('/social', socialRoutes(db, env, hub, { avatarOf, loadAvatar }));

  app.route('/', api);
  return app;
}
