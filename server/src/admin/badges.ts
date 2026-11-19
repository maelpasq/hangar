// Badges dans le dashboard (docs/ADMIN.md, « Badges ») : créer, modifier, ordonner, désactiver,
// supprimer (s'il n'est donné à personne), donner ou retirer à plusieurs comptes d'un coup.
// Tout est noté au journal, cible `badge:<identifiant>` ou le compte concerné.
import { count, eq, inArray, max } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  BADGE_ICONS,
  DESCRIPTION_MAX,
  LEGACY_BADGES,
  NAME_MAX,
  badgeDefsOf,
  cleanName,
  isColor,
  isIcon,
  setBadgeFor,
  slugOf
} from '../badges';
import type { Db } from '../env';
import { isUserId } from '../profile';
import { badgeDefs, badges, social, user } from '../schema';
import { type Hub, normCode } from '../social';
import { logAction } from './log';

type Vars = { Variables: { admin: string } };

/** Comptes d'un envoi groupé, au plus. */
export const BULK_MAX = 200;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isLegacy = (id: string) => (LEGACY_BADGES as readonly string[]).includes(id);

/** Définitions avec le nombre de comptes qui ont chaque badge. */
export async function badgeList(db: Db) {
  const [defs, held] = await Promise.all([
    badgeDefsOf(db),
    db.select({ badge: badges.badge, n: count() }).from(badges).groupBy(badges.badge)
  ]);
  const n = new Map(held.map((r) => [r.badge, r.n]));
  return defs.map((d) => ({ ...d, held: n.get(d.id) ?? 0, legacy: isLegacy(d.id) }));
}

/** Comptes désignés par leur identifiant, leur code ami ou leur e-mail ; rend aussi ceux introuvables. */
async function resolve(db: Db, refs: string[]): Promise<{ ids: string[]; missing: string[] }> {
  const ids = new Set<string>();
  const missing: string[] = [];
  const direct = refs.filter(isUserId);
  const codes = new Map(refs.map((r) => [r, normCode(r)]).filter((e): e is [string, string] => !!e[1]));
  const mails = refs.filter((r) => r.includes('@')).map((r) => r.toLowerCase());
  const [byId, byCode, byMail] = await Promise.all([
    direct.length ? db.select({ id: user.id }).from(user).where(inArray(user.id, direct)) : [],
    codes.size ? db.select({ id: social.userId, code: social.code }).from(social).where(inArray(social.code, [...codes.values()])) : [],
    mails.length ? db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.email, mails)) : []
  ]);
  const found = new Map<string, string>();
  for (const r of byId) found.set(r.id, r.id);
  const codeOwner = new Map(byCode.map((r) => [r.code, r.id]));
  for (const [ref, code] of codes) if (codeOwner.has(code)) found.set(ref, codeOwner.get(code)!);
  const mailOwner = new Map(byMail.map((r) => [r.email.toLowerCase(), r.id]));
  for (const ref of refs) {
    const id = found.get(ref) ?? mailOwner.get(ref.toLowerCase());
    if (id) ids.add(id);
    else missing.push(ref);
  }
  return { ids: [...ids], missing };
}

/** Champs d'un badge à créer ou modifier ; `null` : requête invalide. */
function fieldsOf(body: Record<string, unknown>, partial: boolean) {
  const out: { name?: string; description?: string; icon?: string; color?: string; active?: boolean } = {};
  if ('name' in body || !partial) {
    const name = cleanName(body.name);
    if (!name || name.length > NAME_MAX) return null;
    out.name = name;
  }
  if ('description' in body) {
    const d = cleanName(body.description);
    if (d.length > DESCRIPTION_MAX) return null;
    out.description = d;
  }
  if ('icon' in body || !partial) {
    if (!isIcon(body.icon)) return null;
    out.icon = body.icon;
  }
  if ('color' in body || !partial) {
    if (!isColor(body.color)) return null;
    out.color = body.color;
  }
  if ('active' in body) {
    if (typeof body.active !== 'boolean') return null;
    out.active = body.active;
  }
  return out;
}

export function badgeRoutes(db: Db, hub: Hub) {
  const r = new Hono<Vars>();

  r.get('/', async (c) => c.json({ badges: await badgeList(db), icons: BADGE_ICONS }));

  /** `{ name, description?, icon, color }` : nouveau badge, en dernier, actif. */
  r.post('/', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const f = isObject(body) ? fieldsOf(body, false) : null;
    if (!f?.name || !f.icon || !f.color) return c.json({ error: 'requete' }, 400);
    const all = await badgeDefsOf(db);
    const base = slugOf(f.name) || 'badge';
    const taken = new Set(all.map((x) => x.id));
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
    const [{ last }] = await db.select({ last: max(badgeDefs.position) }).from(badgeDefs);
    const row = {
      id,
      name: f.name,
      description: f.description ?? '',
      icon: f.icon,
      color: f.color,
      position: (last ?? 0) + 1,
      active: true,
      createdAt: Date.now()
    };
    await db.insert(badgeDefs).values(row);
    await logAction(db, c.get('admin'), 'badge.creer', `badge:${id}`, { badge: id, name: row.name });
    return c.json({ id }, 201);
  });

  /** `{ ids }` : nouvel ordre d'affichage, tous les badges une fois chacun. */
  r.put('/order', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const all = (await badgeDefsOf(db)).map((d) => d.id);
    const ids = isObject(body) && Array.isArray(body.ids) ? body.ids : null;
    if (!ids || ids.length !== all.length || new Set(ids).size !== ids.length || !ids.every((x) => all.includes(x as string))) {
      return c.json({ error: 'requete' }, 400);
    }
    for (const [i, id] of ids.entries()) await db.update(badgeDefs).set({ position: i + 1 }).where(eq(badgeDefs.id, id as string));
    await logAction(db, c.get('admin'), 'badge.ordre', null, { ids });
    return c.json({ badges: await badgeList(db) });
  });

  /** `{ name?, description?, icon?, color?, active? }` : modifie un badge. */
  r.put('/:id', async (c) => {
    const id = c.req.param('id');
    const [d] = await db.select().from(badgeDefs).where(eq(badgeDefs.id, id));
    if (!d) return c.json({ error: 'introuvable' }, 404);
    const body: unknown = await c.req.json().catch(() => null);
    const f = isObject(body) ? fieldsOf(body, true) : null;
    if (!f) return c.json({ error: 'requete' }, 400);
    const changed = (Object.keys(f) as (keyof typeof f)[]).filter((k) => f[k] !== d[k]);
    if (changed.length) {
      await db.update(badgeDefs).set(f).where(eq(badgeDefs.id, id));
      await logAction(db, c.get('admin'), 'badge.modifier', `badge:${id}`, { badge: id, name: f.name ?? d.name, changes: changed });
      // La pastille « certifié » s'affiche à côté des pseudos : prévenir ceux qui l'ont.
      if (id === 'certifie' && changed.includes('active')) {
        const holders = await db.select({ id: badges.userId }).from(badges).where(eq(badges.badge, id));
        await hub(holders.map((h) => h.id), { type: 'settings' });
      }
    }
    return c.json({ badges: await badgeList(db) });
  });

  /** Supprime un badge donné à personne. Les 4 badges d'origine restent (anciennes versions). */
  r.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const [d] = await db.select().from(badgeDefs).where(eq(badgeDefs.id, id));
    if (!d) return c.json({ error: 'introuvable' }, 404);
    if (isLegacy(id)) return c.json({ error: 'origine' }, 409);
    const [{ n }] = await db.select({ n: count() }).from(badges).where(eq(badges.badge, id));
    if (n) return c.json({ error: 'utilise' }, 409);
    await db.delete(badgeDefs).where(eq(badgeDefs.id, id));
    await logAction(db, c.get('admin'), 'badge.supprimer', `badge:${id}`, { badge: id, name: d.name });
    return c.json({ badges: await badgeList(db) });
  });

  /**
   * `{ users, on }` : donne (`on: true`) ou retire le badge à plusieurs comptes, désignés par leur
   * identifiant, leur code ami ou leur e-mail (`BULK_MAX` au plus). Chaque compte changé est noté.
   */
  r.post('/:id/users', async (c) => {
    const id = c.req.param('id');
    const [d] = await db.select().from(badgeDefs).where(eq(badgeDefs.id, id));
    if (!d) return c.json({ error: 'introuvable' }, 404);
    const body: unknown = await c.req.json().catch(() => null);
    const raw = isObject(body) && Array.isArray(body.users) ? body.users : null;
    if (!raw || !isObject(body) || typeof body.on !== 'boolean' || !raw.every((u) => typeof u === 'string')) {
      return c.json({ error: 'requete' }, 400);
    }
    const refs = [...new Set((raw as string[]).map((u) => u.trim()).filter(Boolean))];
    if (!refs.length || refs.length > BULK_MAX) return c.json({ error: 'requete' }, 400);
    const { ids, missing } = await resolve(db, refs);
    const changed = await setBadgeFor(db, hub, ids, id, body.on);
    const actor = c.get('admin');
    for (const u of changed) await logAction(db, actor, body.on ? 'badge.donner' : 'badge.retirer', u, { badge: id, name: d.name });
    return c.json({ found: ids.length, changed: changed.length, missing });
  });

  return r;
}
