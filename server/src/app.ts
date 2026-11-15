// API du compte Hangar (docs/COMPTE.md, section 8). L'app s'identifie par un jeton de poste
// (`Authorization: Bearer`), obtenu après la connexion dans le navigateur.
import { and, asc, eq, gt, like, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createAuth, providers, resendMailer } from './auth';
import { hashToken, pkceChallenge, randomToken, seal, unseal } from './crypto';
import type { Db, Env, Mailer } from './env';
import { loginPage, pageHeaders } from './login-page';
import { account, devices, entries, gameSessions, loginCodes, profiles, secrets, session, user, verification } from './schema';

/** Changements par envoi ; une page de lecture en contient au plus le double (voir `page`). */
const MAX_CHANGES = 1000;
const PAGE = MAX_CHANGES * 2;
const MAX_KEY = 512;
const MAX_VALUE = 16 * 1024;
/** Éléments par compte : garde-fou contre un client fou, très au-dessus d'une vraie bibliothèque. */
const MAX_ENTRIES = 50_000;
const CODE_TTL = 2 * 60_000;
const DEVICE_ID = /^[0-9a-f]{32}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const STATE = /^[A-Za-z0-9_-]{8,128}$/;
const KEY = /^[a-z]+:.+$/s;
const SECRET_NAMES = ['steamgriddb'];

type Device = typeof devices.$inferSelect;
type Vars = { Variables: { device: Device } };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

/** Retour vers l'app : uniquement l'adresse locale, sur le port qu'elle a ouvert. */
function loopback(q: URLSearchParams): { port: number; challenge: string; state: string } | null {
  const port = Number(q.get('port'));
  const challenge = q.get('challenge') ?? '';
  const state = q.get('state') ?? '';
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
  if (!CHALLENGE.test(challenge) || !STATE.test(state)) return null;
  return { port, challenge, state };
}

/**
 * Garde des pages entières : `rows` (triées par `seq`) en contient une de trop si la suite existe.
 * Les lignes d'un même envoi partagent leur `seq` : un groupe coupé est laissé à la page suivante.
 */
function page<T extends { seq: number }>(rows: T[], current: number): { rows: T[]; cursor: number; more: boolean } {
  if (rows.length <= PAGE) return { rows, cursor: current, more: false };
  const cut = rows[PAGE].seq;
  const kept = rows.filter((r) => r.seq < cut);
  return { rows: kept, cursor: kept[kept.length - 1].seq, more: true };
}

export function createApp(db: Db, env: Env, sendMail: Mailer = resendMailer(env)) {
  const auth = createAuth(db, env, sendMail);
  const app = new Hono<Vars>();

  app.onError((err, c) => {
    console.error('[hangar]', err);
    return c.json({ error: 'erreur' }, 500);
  });
  app.notFound((c) => c.json({ error: 'introuvable' }, 404));
  app.use('*', bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: 'trop_gros' }, 413) }));

  app.get('/', (c) => c.json({ name: 'Hangar', ok: true }));

  // --- Connexion (navigateur) ---

  app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));

  app.get('/login', (c) => {
    const nonce = randomToken();
    const ok = loopback(new URL(c.req.url).searchParams);
    const html = ok
      ? loginPage(nonce, providers(env))
      : loginPage(nonce, [], 'Ce lien de connexion est incomplet. Relancez la connexion depuis Hangar.');
    return c.body(html, ok ? 200 : 400, pageHeaders(nonce));
  });

  /** Connectée dans le navigateur : rend un code à usage unique à l'app, sur son adresse locale. */
  app.get('/desktop/finish', async (c) => {
    const url = new URL(c.req.url);
    const target = loopback(url.searchParams);
    const current = target ? await auth.api.getSession({ headers: c.req.raw.headers }) : null;
    if (!target || !current) return c.redirect(`/login${url.search}`, 302);
    const code = randomToken();
    const now = Date.now();
    await db.batch([
      db.delete(loginCodes).where(sql`${loginCodes.expiresAt} < ${now}`),
      db.insert(loginCodes).values({
        codeHash: await hashToken(code),
        userId: current.user.id,
        challenge: target.challenge,
        expiresAt: now + CODE_TTL
      }),
      // La session du navigateur a fait son travail : le poste aura son propre jeton.
      db.delete(session).where(eq(session.id, current.session.id))
    ]);
    return c.redirect(`http://127.0.0.1:${target.port}/?code=${code}&state=${target.state}`, 302);
  });

  /** L'app échange le code (et le vérifieur PKCE) contre le jeton de ce poste. */
  app.post('/desktop/token', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isObject(body)) return c.json({ error: 'requete' }, 400);
    const code = str(body.code, 128);
    const verifier = str(body.verifier, 128);
    const deviceId = str(body.deviceId, 32);
    const name = str(typeof body.deviceName === 'string' ? body.deviceName.trim() : null, 60) ?? 'PC';
    if (!code || !verifier || !deviceId || !DEVICE_ID.test(deviceId)) return c.json({ error: 'requete' }, 400);

    const [row] = await db
      .delete(loginCodes)
      .where(eq(loginCodes.codeHash, await hashToken(code)))
      .returning();
    if (!row || row.expiresAt < Date.now() || row.challenge !== (await pkceChallenge(verifier))) {
      return c.json({ error: 'code' }, 401);
    }
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const now = Date.now();
    await db.batch([
      db.insert(profiles).values({ userId: row.userId, createdAt: now }).onConflictDoNothing(),
      db
        .insert(devices)
        .values({ userId: row.userId, deviceId, name, tokenHash, createdAt: now, lastSeen: now })
        .onConflictDoUpdate({ target: [devices.userId, devices.deviceId], set: { name, tokenHash, lastSeen: now } })
    ]);
    return c.json({ token });
  });

  // --- Tout le reste demande le jeton du poste ---

  const api = new Hono<Vars>();

  api.use('*', async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const [device] = token
      ? await db
          .select()
          .from(devices)
          .where(eq(devices.tokenHash, await hashToken(token)))
      : [];
    if (!device) return c.json({ error: 'non_connecte' }, 401);
    const now = Date.now();
    if (now - device.lastSeen > 3_600_000) {
      await db
        .update(devices)
        .set({ lastSeen: now })
        .where(and(eq(devices.userId, device.userId), eq(devices.deviceId, device.deviceId)));
    }
    c.set('device', device);
    await next();
  });

  const deviceList = async (me: Device) =>
    (await db.select().from(devices).where(eq(devices.userId, me.userId)).orderBy(asc(devices.createdAt))).map((d) => ({
      id: d.deviceId,
      name: d.name,
      createdAt: d.createdAt,
      lastSeen: d.lastSeen,
      connected: d.tokenHash !== null,
      current: d.deviceId === me.deviceId
    }));

  api.get('/me', async (c) => {
    const me = c.get('device');
    const [u] = await db.select().from(user).where(eq(user.id, me.userId));
    if (!u) return c.json({ error: 'non_connecte' }, 401);
    return c.json({
      user: { id: u.id, email: u.email, name: u.name, image: u.image, createdAt: u.createdAt.getTime() },
      devices: await deviceList(me)
    });
  });

  /** Déconnecte ce poste. Ses données restent sur le compte et sur le poste. */
  api.post('/logout', async (c) => {
    const me = c.get('device');
    await db
      .update(devices)
      .set({ tokenHash: null })
      .where(and(eq(devices.userId, me.userId), eq(devices.deviceId, me.deviceId)));
    return c.json({ ok: true });
  });

  api.put('/devices/:id', async (c) => {
    const me = c.get('device');
    const body: unknown = await c.req.json().catch(() => null);
    const name = isObject(body) && typeof body.name === 'string' ? str(body.name.trim(), 60) : null;
    if (!name) return c.json({ error: 'requete' }, 400);
    const done = await db
      .update(devices)
      .set({ name })
      .where(and(eq(devices.userId, me.userId), eq(devices.deviceId, c.req.param('id'))))
      .returning({ id: devices.deviceId });
    return done.length ? c.json({ ok: true }) : c.json({ error: 'introuvable' }, 404);
  });

  /** Déconnecte un autre poste à distance (PC perdu ou vendu). */
  api.delete('/devices/:id', async (c) => {
    const me = c.get('device');
    const done = await db
      .update(devices)
      .set({ tokenHash: null })
      .where(and(eq(devices.userId, me.userId), eq(devices.deviceId, c.req.param('id'))))
      .returning({ id: devices.deviceId });
    return done.length ? c.json({ ok: true }) : c.json({ error: 'introuvable' }, 404);
  });

  // --- Synchro ---

  const since = (raw: string | undefined): number | null => {
    const n = Number(raw ?? 0);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  };
  const cursorOf = db
    .select({ cursor: profiles.cursor })
    .from(profiles)
    .where(eq(profiles.userId, sql.placeholder('user')))
    .prepare();
  const nextSeq = (userId: string) => sql`(select ${profiles.cursor} from ${profiles} where ${profiles.userId} = ${userId})`;
  const bump = (userId: string) =>
    db
      .update(profiles)
      .set({ cursor: sql`${profiles.cursor} + 1` })
      .where(eq(profiles.userId, userId))
      .returning({ cursor: profiles.cursor });

  api.get('/sync', async (c) => {
    const me = c.get('device');
    const from = since(c.req.query('since'));
    if (from === null) return c.json({ error: 'requete' }, 400);
    // Le curseur est lu avant les lignes : au pire, la fois suivante relit quelques lignes.
    const [current] = await cursorOf.all({ user: me.userId });
    const rows = await db
      .select()
      .from(entries)
      .where(and(eq(entries.userId, me.userId), gt(entries.seq, from)))
      .orderBy(asc(entries.seq))
      .limit(PAGE + 1);
    const p = page(rows, current?.cursor ?? 0);
    return c.json({
      cursor: p.cursor,
      more: p.more,
      changes: p.rows.map((r) => ({
        key: r.key,
        value: r.deleted ? null : r.value,
        updatedAt: r.updatedAt,
        deviceId: r.deviceId
      }))
    });
  });

  /** Envoi groupé. La modification la plus récente gagne, élément par élément. */
  api.post('/sync', async (c) => {
    const me = c.get('device');
    const body: unknown = await c.req.json().catch(() => null);
    const list = isObject(body) && Array.isArray(body.changes) ? body.changes : null;
    if (!list || list.length > MAX_CHANGES) return c.json({ error: 'requete' }, 400);
    const now = Date.now();
    const rows = new Map<string, Omit<typeof entries.$inferInsert, 'seq'>>();
    for (const ch of list as unknown[]) {
      if (!isObject(ch)) return c.json({ error: 'requete' }, 400);
      const key = str(ch.key, MAX_KEY);
      const deleted = ch.value === null;
      const value = deleted ? null : str(ch.value, MAX_VALUE);
      if (!key || !KEY.test(key) || (!deleted && value === null) || !isTime(ch.updatedAt)) {
        return c.json({ error: 'requete' }, 400);
      }
      // Une horloge en avance ne doit pas gagner pour toujours : jamais plus tard que maintenant.
      const updatedAt = Math.min(ch.updatedAt, now);
      const prev = rows.get(key);
      if (prev && prev.updatedAt >= updatedAt) continue;
      rows.set(key, { userId: me.userId, key, value, updatedAt, deviceId: me.deviceId, deleted });
    }
    if (!rows.size) {
      const [current] = await cursorOf.all({ user: me.userId });
      return c.json({ cursor: current?.cursor ?? 0 });
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(entries)
      .where(eq(entries.userId, me.userId));
    if (count + rows.size > MAX_ENTRIES) return c.json({ error: 'plein' }, 413);
    const [bumped] = await db.batch([
      bump(me.userId),
      db
        .insert(entries)
        .values([...rows.values()].map((r) => ({ ...r, seq: nextSeq(me.userId) })))
        .onConflictDoUpdate({
          target: [entries.userId, entries.key],
          set: {
            value: sql`excluded.value`,
            updatedAt: sql`excluded.updated_at`,
            deviceId: sql`excluded.device_id`,
            deleted: sql`excluded.deleted`,
            seq: sql`excluded.seq`
          },
          setWhere: sql`excluded.updated_at > ${entries.updatedAt}`
        })
    ]);
    return c.json({ cursor: bumped[0]?.cursor ?? 0 });
  });

  // --- Sessions de jeu ---

  api.get('/sessions', async (c) => {
    const me = c.get('device');
    const from = since(c.req.query('since'));
    if (from === null) return c.json({ error: 'requete' }, 400);
    const [current] = await cursorOf.all({ user: me.userId });
    const rows = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.userId, me.userId), gt(gameSessions.seq, from)))
      .orderBy(asc(gameSessions.seq))
      .limit(PAGE + 1);
    const p = page(rows, current?.cursor ?? 0);
    return c.json({
      cursor: p.cursor,
      more: p.more,
      sessions: p.rows.map((r) => ({ id: r.id, gameId: r.gameId, start: r.start, end: r.end, deviceId: r.deviceId }))
    });
  });

  /** Ajout seulement : une session déjà connue (même identifiant) est ignorée. */
  api.post('/sessions', async (c) => {
    const me = c.get('device');
    const body: unknown = await c.req.json().catch(() => null);
    const list = isObject(body) && Array.isArray(body.sessions) ? body.sessions : null;
    if (!list || list.length > MAX_CHANGES) return c.json({ error: 'requete' }, 400);
    const rows = new Map<string, Omit<typeof gameSessions.$inferInsert, 'seq'>>();
    for (const s of list as unknown[]) {
      if (!isObject(s)) return c.json({ error: 'requete' }, 400);
      const id = str(s.id, 64);
      const gameId = str(s.gameId, MAX_KEY);
      if (!id || !gameId || !isTime(s.start) || !isTime(s.end) || s.end < s.start) {
        return c.json({ error: 'requete' }, 400);
      }
      rows.set(id, { userId: me.userId, id, gameId, start: s.start, end: s.end, deviceId: me.deviceId });
    }
    if (!rows.size) {
      const [current] = await cursorOf.all({ user: me.userId });
      return c.json({ cursor: current?.cursor ?? 0 });
    }
    const [bumped] = await db.batch([
      bump(me.userId),
      db
        .insert(gameSessions)
        .values([...rows.values()].map((r) => ({ ...r, seq: nextSeq(me.userId) })))
        .onConflictDoNothing()
    ]);
    return c.json({ cursor: bumped[0]?.cursor ?? 0 });
  });

  // --- Secrets (clé SteamGridDB), chiffrés au repos, hors de la synchro et de l'export ---

  const secretName = (name: string) => (SECRET_NAMES.includes(name) ? name : null);
  const secretOf = (me: Device, name: string) => and(eq(secrets.userId, me.userId), eq(secrets.name, name));

  api.get('/secrets/:name', async (c) => {
    const me = c.get('device');
    const name = secretName(c.req.param('name'));
    const [row] = name ? await db.select().from(secrets).where(secretOf(me, name)) : [];
    if (!name || !row) return c.json({ error: 'introuvable' }, 404);
    const value = await unseal(env.SECRETS_KEY, `${me.userId}:${name}`, row.value, row.nonce);
    return c.json({ value, updatedAt: row.updatedAt });
  });

  api.put('/secrets/:name', async (c) => {
    const me = c.get('device');
    const name = secretName(c.req.param('name'));
    const body: unknown = await c.req.json().catch(() => null);
    const plain = isObject(body) ? str(body.value, 512) : null;
    if (!name) return c.json({ error: 'introuvable' }, 404);
    if (!plain) return c.json({ error: 'requete' }, 400);
    const sealed = await seal(env.SECRETS_KEY, `${me.userId}:${name}`, plain);
    const updatedAt = Date.now();
    await db
      .insert(secrets)
      .values({ userId: me.userId, name, ...sealed, updatedAt })
      .onConflictDoUpdate({ target: [secrets.userId, secrets.name], set: { ...sealed, updatedAt } });
    return c.json({ ok: true, updatedAt });
  });

  api.delete('/secrets/:name', async (c) => {
    const me = c.get('device');
    const name = secretName(c.req.param('name'));
    if (!name) return c.json({ error: 'introuvable' }, 404);
    await db.delete(secrets).where(secretOf(me, name));
    return c.json({ ok: true });
  });

  // --- Export et suppression (RGPD) ---

  api.get('/export', async (c) => {
    const me = c.get('device');
    const [u] = await db.select().from(user).where(eq(user.id, me.userId));
    const all = await db.select().from(entries).where(eq(entries.userId, me.userId)).orderBy(asc(entries.key));
    const played = await db.select().from(gameSessions).where(eq(gameSessions.userId, me.userId)).orderBy(asc(gameSessions.start));
    return c.json({
      exportedAt: Date.now(),
      user: u ? { email: u.email, name: u.name, image: u.image, createdAt: u.createdAt.getTime() } : null,
      devices: await deviceList(me),
      entries: all.filter((r) => !r.deleted).map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt, deviceId: r.deviceId })),
      sessions: played.map((r) => ({ id: r.id, gameId: r.gameId, start: r.start, end: r.end, deviceId: r.deviceId }))
    });
  });

  /** Supprime le compte et tout ce qui lui est rattaché. Rien n'est gardé. */
  api.delete('/me', async (c) => {
    const id = c.get('device').userId;
    const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, id));
    await db.batch([
      db.delete(entries).where(eq(entries.userId, id)),
      db.delete(gameSessions).where(eq(gameSessions.userId, id)),
      db.delete(secrets).where(eq(secrets.userId, id)),
      db.delete(devices).where(eq(devices.userId, id)),
      db.delete(loginCodes).where(eq(loginCodes.userId, id)),
      db.delete(profiles).where(eq(profiles.userId, id)),
      db.delete(session).where(eq(session.userId, id)),
      db.delete(account).where(eq(account.userId, id)),
      db.delete(verification).where(like(verification.identifier, `%${u?.email ?? id}`)),
      db.delete(user).where(eq(user.id, id))
    ]);
    return c.json({ ok: true });
  });

  app.route('/', api);
  return app;
}
