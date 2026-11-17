// Bugs signalés depuis Hangar, dans le dashboard : liste filtrée par statut, fiche, capture, suivi
// (statut, version de correction, doublon, note interne). Un changement de statut est noté au
// journal et repeint le message Discord du bug.
import { and, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { BUG_STATUSES, type BugRow, OPEN_STATUSES, VERSION, bugKey, isBugStatus, updateBugMessage } from '../bug';
import type { Db, Env } from '../env';
import { adminLog, bugs } from '../schema';
import { logAction, logView } from './log';

type Vars = { Variables: { admin: string } };

const PAGE = 50;
const MAX_NOTE = 2000;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const view = (b: BugRow) => ({
  id: b.id,
  title: b.title,
  description: b.description,
  version: b.version,
  os: b.os,
  status: b.status,
  note: b.note,
  fixedIn: b.fixedIn,
  duplicateOf: b.duplicateOf,
  capture: !!b.capture,
  discord: !!b.discordId,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
  closedAt: b.closedAt
});

/** Nombre de bugs ouverts (accueil). */
export async function openBugs(db: Db): Promise<number> {
  const [r] = await db.select({ n: count() }).from(bugs).where(inArray(bugs.status, OPEN_STATUSES));
  return r.n;
}

export function bugRoutes(db: Db, env: Env) {
  const r = new Hono<Vars>();

  const find = async (raw: string) => {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    const [b] = await db.select().from(bugs).where(eq(bugs.id, id));
    return b ?? null;
  };

  /**
   * `statut` : `ouverts` (par défaut), `tous` ou un statut. `q` : numéro (`#12`) ou mots du titre.
   * `before` : numéro du dernier bug déjà vu (page suivante). Avec le nombre de bugs par statut.
   */
  r.get('/', async (c) => {
    const statut = c.req.query('statut') ?? 'ouverts';
    const q = (c.req.query('q') ?? '').trim().slice(0, 100);
    const before = Number(c.req.query('before'));
    const filters = [];
    if (statut === 'ouverts') filters.push(inArray(bugs.status, OPEN_STATUSES));
    else if (isBugStatus(statut)) filters.push(eq(bugs.status, statut));
    else if (statut !== 'tous') return c.json({ error: 'requete' }, 400);
    if (q) {
      const num = Number(q.replace(/^#/, ''));
      filters.push(
        or(
          Number.isSafeInteger(num) && num > 0 ? eq(bugs.id, num) : undefined,
          sql`${bugs.title} like ${likeOf(q)} escape '\\'`,
          sql`${bugs.description} like ${likeOf(q)} escape '\\'`
        )
      );
    }
    if (Number.isSafeInteger(before) && before > 0) filters.push(lt(bugs.id, before));
    const [rows, perStatus] = await Promise.all([
      db
        .select()
        .from(bugs)
        .where(and(...filters))
        .orderBy(desc(bugs.id))
        .limit(PAGE),
      db.select({ status: bugs.status, n: count() }).from(bugs).groupBy(bugs.status)
    ]);
    const counts = Object.fromEntries(perStatus.map((s) => [s.status, s.n]));
    return c.json({
      bugs: rows.map((b) => {
        const { description: _, note: __, ...rest } = view(b);
        return rest;
      }),
      counts,
      more: rows.length === PAGE
    });
  });

  r.get('/:id', async (c) => {
    const b = await find(c.req.param('id'));
    if (!b) return c.json({ error: 'introuvable' }, 404);
    const log = await db
      .select()
      .from(adminLog)
      .where(eq(adminLog.targetId, `bug:${b.id}`))
      .orderBy(desc(adminLog.at))
      .limit(PAGE);
    return c.json({ ...view(b), log: log.map(logView) });
  });

  r.get('/:id/capture', async (c) => {
    const b = await find(c.req.param('id'));
    const obj = b?.capture && env.AVATARS ? await env.AVATARS.get(bugKey(b.id)) : null;
    if (!b?.capture || !obj) return c.json({ error: 'introuvable' }, 404);
    return c.body(await obj.arrayBuffer(), 200, { 'content-type': b.capture, 'cache-control': 'private, max-age=3600' });
  });

  /** `{ status?, fixedIn?, duplicateOf?, note? }` : suivi du bug. `null` ou `''` efface un champ. */
  r.put('/:id', async (c) => {
    const b = await find(c.req.param('id'));
    if (!b) return c.json({ error: 'introuvable' }, 404);
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body)) return c.json({ error: 'requete' }, 400);

    const next = { status: b.status, fixedIn: b.fixedIn, duplicateOf: b.duplicateOf, note: b.note };
    if ('status' in body) {
      if (!isBugStatus(body.status)) return c.json({ error: 'requete' }, 400);
      next.status = body.status;
    }
    if ('fixedIn' in body) {
      const v = typeof body.fixedIn === 'string' ? body.fixedIn.trim() : body.fixedIn;
      if (v !== null && v !== '' && (typeof v !== 'string' || !VERSION.test(v))) return c.json({ error: 'version' }, 400);
      next.fixedIn = v || null;
    }
    if ('duplicateOf' in body) {
      const v = body.duplicateOf;
      if (v !== null && v !== '') {
        const other = typeof v === 'number' || typeof v === 'string' ? await find(String(v).replace(/^#/, '')) : null;
        if (!other || other.id === b.id) return c.json({ error: 'doublon' }, 400);
        next.duplicateOf = other.id;
      } else next.duplicateOf = null;
    }
    if ('note' in body) {
      if (body.note !== null && typeof body.note !== 'string') return c.json({ error: 'requete' }, 400);
      const v = (body.note ?? '').trim();
      if (v.length > MAX_NOTE) return c.json({ error: 'requete' }, 400);
      next.note = v || null;
    }
    // Les précisions ne valent que pour leur statut.
    if (next.status !== 'corrige') next.fixedIn = null;
    if (next.status !== 'doublon') next.duplicateOf = null;

    const now = Date.now();
    const wasOpen = isBugStatus(b.status) && BUG_STATUSES[b.status].open;
    const isOpen = BUG_STATUSES[next.status as keyof typeof BUG_STATUSES].open;
    const closedAt = isOpen ? null : wasOpen ? now : (b.closedAt ?? now);
    const [after] = await db
      .update(bugs)
      .set({ ...next, closedAt, updatedAt: now })
      .where(eq(bugs.id, b.id))
      .returning();

    const actor = c.get('admin');
    const target = `bug:${b.id}`;
    const shown = next.status !== b.status || next.fixedIn !== b.fixedIn || next.duplicateOf !== b.duplicateOf;
    if (shown) {
      await logAction(db, actor, 'bug.statut', target, {
        bug: b.id,
        de: b.status,
        vers: next.status,
        ...(next.fixedIn ? { fixedIn: next.fixedIn } : {}),
        ...(next.duplicateOf ? { duplicateOf: next.duplicateOf } : {})
      });
      await updateBugMessage(env, after);
    }
    if (next.note !== b.note) await logAction(db, actor, 'bug.note', target, { bug: b.id });
    return c.json(view(after));
  });

  return r;
}
