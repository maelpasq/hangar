// Signalement de bug (bouton insecte de Hangar, avec ou sans compte) : relayé vers le webhook
// Discord du développeur. L'adresse du webhook vit dans les secrets du Worker (`BUG_WEBHOOK`),
// jamais dans l'app publiée : personne ne peut l'en extraire pour écrire dans le salon.
//
// Le message Discord est reconstruit ici (titre, description, version, système, capture) : rien de
// ce qu'envoie l'app n'est transmis tel quel, et aucune mention n'est possible. Limites : 5 par
// heure et par adresse IP (seule son empreinte est gardée, un jour), 200 par jour en tout.
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { hashToken } from './crypto';
import type { Db, Env } from './env';
import { imageType } from './profile';
import { rateLimit } from './schema';

/** Capture jointe : 8 Mo au plus (comme l'app). */
export const BUG_IMAGE_MAX = 8 * 1024 * 1024;
const PER_IP_PER_HOUR = 5;
const PER_DAY = 200;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const SYSTEMS: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
const VERSION = /^[0-9A-Za-z.+-]{1,40}$/;
const WEBHOOK = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;

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

export function bugRoute(db: Db, env: Env) {
  const r = new Hono();
  r.post('/', bodyLimit({ maxSize: BUG_IMAGE_MAX + 64 * 1024, onError: (c) => c.json({ error: 'trop_gros' }, 413) }), async (c) => {
    const webhook = webhookOf(env);
    if (!webhook) return c.json({ error: 'indisponible' }, 503);
    const form = await c.req.raw.formData().catch(() => null);
    if (!form) return c.json({ error: 'requete' }, 400);
    const title = field(form, 'title', 200);
    const description = field(form, 'description', 3500);
    const version = field(form, 'version', 40);
    const os = SYSTEMS[field(form, 'os', 10)];
    if (!title || !VERSION.test(version) || !os) return c.json({ error: 'requete' }, 400);

    let image: { bytes: Uint8Array<ArrayBuffer>; type: string; name: string } | null = null;
    const file = form.get('capture');
    if (file !== null) {
      if (typeof file === 'string') return c.json({ error: 'requete' }, 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = imageType(bytes);
      if (bytes.length > BUG_IMAGE_MAX) return c.json({ error: 'trop_gros' }, 413);
      if (!type || type === 'image/gif') return c.json({ error: 'image' }, 400);
      image = { bytes, type, name: `capture.${type.slice('image/'.length)}` };
    }

    const now = Date.now();
    const who = await hashToken(`bug:${c.req.header('cf-connecting-ip') ?? 'inconnu'}`);
    if ((await hit(db, `bug:ip:${who}:${Math.floor(now / HOUR)}`, now)) > PER_IP_PER_HOUR) {
      return c.json({ error: 'trop' }, 429);
    }
    if ((await hit(db, `bug:jour:${Math.floor(now / DAY)}`, now)) > PER_DAY) return c.json({ error: 'trop' }, 429);

    const embed: Record<string, unknown> = {
      title: `🐛 ${title}`,
      description: description || '*Pas de description.*',
      color: 0x7c6cff,
      fields: [
        { name: 'Version', value: `Hangar ${version}`, inline: true },
        { name: 'Système', value: os, inline: true }
      ]
    };
    if (image) embed.image = { url: `attachment://${image.name}` };
    const out = new FormData();
    out.append('payload_json', JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }));
    if (image) out.append('files[0]', new Blob([image.bytes], { type: image.type }), image.name);
    // `manual` : une redirection n'est pas suivie et compte comme un échec (Workers refuse `error`).
    const res = await fetch(webhook, { method: 'POST', body: out, redirect: 'manual' }).catch((e) => {
      console.error('[hangar] signalement : réseau', e instanceof Error ? e.name : '');
      return null;
    });
    if (!res?.ok) {
      // Jamais l'adresse du webhook dans le journal : seulement le code.
      console.error(`[hangar] signalement non relayé (${res?.status ?? 'réseau'})`);
      return c.json({ error: 'relais' }, 502);
    }
    return c.json({ ok: true });
  });
  return r;
}
