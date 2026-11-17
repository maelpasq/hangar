// Dashboard d'administration (docs/ADMIN.md) : servi sur sa propre adresse (`ADMIN_HOST`), derrière
// Cloudflare Access. `/api/*` : l'API du dashboard, réservée à l'administrateur (src/admin/access.ts) ;
// le reste : les fichiers de l'app web (`admin/dist`). Chaque action qui change quelque chose est
// inscrite au journal (`admin_log`).
import { and, count, desc, eq, gt, inArray, lt, or, sql, sum } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db, Env } from '../env';
import { isUserId } from '../profile';
import { adminLog, badges, covers, devices, entries, friends, gameSessions, reports, social, user } from '../schema';
import { BADGES, type Badge, type Hub, STALE, badgesOf, normCode, setBadge } from '../social';
import { type Keys, accessKeys, adminFromAccess } from './access';

type Vars = { Variables: { admin: string } };

export interface AdminDeps {
  hub: Hub;
  loadAvatar: (u: { id: string; image: string | null }) => Promise<{ type: string; bytes: Uint8Array } | null>;
  /** Clés publiques de Cloudflare Access (remplacées dans les tests). */
  keys?: Keys;
}

const DAY = 86_400_000;
const PAGE = 50;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** `%` et `_` pris à la lettre dans un `like`. */
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Inscrit une action au journal. */
export async function logAction(db: Db, actor: string, action: string, targetId: string | null, detail?: unknown) {
  await db.insert(adminLog).values({
    id: crypto.randomUUID(),
    at: Date.now(),
    actor,
    action,
    targetId,
    detail: detail === undefined ? null : JSON.stringify(detail)
  });
}

export function adminRoutes(db: Db, env: Env, deps: AdminDeps) {
  const app = new Hono<Vars>();
  const keys = deps.keys ?? accessKeys;

  app.onError((err, c) => {
    console.error('[hangar] admin', err);
    return c.json({ error: 'erreur' }, 500);
  });

  const api = new Hono<Vars>();
  api.use('*', async (c, next) => {
    const email = await adminFromAccess(c.req.header('cf-access-jwt-assertion'), env, keys).catch((e) => {
      console.error('[hangar] admin : vérification Access', e instanceof Error ? e.message : '');
      return null;
    });
    if (!email) return c.json({ error: 'interdit' }, 403);
    // Une écriture vient forcément du dashboard lui-même.
    if (c.req.method !== 'GET' && c.req.header('origin') !== `https://${env.ADMIN_HOST}`) {
      return c.json({ error: 'origine' }, 403);
    }
    c.set('admin', email);
    c.header('cache-control', 'no-store');
    await next();
  });
  api.notFound((c) => c.json({ error: 'introuvable' }, 404));

  api.get('/me', (c) => c.json({ email: c.get('admin'), badges: BADGES }));

  /** Chiffres de l'accueil, et inscriptions par jour sur 30 jours (jours UTC). */
  api.get('/stats', async (c) => {
    const now = Date.now();
    const week = now - 7 * DAY;
    const today = Math.floor(now / DAY);
    const [[users], [fresh], [active], [friendsOn], [online], [reported], [reportedWeek], perDay, perBadge] = await Promise.all([
      db.select({ n: count() }).from(user),
      db.select({ n: count() }).from(user).where(gt(user.createdAt, new Date(week))),
      db.select({ n: sql<number>`count(distinct ${devices.userId})` }).from(devices).where(gt(devices.lastSeen, week)),
      db.select({ n: count() }).from(social).where(eq(social.enabled, true)),
      db.select({ n: count() }).from(social).where(and(eq(social.online, true), gt(social.seen, now - STALE))),
      db.select({ n: count() }).from(reports),
      db.select({ n: count() }).from(reports).where(gt(reports.at, week)),
      db
        .select({ day: sql<number>`cast(${user.createdAt} / ${DAY} as integer)`.as('day'), n: count() })
        .from(user)
        .where(gt(user.createdAt, new Date((today - 29) * DAY)))
        .groupBy(sql`day`),
      db.select({ badge: badges.badge, n: count() }).from(badges).groupBy(badges.badge)
    ]);
    const byDay = new Map(perDay.map((r) => [Number(r.day), r.n]));
    return c.json({
      users: users.n,
      newWeek: fresh.n,
      activeWeek: Number(active.n),
      friendsOn: friendsOn.n,
      online: online.n,
      reports: reported.n,
      reportsWeek: reportedWeek.n,
      signups: Array.from({ length: 30 }, (_, i) => {
        const day = today - 29 + i;
        return { day: day * DAY, n: byDay.get(day) ?? 0 };
      }),
      badges: Object.fromEntries(perBadge.map((r) => [r.badge, r.n]))
    });
  });

  /** Recherche : identifiant ou code ami exacts, sinon pseudo ou e-mail (50 au plus, récents d'abord). */
  api.get('/users', async (c) => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 100);
    const lastSeen = sql<number | null>`(select max(${devices.lastSeen}) from ${devices} where ${devices.userId} = ${user.id})`;
    const cols = { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, lastSeen };
    let where;
    if (q) {
      const code = normCode(q);
      const byCode = code ? await db.select({ id: social.userId }).from(social).where(eq(social.code, code)) : [];
      const pattern = likeOf(q);
      where = or(
        eq(user.id, q),
        byCode.length ? inArray(user.id, byCode.map((r) => r.id)) : undefined,
        sql`${user.name} like ${pattern} escape '\\'`,
        sql`${user.email} like ${pattern} escape '\\'`
      );
    }
    const rows = await db.select(cols).from(user).where(where).orderBy(desc(user.createdAt)).limit(PAGE);
    const certified = rows.length
      ? new Set(
          (
            await db
              .select({ id: badges.userId })
              .from(badges)
              .where(and(inArray(badges.userId, rows.map((r) => r.id)), eq(badges.badge, 'certifie')))
          ).map((r) => r.id)
        )
      : new Set<string>();
    return c.json({
      users: rows.map((r) => ({
        id: r.id,
        name: r.name.trim() || 'Joueur',
        email: r.email,
        since: r.createdAt.getTime(),
        lastSeen: r.lastSeen === null ? null : Number(r.lastSeen),
        certified: certified.has(r.id)
      }))
    });
  });

  /** Fiche d'un compte : identité, postes, amis, synchro, badges, signalements, journal. */
  api.get('/users/:id', async (c) => {
    const id = c.req.param('id');
    const [u] = isUserId(id) ? await db.select().from(user).where(eq(user.id, id)) : [];
    if (!u) return c.json({ error: 'introuvable' }, 404);
    const [posts, [soc], [nFriends], [nEntries], [play], [nCovers], received, [made], log, given] = await Promise.all([
      db
        .select({ id: devices.deviceId, name: devices.name, createdAt: devices.createdAt, lastSeen: devices.lastSeen })
        .from(devices)
        .where(eq(devices.userId, id))
        .orderBy(desc(devices.lastSeen)),
      db.select().from(social).where(eq(social.userId, id)),
      db.select({ n: count() }).from(friends).where(and(eq(friends.userId, id), eq(friends.state, 'friend'))),
      db.select({ n: count() }).from(entries).where(and(eq(entries.userId, id), eq(entries.deleted, false))),
      db
        .select({ n: count(), ms: sum(sql`${gameSessions.end} - ${gameSessions.start}`) })
        .from(gameSessions)
        .where(eq(gameSessions.userId, id)),
      db.select({ n: count() }).from(covers).where(eq(covers.userId, id)),
      db
        .select({
          id: reports.id,
          reporterId: reports.reporterId,
          reporterName: user.name,
          reason: reports.reason,
          excerpt: reports.excerpt,
          at: reports.at
        })
        .from(reports)
        .leftJoin(user, eq(user.id, reports.reporterId))
        .where(eq(reports.targetId, id))
        .orderBy(desc(reports.at))
        .limit(PAGE),
      db.select({ n: count() }).from(reports).where(eq(reports.reporterId, id)),
      db.select().from(adminLog).where(eq(adminLog.targetId, id)).orderBy(desc(adminLog.at)).limit(PAGE),
      badgesOf(db, id)
    ]);
    return c.json({
      id: u.id,
      name: u.name.trim() || 'Joueur',
      email: u.email,
      emailVerified: u.emailVerified,
      since: u.createdAt.getTime(),
      avatar: !!u.image,
      devices: posts,
      social: soc
        ? {
            enabled: soc.enabled,
            code: soc.code,
            findable: soc.findable,
            online: soc.online && soc.seen > Date.now() - STALE,
            seen: soc.seen || null,
            friends: nFriends.n
          }
        : null,
      library: { entries: nEntries.n, sessions: play.n, playMs: Number(play.ms ?? 0), covers: nCovers.n },
      badges: given,
      reportsReceived: received.map((r) => ({ ...r, reporterName: r.reporterName?.trim() || null })),
      reportsMade: made.n,
      log: log.map(logView)
    });
  });

  api.get('/users/:id/avatar', async (c) => {
    const id = c.req.param('id');
    const [u] = isUserId(id) ? await db.select({ id: user.id, image: user.image }).from(user).where(eq(user.id, id)) : [];
    const pic = u ? await deps.loadAvatar(u).catch(() => null) : null;
    if (!pic) return c.json({ error: 'introuvable' }, 404);
    return c.body(pic.bytes as Uint8Array<ArrayBuffer>, 200, { 'content-type': pic.type, 'cache-control': 'private, max-age=300' });
  });

  /** `{ badge, on }` : donne ou retire un badge (comme le bouton de l'app de l'administrateur). */
  api.put('/users/:id/badges', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body) || !BADGES.includes(body.badge as Badge) || typeof body.on !== 'boolean') {
      return c.json({ error: 'requete' }, 400);
    }
    const id = c.req.param('id');
    const [u] = isUserId(id) ? await db.select({ id: user.id }).from(user).where(eq(user.id, id)) : [];
    if (!u) return c.json({ error: 'introuvable' }, 404);
    const before = await badgesOf(db, id);
    const after = await setBadge(db, deps.hub, id, body.badge as Badge, body.on);
    if (before.includes(body.badge as Badge) !== body.on) {
      await logAction(db, c.get('admin'), body.on ? 'badge.donner' : 'badge.retirer', id, { badge: body.badge });
    }
    return c.json({ badges: after });
  });

  /** Journal, du plus récent au plus ancien (`before` : date de la dernière ligne déjà vue). */
  api.get('/log', async (c) => {
    const before = Number(c.req.query('before'));
    const rows = await db
      .select({ log: adminLog, name: user.name })
      .from(adminLog)
      .leftJoin(user, eq(user.id, adminLog.targetId))
      .where(Number.isSafeInteger(before) && before > 0 ? lt(adminLog.at, before) : undefined)
      .orderBy(desc(adminLog.at))
      .limit(PAGE);
    return c.json({
      log: rows.map((r) => ({ ...logView(r.log), targetName: r.name?.trim() || null })),
      more: rows.length === PAGE
    });
  });

  app.route('/api', api);

  // Fichiers de l'app web ; une adresse inconnue rend index.html (`not_found_handling`).
  app.all('*', async (c) => {
    if (!env.ASSETS) return c.text('Dashboard non compilé (admin/dist).', 503);
    const res = await env.ASSETS.fetch(c.req.raw);
    const out = new Response(res.body, res);
    out.headers.set(
      'content-security-policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );
    out.headers.set('x-content-type-options', 'nosniff');
    out.headers.set('referrer-policy', 'no-referrer');
    return out;
  });

  return app;
}

function logView(r: typeof adminLog.$inferSelect) {
  let detail: unknown = null;
  try {
    detail = r.detail ? JSON.parse(r.detail) : null;
  } catch {}
  return { id: r.id, at: r.at, actor: r.actor, action: r.action, targetId: r.targetId, detail };
}
