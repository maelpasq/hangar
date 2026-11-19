// Badges donnés par l'administrateur (docs/ADMIN.md, « Badges ») : leurs définitions vivent dans
// `badge_defs` et se créent depuis le dashboard. Les badges calculés (pionnier, ancienneté,
// collection, temps de jeu, launchers) le sont par l'app.
//
// Compatibilité : les versions de l'app d'avant la phase 4 connaissent seulement les 4 premiers
// badges, par leur identifiant (`badges`). Les nouvelles lisent `badgeDefs` (nom, emblème,
// couleur). `badges` ne contient donc jamais que des identifiants de `LEGACY_BADGES`.
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from './env';
import { badgeDefs, badges, friends } from './schema';
import type { Hub } from './social';

/** Badges d'avant la phase 4, connus des anciennes versions de l'app. Jamais supprimés. */
export const LEGACY_BADGES = ['certifie', 'equipe', 'testeur', 'chasseur'] as const;

/**
 * Emblèmes embarqués dans l'app (`src/lib/components/BadgeIcon.svelte`), même liste que
 * `GIVEN_ICONS` de `src/lib/util/badges.ts`. Une version de l'app qui ne connaît pas un emblème
 * montre l'étoile.
 */
export const BADGE_ICONS = [
  'seal',
  'shield',
  'flask',
  'bug',
  'star',
  'heart',
  'trophy',
  'crown',
  'rocket',
  'bolt',
  'gem',
  'flame',
  'gamepad',
  'brush',
  'music',
  'chat',
  'network'
] as const;

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  position: number;
  active: boolean;
}

/** Ce que l'app reçoit d'un badge : de quoi l'afficher. */
export interface BadgeView {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 140;

export const isIcon = (v: unknown): v is string => typeof v === 'string' && (BADGE_ICONS as readonly string[]).includes(v);
export const isColor = (v: unknown): v is string => typeof v === 'string' && (v === 'accent' || /^#[0-9a-f]{6}$/.test(v));
export const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/** Identifiant tiré du nom : minuscules sans accents, chiffres et tirets (`chasseur-de-bugs`). */
export function slugOf(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
    .replace(/-$/, '');
}

const view = (d: BadgeDef): BadgeView => ({ id: d.id, name: d.name, description: d.description, icon: d.icon, color: d.color });

/** Définitions, dans l'ordre d'affichage (`active` : seulement celles qui s'affichent). */
export async function badgeDefsOf(db: Db, onlyActive = false): Promise<BadgeDef[]> {
  const rows = await db
    .select()
    .from(badgeDefs)
    .where(onlyActive ? eq(badgeDefs.active, true) : undefined)
    .orderBy(asc(badgeDefs.position), asc(badgeDefs.createdAt));
  return rows.map(({ createdAt: _, ...d }) => d);
}

/** Badges actifs d'un compte, dans l'ordre d'affichage. */
export async function heldBadges(db: Db, id: string): Promise<BadgeView[]> {
  const rows = await db
    .select({ def: badgeDefs })
    .from(badges)
    .innerJoin(badgeDefs, eq(badgeDefs.id, badges.badge))
    .where(and(eq(badges.userId, id), eq(badgeDefs.active, true)))
    .orderBy(asc(badgeDefs.position), asc(badgeDefs.createdAt));
  return rows.map((r) => view(r.def));
}

/** Pour les anciennes versions de l'app : seulement les badges qu'elles connaissent. */
export const legacyOf = (held: BadgeView[]) =>
  held.map((b) => b.id).filter((id) => (LEGACY_BADGES as readonly string[]).includes(id));

/** Identifiants des badges actifs d'un compte (dashboard, appli de l'administrateur). */
export async function badgesOf(db: Db, id: string): Promise<string[]> {
  return (await heldBadges(db, id)).map((b) => b.id);
}

/** Le badge existe (actif ou non) : on peut le donner ou le retirer. */
export async function badgeExists(db: Db, badge: unknown): Promise<boolean> {
  if (typeof badge !== 'string' || !badge || badge.length > 40) return false;
  const [d] = await db.select({ id: badgeDefs.id }).from(badgeDefs).where(eq(badgeDefs.id, badge));
  return !!d;
}

/**
 * Donne (`on`) ou retire un badge à des comptes existants ; rend ceux dont les badges ont changé.
 * La pastille « certifié » suit le pseudo partout : prévient ceux qui ont un lien.
 */
export async function setBadgeFor(db: Db, hub: Hub, ids: string[], badge: string, on: boolean): Promise<string[]> {
  if (!ids.length) return [];
  const had = new Set(
    (
      await db
        .select({ id: badges.userId })
        .from(badges)
        .where(and(inArray(badges.userId, ids), eq(badges.badge, badge)))
    ).map((r) => r.id)
  );
  const changed = ids.filter((id) => had.has(id) !== on);
  if (!changed.length) return [];
  if (on) {
    const at = Date.now();
    await db
      .insert(badges)
      .values(changed.map((userId) => ({ userId, badge, at })))
      .onConflictDoNothing();
  } else {
    await db.delete(badges).where(and(inArray(badges.userId, changed), eq(badges.badge, badge)));
  }
  if (badge === 'certifie') {
    const linked = await db.select({ id: friends.userId }).from(friends).where(inArray(friends.otherId, changed));
    await hub([...new Set(linked.map((x) => x.id))], { type: 'friends' });
    await hub(changed, { type: 'settings' });
  }
  return changed;
}

/** Donne ou retire un badge à un compte ; rend ses badges actifs. */
export async function setBadge(db: Db, hub: Hub, id: string, badge: string, on: boolean): Promise<string[]> {
  await setBadgeFor(db, hub, [id], badge, on);
  return badgesOf(db, id);
}
