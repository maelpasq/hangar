// Icônes d'exe pour Discord Rich Presence. Discord ne montre que des images en ligne (il les
// télécharge lui-même) : pour un jeu sans jaquette, Hangar envoie ici l'icône de l'exe (PNG 256 px
// au plus, avec ou sans compte), et reçoit son adresse publique, passée à Discord.
//
// Rien ne relie une icône à un compte ni à un appareil : seule l'empreinte de l'adresse IP sert à
// la limite (60 envois par heure), avec 2000 nouvelles icônes par jour en tout. Une même icône n'est
// gardée qu'une fois (empreinte SHA-256 du fichier) et part au ménage 30 jours après son dernier envoi.
import { eq, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { hit } from './bug';
import { hashToken } from './crypto';
import type { AvatarStore, Db, Env } from './env';
import { sha256Hex } from './profile';
import { presenceIcons } from './schema';

/** 256 Ko au plus : une icône de 256 × 256 en PNG. */
export const ICON_MAX = 256 * 1024;
export const ICON_SIDE = 256;
export const ICON_DAYS = 30;
const PER_IP_PER_HOUR = 60;
const NEW_PER_DAY = 2000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const HASH = /^[0-9a-f]{64}$/;

export const iconKey = (hash: string) => `icons/${hash}`;

/** Côtés d'un PNG (en-tête IHDR), ou `null` si ce n'en est pas un. */
export function pngSize(b: Uint8Array): { w: number; h: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || !sig.every((x, i) => b[i] === x)) return null;
  if (String.fromCharCode(...b.slice(12, 16)) !== 'IHDR') return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/** Efface les icônes plus envoyées depuis 30 jours ; rend leur nombre. */
export async function cleanIcons(db: Db, bucket: AvatarStore | undefined, now: number): Promise<number> {
  if (!bucket) return 0;
  const old = await db
    .select({ hash: presenceIcons.hash })
    .from(presenceIcons)
    .where(lt(presenceIcons.usedAt, now - ICON_DAYS * DAY))
    .limit(1000);
  if (!old.length) return 0;
  await bucket.delete(old.map((o) => iconKey(o.hash)));
  for (const o of old) await db.delete(presenceIcons).where(eq(presenceIcons.hash, o.hash));
  return old.length;
}

export function iconRoutes(db: Db, env: Env) {
  const r = new Hono();
  const urlOf = (hash: string) => `${env.BASE_URL}/icons/${hash}.png`;

  r.post('/', bodyLimit({ maxSize: ICON_MAX, onError: (c) => c.json({ error: 'trop_gros' }, 413) }), async (c) => {
    const bucket = env.AVATARS;
    if (!bucket) return c.json({ error: 'indisponible' }, 503);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const size = pngSize(bytes);
    if (!size || !size.w || !size.h || size.w > ICON_SIDE || size.h > ICON_SIDE) return c.json({ error: 'image' }, 400);

    const now = Date.now();
    const who = await hashToken(`icone:${c.req.header('cf-connecting-ip') ?? 'inconnu'}`);
    if ((await hit(db, `icone:ip:${who}:${Math.floor(now / HOUR)}`, now)) > PER_IP_PER_HOUR) {
      return c.json({ error: 'trop' }, 429);
    }
    const hash = await sha256Hex(bytes);
    const [known] = await db.select().from(presenceIcons).where(eq(presenceIcons.hash, hash));
    if (known) {
      // Une écriture par jour au plus pour la même icône.
      if (known.usedAt < now - DAY) await db.update(presenceIcons).set({ usedAt: now }).where(eq(presenceIcons.hash, hash));
      return c.json({ url: urlOf(hash) });
    }
    if ((await hit(db, `icone:jour:${Math.floor(now / DAY)}`, now)) > NEW_PER_DAY) return c.json({ error: 'trop' }, 429);
    await bucket.put(iconKey(hash), bytes, { httpMetadata: { contentType: 'image/png' } });
    await db.insert(presenceIcons).values({ hash, size: bytes.length, createdAt: now, usedAt: now }).onConflictDoNothing();
    return c.json({ url: urlOf(hash) });
  });

  // Public : Discord télécharge l'image. Le contenu d'une adresse ne change jamais (empreinte).
  r.get('/:file', async (c) => {
    const hash = c.req.param('file').replace(/\.png$/, '');
    const obj = HASH.test(hash) && env.AVATARS ? await env.AVATARS.get(iconKey(hash)) : null;
    if (!obj) return c.json({ error: 'introuvable' }, 404);
    return c.body(new Uint8Array(await obj.arrayBuffer()), 200, {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=604800, immutable',
      'x-content-type-options': 'nosniff'
    });
  });
  return r;
}
