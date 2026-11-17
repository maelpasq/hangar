// Signalement de bug (bouton insecte de Hangar, avec ou sans compte) : rangé en base (table `bugs`,
// capture dans R2) pour être suivi dans le dashboard d'administration, et relayé vers le webhook
// Discord du développeur. L'adresse du webhook vit dans les secrets du Worker (`BUG_WEBHOOK`),
// jamais dans l'app publiée : personne ne peut l'en extraire pour écrire dans le salon.
//
// Le message Discord est reconstruit ici (titre, description, version, système, statut, capture) :
// rien de ce qu'envoie l'app n'est transmis tel quel, et aucune mention n'est possible. Il est
// modifié quand le statut du bug change dans le dashboard. Limites : 5 par heure et par adresse IP
// (seule son empreinte est gardée, un jour), 200 par jour en tout.
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { hashToken } from './crypto';
import type { AvatarStore, Db, Env } from './env';
import { imageType } from './profile';
import { bugs, rateLimit } from './schema';

/** Capture jointe : 8 Mo au plus (comme l'app). */
export const BUG_IMAGE_MAX = 8 * 1024 * 1024;
const PER_IP_PER_HOUR = 5;
const PER_DAY = 200;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Capture d'un bug clos effacée après ce délai. */
export const CAPTURE_DAYS = 90;
const SYSTEMS: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
export const VERSION = /^[0-9A-Za-z.+-]{1,40}$/;
const WEBHOOK = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;

/** Statuts d'un bug, dans l'ordre du suivi, avec leur nom et la couleur de l'embed Discord. */
export const BUG_STATUSES = {
  nouveau: { label: 'Nouveau', color: 0x7c6cff, open: true },
  confirme: { label: 'Confirmé', color: 0xf5a524, open: true },
  en_cours: { label: 'En cours', color: 0x3b82f6, open: true },
  corrige: { label: 'Corrigé', color: 0x34d399, open: false },
  rejete: { label: 'Rejeté', color: 0x6b7280, open: false },
  doublon: { label: 'Doublon', color: 0x6b7280, open: false }
} as const;
export type BugStatus = keyof typeof BUG_STATUSES;
export const isBugStatus = (s: unknown): s is BugStatus => typeof s === 'string' && Object.hasOwn(BUG_STATUSES, s);
export const OPEN_STATUSES = (Object.keys(BUG_STATUSES) as BugStatus[]).filter((s) => BUG_STATUSES[s].open);

export type BugRow = typeof bugs.$inferSelect;
export const bugKey = (id: number) => `bugs/${id}`;

/** Adresse du webhook Discord du développeur si elle est bien formée, sinon `null`. */
export const webhookOf = (env: Env): string | null =>
  env.BUG_WEBHOOK && WEBHOOK.test(env.BUG_WEBHOOK) ? env.BUG_WEBHOOK : null;

const field = (form: FormData, name: string, max: number): string => {
  const v = form.get(name);
  if (typeof v !== 'string') return '';
  // Sans caractères de contrôle (sauf retours à la ligne et tabulations), coupé à la longueur permise.
  return [...v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()].slice(0, max).join('');
};

/** Compte un envoi dans la fenêtre `key` ; rend le total de la fenêtre. */
async function hit(db: Db, key: string, now: number): Promise<number> {
  const [row] = await db
    .insert(rateLimit)
    .values({ id: crypto.randomUUID(), key, count: 1, lastRequest: now })
    .onConflictDoUpdate({ target: rateLimit.key, set: { count: sql`${rateLimit.count} + 1`, lastRequest: now } })
    .returning({ count: rateLimit.count });
  return row?.count ?? 1;
}

/** Nom de la capture jointe au message Discord. */
const captureName = (type: string) => `capture.${type.slice('image/'.length)}`;

/** Embed Discord d'un bug : statut en couleur et en champ, lien vers sa fiche du dashboard. */
export function bugEmbed(b: BugRow, adminHost: string | undefined): Record<string, unknown> {
  const status = isBugStatus(b.status) ? BUG_STATUSES[b.status] : BUG_STATUSES.nouveau;
  const fields = [
    { name: 'Version', value: `Hangar ${b.version}`, inline: true },
    { name: 'Système', value: SYSTEMS[b.os] ?? b.os, inline: true },
    {
      name: 'Statut',
      value:
        b.status === 'corrige' && b.fixedIn
          ? `${status.label} dans Hangar ${b.fixedIn}`
          : b.status === 'doublon' && b.duplicateOf
            ? `${status.label} du #${b.duplicateOf}`
            : status.label,
      inline: true
    }
  ];
  const embed: Record<string, unknown> = {
    title: `🐛 #${b.id} ${b.title}`.slice(0, 256),
    description: b.description || '*Pas de description.*',
    color: status.color,
    fields
  };
  if (adminHost) embed.url = `https://${adminHost}/#/bugs/${b.id}`;
  if (b.capture) embed.image = { url: `attachment://${captureName(b.capture)}` };
  return embed;
}

/**
 * Remet à jour le message Discord d'un bug (statut changé dans le dashboard). La capture déjà jointe
 * reste (pas de champ `attachments`). Rend `false` si Discord refuse ; jamais d'exception.
 */
export async function updateBugMessage(env: Env, b: BugRow): Promise<boolean> {
  const webhook = webhookOf(env);
  if (!webhook || !b.discordId || !/^\d+$/.test(b.discordId)) return false;
  const res = await fetch(`${webhook}/messages/${b.discordId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ embeds: [bugEmbed(b, env.ADMIN_HOST)], allowed_mentions: { parse: [] } }),
    redirect: 'manual'
  }).catch(() => null);
  if (!res?.ok) console.error(`[hangar] message Discord du bug #${b.id} non modifié (${res?.status ?? 'réseau'})`);
  return !!res?.ok;
}

/** Efface les captures des bugs clos depuis plus de 90 jours ; rend leur nombre. */
export async function cleanBugCaptures(db: Db, bucket: AvatarStore | undefined, now: number): Promise<number> {
  if (!bucket) return 0;
  const old = await db
    .select({ id: bugs.id })
    .from(bugs)
    .where(and(isNotNull(bugs.capture), isNotNull(bugs.closedAt), lt(bugs.closedAt, now - CAPTURE_DAYS * DAY)))
    .limit(1000);
  if (!old.length) return 0;
  await bucket.delete(old.map((b) => bugKey(b.id)));
  for (const b of old) await db.update(bugs).set({ capture: null }).where(eq(bugs.id, b.id));
  return old.length;
}

export function bugRoute(db: Db, env: Env) {
  const r = new Hono();
  r.post('/', bodyLimit({ maxSize: BUG_IMAGE_MAX + 64 * 1024, onError: (c) => c.json({ error: 'trop_gros' }, 413) }), async (c) => {
    const form = await c.req.raw.formData().catch(() => null);
    if (!form) return c.json({ error: 'requete' }, 400);
    const title = field(form, 'title', 200);
    const description = field(form, 'description', 3500);
    const version = field(form, 'version', 40);
    const os = field(form, 'os', 10);
    if (!title || !VERSION.test(version) || !SYSTEMS[os]) return c.json({ error: 'requete' }, 400);

    let image: { bytes: Uint8Array<ArrayBuffer>; type: string } | null = null;
    const file = form.get('capture');
    if (file !== null) {
      if (typeof file === 'string') return c.json({ error: 'requete' }, 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = imageType(bytes);
      if (bytes.length > BUG_IMAGE_MAX) return c.json({ error: 'trop_gros' }, 413);
      if (!type || type === 'image/gif') return c.json({ error: 'image' }, 400);
      image = { bytes, type };
    }

    const now = Date.now();
    const who = await hashToken(`bug:${c.req.header('cf-connecting-ip') ?? 'inconnu'}`);
    if ((await hit(db, `bug:ip:${who}:${Math.floor(now / HOUR)}`, now)) > PER_IP_PER_HOUR) {
      return c.json({ error: 'trop' }, 429);
    }
    if ((await hit(db, `bug:jour:${Math.floor(now / DAY)}`, now)) > PER_DAY) return c.json({ error: 'trop' }, 429);

    const [row] = await db
      .insert(bugs)
      .values({ title, description, version, os, createdAt: now, updatedAt: now })
      .returning();
    let bug = row;
    if (image && env.AVATARS) {
      await env.AVATARS.put(bugKey(bug.id), image.bytes, { httpMetadata: { contentType: image.type } });
      [bug] = await db.update(bugs).set({ capture: image.type }).where(eq(bugs.id, bug.id)).returning();
    }

    // Discord : le bug est gardé même si le relais échoue (il reste visible dans le dashboard).
    const webhook = webhookOf(env);
    if (webhook) {
      // L'embed vise la capture jointe même sans R2 (alors pas gardée, mais visible dans Discord).
      const embed = bugEmbed(image ? { ...bug, capture: image.type } : bug, env.ADMIN_HOST);
      const out = new FormData();
      out.append('payload_json', JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }));
      if (image) out.append('files[0]', new Blob([image.bytes], { type: image.type }), captureName(image.type));
      // `wait` : Discord rend le message, dont l'identifiant sert à le modifier plus tard.
      // `manual` : une redirection n'est pas suivie et compte comme un échec (Workers refuse `error`).
      const res = await fetch(`${webhook}?wait=true`, { method: 'POST', body: out, redirect: 'manual' }).catch((e) => {
        console.error('[hangar] signalement : réseau', e instanceof Error ? e.name : '');
        return null;
      });
      if (res?.ok) {
        const msg = (await res.json().catch(() => null)) as { id?: unknown } | null;
        if (typeof msg?.id === 'string' && /^\d+$/.test(msg.id)) {
          await db.update(bugs).set({ discordId: msg.id }).where(eq(bugs.id, bug.id));
        }
      } else {
        // Jamais l'adresse du webhook dans le journal : seulement le code.
        console.error(`[hangar] signalement #${bug.id} non relayé (${res?.status ?? 'réseau'})`);
      }
    }
    return c.json({ ok: true });
  });
  return r;
}
