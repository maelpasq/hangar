// Sanctions de la modération (table `sanctions`, données par le dashboard d'administration) :
//   social : amis coupés et impossibles à réactiver ;
//   total  : compte suspendu, l'API ne répond plus que pour le voir, l'exporter, le supprimer ou
//            déconnecter ses postes.
// Une suspension totale suit l'adresse e-mail : un nouveau compte à la même adresse la reprend.
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { hashToken } from './crypto';
import type { Db } from './env';
import { friends, sanctions, social, user } from './schema';
import type { Hub } from './social';

export const SANCTION_KINDS = ['social', 'total'] as const;
export type SanctionKind = (typeof SANCTION_KINDS)[number];
export type SanctionRow = typeof sanctions.$inferSelect;

/** Ce que l'app reçoit : la sanction la plus forte en cours. */
export interface Suspension {
  kind: SanctionKind;
  reason: string;
  /** Fin (ms), null : définitive. */
  until: number | null;
}

export const emailHash = (email: string) => hashToken(`ban:${email.trim().toLowerCase()}`);

const active = (now: number) => and(isNull(sanctions.liftedAt), or(isNull(sanctions.until), gt(sanctions.until, now)));

/** Sanctions en cours d'un compte. */
export async function activeSanctions(db: Db, userId: string, now = Date.now()): Promise<SanctionRow[]> {
  return db
    .select()
    .from(sanctions)
    .where(and(eq(sanctions.userId, userId), active(now)));
}

/** Sanction la plus forte en cours (totale avant sociale ; à force égale, la plus longue). */
export function strongest(rows: SanctionRow[]): Suspension | null {
  const pick = (kind: SanctionKind) =>
    rows
      .filter((r) => r.kind === kind)
      .sort((a, b) => (a.until === null ? -1 : b.until === null ? 1 : b.until - a.until))[0];
  const s = pick('total') ?? pick('social');
  return s ? { kind: s.kind as SanctionKind, reason: s.reason, until: s.until } : null;
}

export async function suspensionOf(db: Db, userId: string, now = Date.now()): Promise<Suspension | null> {
  return strongest(await activeSanctions(db, userId, now));
}

/**
 * Nouveau compte (ou nouvelle connexion) à une adresse suspendue : il reprend la suspension totale
 * en cours, avec le même motif et la même fin.
 */
export async function inheritBan(db: Db, userId: string, now = Date.now()): Promise<void> {
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!u) return;
  const hash = await emailHash(u.email);
  const banned = await db
    .select()
    .from(sanctions)
    .where(and(eq(sanctions.emailHash, hash), eq(sanctions.kind, 'total'), active(now)));
  if (!banned.length || banned.some((b) => b.userId === userId)) return;
  const b = banned[0];
  await db.insert(sanctions).values({
    id: crypto.randomUUID(),
    userId,
    kind: 'total',
    reason: b.reason,
    until: b.until,
    emailHash: hash,
    at: now,
    actor: b.actor
  });
  await cutSocial(db, async () => {}, userId);
}

/** Coupe les amis d'un compte (comme s'il les désactivait) et prévient ceux qui le voient. */
export async function cutSocial(db: Db, hub: Hub, userId: string): Promise<void> {
  await db.update(social).set({ enabled: false, online: false, playing: null }).where(eq(social.userId, userId));
  const linked = await db.select({ id: friends.userId }).from(friends).where(eq(friends.otherId, userId));
  await hub(linked.map((x) => x.id), { type: 'friends' });
  // Ses postes relisent leur état (compte et amis).
  await hub([userId], { type: 'settings' });
  await hub([userId], { type: 'account' });
}

/** Donne une sanction ; rend la ligne créée. `days` : durée, null : définitive. */
export async function sanction(
  db: Db,
  hub: Hub,
  input: { userId: string; kind: SanctionKind; reason: string; days: number | null; actor: string },
  now = Date.now()
): Promise<SanctionRow> {
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, input.userId));
  const [row] = await db
    .insert(sanctions)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      kind: input.kind,
      reason: input.reason,
      until: input.days === null ? null : now + input.days * 86_400_000,
      emailHash: input.kind === 'total' && u ? await emailHash(u.email) : null,
      at: now,
      actor: input.actor
    })
    .returning();
  await cutSocial(db, hub, input.userId);
  return row;
}

/** Lève une sanction en cours ; rend la ligne, ou null si elle n'existe pas ou n'est plus active. */
export async function lift(db: Db, hub: Hub, id: string, now = Date.now()): Promise<SanctionRow | null> {
  const [row] = await db
    .update(sanctions)
    .set({ liftedAt: now })
    .where(and(eq(sanctions.id, id), active(now)))
    .returning();
  if (!row) return null;
  // Les autres comptes à la même adresse sont libérés avec elle.
  if (row.emailHash && row.kind === 'total') {
    await db
      .update(sanctions)
      .set({ liftedAt: now })
      .where(and(eq(sanctions.emailHash, row.emailHash), eq(sanctions.kind, 'total'), active(now)));
  }
  // Les amis restent désactivés : la personne les réactive elle-même.
  await hub([row.userId], { type: 'settings' });
  await hub([row.userId], { type: 'account' });
  return row;
}
