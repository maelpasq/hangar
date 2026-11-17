// Modération dans le dashboard : signalements de comptes et de messages (statut), sanctions
// (amis coupés ou compte suspendu, pour un temps ou définitivement). Tout est noté au journal.
import { and, count, desc, eq, inArray, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { Hono } from 'hono';
import type { Db, Env } from '../env';
import { isUserId } from '../profile';
import { SANCTION_KINDS, type SanctionKind, lift, sanction } from '../sanctions';
import { reports, sanctions, user } from '../schema';
import type { Hub } from '../social';
import { logAction } from './log';

type Vars = { Variables: { admin: string } };

export const REPORT_STATUSES = ['ouvert', 'traite', 'rejete'] as const;
const PAGE = 50;
const MAX_REASON = 500;
/** Durées proposées par le dashboard, en jours ; null : définitive. */
const MAX_DAYS = 3650;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function openReports(db: Db): Promise<number> {
  const [r] = await db.select({ n: count() }).from(reports).where(eq(reports.status, 'ouvert'));
  return r.n;
}

export const sanctionView = (s: typeof sanctions.$inferSelect, now = Date.now()) => ({
  id: s.id,
  kind: s.kind,
  reason: s.reason,
  until: s.until,
  at: s.at,
  actor: s.actor,
  liftedAt: s.liftedAt,
  active: s.liftedAt === null && (s.until === null || s.until > now)
});

export function moderationRoutes(db: Db, _env: Env, hub: Hub) {
  const r = new Hono<Vars>();
  const reporter = alias(user, 'reporter');
  const target = alias(user, 'target');

  /** `statut` : `ouvert` (par défaut), `traite`, `rejete` ou `tous` ; `before` : date du dernier vu. */
  r.get('/reports', async (c) => {
    const statut = c.req.query('statut') ?? 'ouvert';
    if (statut !== 'tous' && !REPORT_STATUSES.includes(statut as never)) return c.json({ error: 'requete' }, 400);
    const before = Number(c.req.query('before'));
    const filters = [];
    if (statut !== 'tous') filters.push(eq(reports.status, statut));
    if (Number.isSafeInteger(before) && before > 0) filters.push(lt(reports.at, before));
    const [rows, perStatus] = await Promise.all([
      db
        .select({ r: reports, reporterName: reporter.name, targetName: target.name })
        .from(reports)
        .leftJoin(reporter, eq(reporter.id, reports.reporterId))
        .leftJoin(target, eq(target.id, reports.targetId))
        .where(and(...filters))
        .orderBy(desc(reports.at))
        .limit(PAGE),
      db.select({ status: reports.status, n: count() }).from(reports).groupBy(reports.status)
    ]);
    // Sanctions en cours des comptes visés, pour les repérer d'un coup d'oeil.
    const ids = [...new Set(rows.map((x) => x.r.targetId))];
    const now = Date.now();
    const byUser = new Map<string, string[]>();
    if (ids.length) {
      for (const s of await db.select().from(sanctions).where(inArray(sanctions.userId, ids))) {
        if (sanctionView(s, now).active) byUser.set(s.userId, [...new Set([...(byUser.get(s.userId) ?? []), s.kind])]);
      }
    }
    return c.json({
      reports: rows.map((x) => ({
        id: x.r.id,
        reporterId: x.r.reporterId,
        reporterName: x.reporterName?.trim() || null,
        targetId: x.r.targetId,
        targetName: x.targetName?.trim() || null,
        targetSanctions: byUser.get(x.r.targetId) ?? [],
        reason: x.r.reason,
        excerpt: x.r.excerpt,
        at: x.r.at,
        status: x.r.status,
        handledAt: x.r.handledAt
      })),
      counts: Object.fromEntries(perStatus.map((s) => [s.status, s.n])),
      more: rows.length === PAGE
    });
  });

  /** `{ status }` : ouvert, traité ou rejeté. */
  r.put('/reports/:id', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body) || !REPORT_STATUSES.includes(body.status as never)) return c.json({ error: 'requete' }, 400);
    const [prev] = await db.select().from(reports).where(eq(reports.id, c.req.param('id')));
    if (!prev) return c.json({ error: 'introuvable' }, 404);
    const status = body.status as string;
    if (status === prev.status) return c.json({ status });
    await db
      .update(reports)
      .set({ status, handledAt: status === 'ouvert' ? null : Date.now() })
      .where(eq(reports.id, prev.id));
    await logAction(db, c.get('admin'), 'signalement.statut', prev.targetId, { report: prev.id, de: prev.status, vers: status });
    return c.json({ status });
  });

  /** `{ kind, reason, days }` : sanction d'un compte (`days` : 1 à 3650, null : définitive). */
  r.post('/users/:id/sanctions', async (c) => {
    const id = c.req.param('id');
    const [u] = isUserId(id) ? await db.select({ id: user.id }).from(user).where(eq(user.id, id)) : [];
    if (!u) return c.json({ error: 'introuvable' }, 404);
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body) || !SANCTION_KINDS.includes(body.kind as SanctionKind)) return c.json({ error: 'requete' }, 400);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length > MAX_REASON) return c.json({ error: 'motif' }, 400);
    const days = body.days;
    if (days !== null && !(typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= MAX_DAYS)) {
      return c.json({ error: 'duree' }, 400);
    }
    const row = await sanction(db, hub, { userId: id, kind: body.kind as SanctionKind, reason, days, actor: c.get('admin') });
    await logAction(db, c.get('admin'), 'sanction.donner', id, { sanction: row.id, kind: row.kind, days, reason });
    return c.json(sanctionView(row));
  });

  /** Lève une sanction en cours. */
  r.delete('/sanctions/:id', async (c) => {
    const row = await lift(db, hub, c.req.param('id'));
    if (!row) return c.json({ error: 'introuvable' }, 404);
    await logAction(db, c.get('admin'), 'sanction.lever', row.userId, { sanction: row.id, kind: row.kind });
    return c.json(sanctionView(row));
  });

  return r;
}
