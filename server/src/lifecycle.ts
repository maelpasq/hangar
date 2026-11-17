// Fin de vie des données du compte (docs/COMPTE.md, section 9) :
// - suppression complète d'un compte, à la demande ou après 2 ans sans connexion ;
// - ménage quotidien (tâche planifiée du Worker) : traces de connexion, jaquettes plus utilisées,
//   comptes inactifs.
import { and, eq, like, lt, sql } from 'drizzle-orm';
import type { AvatarStore, Db, Notice } from './env';
import { cleanBugCaptures } from './bug';
import { avatarKey, coverKey } from './profile';
import { cleanActivity, deleteSocial } from './social';
import {
  account,
  covers,
  devices,
  entries,
  gameSessions,
  loginCodes,
  profiles,
  rateLimit,
  secrets,
  session,
  user,
  verification
} from './schema';

export const DAY = 86_400_000;
/** Compte sans aucune connexion pendant 2 ans : supprimé. */
export const INACTIVE_DAYS = 730;
/** Rappel par e-mail, 30 jours avant la suppression. */
export const WARN_DAYS = 30;
/** Une jaquette envoyée reste au moins un jour, le temps que l'élément qui la désigne arrive. */
const COVER_GRACE = DAY;
/** Comptes et jaquettes traités par passage (limite de sous-requêtes d'un Worker). */
const PER_RUN = 25;
const COVERS_PER_RUN = 500;

/** Supprime des objets R2, par lots de 1000 clés. */
async function dropObjects(bucket: AvatarStore, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
}

/** Supprime le compte et tout ce qui lui est rattaché. Rien n'est gardé. */
export async function deleteAccount(db: Db, bucket: AvatarStore | undefined, id: string): Promise<void> {
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, id));
  const pics = await db.select({ hash: covers.hash }).from(covers).where(eq(covers.userId, id));
  if (bucket) await dropObjects(bucket, [avatarKey(id), ...pics.map((p) => coverKey(id, p.hash))]);
  const socialRows = await deleteSocial(db, bucket, id);
  await db.batch([
    ...socialRows,
    db.delete(entries).where(eq(entries.userId, id)),
    db.delete(gameSessions).where(eq(gameSessions.userId, id)),
    db.delete(covers).where(eq(covers.userId, id)),
    db.delete(secrets).where(eq(secrets.userId, id)),
    db.delete(devices).where(eq(devices.userId, id)),
    db.delete(loginCodes).where(eq(loginCodes.userId, id)),
    db.delete(profiles).where(eq(profiles.userId, id)),
    db.delete(session).where(eq(session.userId, id)),
    db.delete(account).where(eq(account.userId, id)),
    // `_` et `%` d'une adresse sont des jokers de LIKE : échappés, sinon d'autres comptes y passent.
    db.delete(verification).where(sql`${verification.identifier} like ${`%${(u?.email ?? id).replace(/[\\%_]/g, (ch) => `\\${ch}`)}`} escape '\\'`),
    db.delete(user).where(eq(user.id, id))
  ]);
}

/** Jaquettes qu'aucun élément `cover:` du compte ne désigne plus : retirées de R2 et de la base. */
export async function cleanCovers(db: Db, bucket: AvatarStore | undefined, now: number): Promise<number> {
  if (!bucket) return 0;
  const orphans = await db
    .select({ userId: covers.userId, hash: covers.hash })
    .from(covers)
    .where(
      and(
        lt(covers.createdAt, now - COVER_GRACE),
        sql`not exists (select 1 from ${entries} where ${entries.userId} = ${covers.userId} and ${entries.deleted} = 0 and ${entries.value} = '"file:' || ${covers.hash} || '"')`
      )
    )
    .limit(COVERS_PER_RUN);
  if (!orphans.length) return 0;
  await dropObjects(
    bucket,
    orphans.map((o) => coverKey(o.userId, o.hash))
  );
  const [first, ...rest] = orphans.map((o) => db.delete(covers).where(and(eq(covers.userId, o.userId), eq(covers.hash, o.hash))));
  await db.batch([first, ...rest]);
  return orphans.length;
}

/**
 * Comptes inactifs : dernière activité = dernier passage d'un poste, sinon la création du compte.
 * Après 23 mois, un e-mail de rappel ; 30 jours plus tard au moins, sans retour entre-temps, la
 * suppression. Une connexion après le rappel remet tout à zéro.
 */
export async function expireAccounts(
  db: Db,
  bucket: AvatarStore | undefined,
  notice: Notice,
  now: number
): Promise<{ warned: number; deleted: number }> {
  const seen = db
    .select({ userId: devices.userId, last: sql<number>`max(${devices.lastSeen})`.as('last') })
    .from(devices)
    .groupBy(devices.userId)
    .as('seen');
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      joined: profiles.createdAt,
      warnedAt: profiles.warnedAt,
      last: seen.last
    })
    .from(user)
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .leftJoin(seen, eq(seen.userId, user.id));

  const warnFrom = now - (INACTIVE_DAYS - WARN_DAYS) * DAY;
  const deleteFrom = now - INACTIVE_DAYS * DAY;
  let warned = 0;
  let deleted = 0;
  for (const r of rows) {
    const last = Math.max(r.last ?? 0, r.joined ?? 0, r.createdAt.getTime());
    if (last >= warnFrom) continue;
    const told = r.warnedAt !== null && r.warnedAt >= last;
    if (!told) {
      if (warned >= PER_RUN) continue;
      try {
        await notice(r.email);
      } catch (e) {
        console.error('[hangar] rappel de compte inactif', e);
        continue;
      }
      await db
        .insert(profiles)
        .values({ userId: r.id, createdAt: last, warnedAt: now })
        .onConflictDoUpdate({ target: profiles.userId, set: { warnedAt: now } });
      warned++;
    } else if (last < deleteFrom && r.warnedAt! <= now - WARN_DAYS * DAY && deleted < PER_RUN) {
      await deleteAccount(db, bucket, r.id);
      deleted++;
    }
  }
  return { warned, deleted };
}

/**
 * Traces de connexion dans le navigateur (session de 15 minutes avec adresse IP et navigateur,
 * codes e-mail, limite de débit par adresse) : effacées un jour après leur fin.
 */
export async function cleanLogins(db: Db, now: number): Promise<void> {
  const before = now - DAY;
  await db.batch([
    db.delete(session).where(lt(session.expiresAt, new Date(before))),
    db.delete(verification).where(lt(verification.expiresAt, new Date(before))),
    db.delete(rateLimit).where(lt(rateLimit.lastRequest, before)),
    db.delete(loginCodes).where(lt(loginCodes.expiresAt, before))
  ]);
}

/** Tâche planifiée quotidienne. */
export async function daily(db: Db, bucket: AvatarStore | undefined, notice: Notice, now = Date.now()): Promise<void> {
  await cleanLogins(db, now);
  await cleanActivity(db, now);
  const freed = await cleanCovers(db, bucket, now);
  const shots = await cleanBugCaptures(db, bucket, now);
  const { warned, deleted } = await expireAccounts(db, bucket, notice, now);
  console.log(`[hangar] ménage : ${freed} jaquette(s), ${shots} capture(s) de bug, ${warned} rappel(s), ${deleted} compte(s) supprimé(s)`);
}
