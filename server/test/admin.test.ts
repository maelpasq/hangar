// Dashboard d'administration : accès par Cloudflare Access, recherche, fiche, badges, journal.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminFromAccess } from '../src/admin/access';
import { createApp } from '../src/app';
import { cleanBugCaptures } from '../src/bug';
import { b64url } from '../src/crypto';
import type { Env } from '../src/env';
import * as schema from '../src/schema';

const TEAM = 'https://equipe.cloudflareaccess.com';
const AUD = 'aud-du-dashboard';
const HOST = 'hangar-admin.exemple.fr';
const ADMIN = 'admin@exemple.fr';
const assets: string[] = [];
const env: Env = {
  BASE_URL: 'http://127.0.0.1:8787',
  TURSO_URL: '',
  AUTH_SECRET: 'secret-de-test-secret-de-test-secret-de-test',
  SECRETS_KEY: b64url(new Uint8Array(32).fill(7)),
  ADMIN_EMAIL: ' Admin@Exemple.fr ',
  ADMIN_HOST: HOST,
  ACCESS_TEAM: TEAM,
  ACCESS_AUD: AUD,
  ASSETS: {
    fetch: async (req) => {
      assets.push(new URL(req.url).pathname);
      return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });
    }
  },
  AVATARS: {
    get: async (k) => {
      const v = bucket.get(k);
      return v ? { arrayBuffer: async () => v.slice().buffer } : null;
    },
    put: async (k, v) => void bucket.set(k, v.slice()),
    delete: async (k) => {
      for (const key of Array.isArray(k) ? k : [k]) bucket.delete(key);
    }
  }
};
const bucket = new Map<string, Uint8Array>();

const dir = mkdtempSync(join(tmpdir(), 'hangar-admin-'));
const client = createClient({ url: `file:${join(dir, 'test.db')}` });
const db = drizzle(client, { schema });
const pushed: string[] = [];
let keyPair: CryptoKeyPair;
let other: CryptoKeyPair;
let jwk: JsonWebKey;
const app = createApp(
  db,
  env,
  async () => {},
  async (ids) => void pushed.push(...ids),
  async () => [{ ...jwk, kid: 'k1' }]
);

const enc = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));
async function jwt(claims: Record<string, unknown>, key = keyPair.privateKey, kid = 'k1') {
  const head = `${enc({ alg: 'RS256', kid, typ: 'JWT' })}.${enc(claims)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head));
  return `${head}.${b64url(new Uint8Array(sig))}`;
}
const good = (over: Record<string, unknown> = {}) =>
  jwt({ aud: [AUD], iss: TEAM, email: ADMIN, exp: Math.floor(Date.now() / 1000) + 600, ...over });

async function call(path: string, init: { token?: string; method?: string; body?: unknown; origin?: string; host?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.token) headers['cf-access-jwt-assertion'] = init.token;
  if (init.origin !== undefined) headers.origin = init.origin;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return app.request(`https://${init.host ?? HOST}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
}

const ALICE = 'alice'.padEnd(32, '0');
const BOB = 'bob'.padEnd(32, '0');

beforeAll(async () => {
  const algo = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  keyPair = (await crypto.subtle.generateKey(algo, true, ['sign', 'verify'])) as CryptoKeyPair;
  other = (await crypto.subtle.generateKey(algo, true, ['sign', 'verify'])) as CryptoKeyPair;
  jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  await migrate(db, { migrationsFolder: './drizzle' });
  const now = Date.now();
  await db.insert(schema.user).values([
    { id: ALICE, name: 'Alice_100%', email: 'alice@exemple.fr', emailVerified: true, createdAt: new Date(now - 3 * 86_400_000), updatedAt: new Date() },
    { id: BOB, name: 'Bob', email: 'bob@autre.fr', emailVerified: true, createdAt: new Date(now - 40 * 86_400_000), updatedAt: new Date() }
  ]);
  await db.insert(schema.devices).values({ userId: ALICE, deviceId: 'a'.repeat(32), name: 'PC salon', createdAt: now, lastSeen: now });
  await db.insert(schema.social).values({ userId: ALICE, enabled: true, code: 'ABCD2345', createdAt: now });
  await db.insert(schema.reports).values({ id: 'r1', reporterId: BOB, targetId: ALICE, reason: 'spam', at: now });
});
afterAll(() => {
  client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe('accès', () => {
  it('ne sert le dashboard que sur son adresse', async () => {
    // Sur l'adresse de l'API, /api/me est une route du compte (jeton de poste exigé).
    const res = await call('/api/me', { token: await good(), host: '127.0.0.1' });
    expect(res.status).toBe(401);
    expect((await call('/')).status).toBe(200);
    expect(assets).toEqual(['/']);
  });

  it('refuse sans jeton Access valide pour l\'administrateur', async () => {
    const now = Math.floor(Date.now() / 1000);
    const bad = [
      undefined,
      'n.importe.quoi',
      await good({ email: 'autre@exemple.fr' }),
      await good({ aud: ['autre-application'] }),
      await good({ iss: 'https://autre.cloudflareaccess.com' }),
      await good({ exp: now - 10 }),
      await jwt({ aud: [AUD], iss: TEAM, email: ADMIN, exp: now + 600 }, other.privateKey),
      await jwt({ aud: [AUD], iss: TEAM, email: ADMIN, exp: now + 600 }, keyPair.privateKey, 'inconnue')
    ];
    for (const token of bad) expect((await call('/api/me', { token })).status).toBe(403);
    const ok = await call('/api/me', { token: await good() });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ email: ADMIN });
  });

  it('ne laisse entrer personne sans la configuration complète', async () => {
    const token = await good();
    const keys = async () => [{ ...jwk, kid: 'k1' }];
    expect(await adminFromAccess(token, env, keys)).toBe(ADMIN);
    expect(await adminFromAccess(token, { ...env, ACCESS_AUD: undefined }, keys)).toBeNull();
    expect(await adminFromAccess(token, { ...env, ADMIN_EMAIL: undefined }, keys)).toBeNull();
    expect(await adminFromAccess(token, { ...env, ACCESS_TEAM: 'https://ailleurs.fr' }, keys)).toBeNull();
  });
});

describe('comptes', () => {
  it('cherche par pseudo, e-mail, code ami ou identifiant', async () => {
    const token = await good();
    const names = async (q: string) =>
      ((await (await call(`/api/users?q=${encodeURIComponent(q)}`, { token })).json()) as { users: { name: string }[] }).users.map((u) => u.name);
    expect(await names('')).toEqual(['Alice_100%', 'Bob']);
    expect(await names('autre.fr')).toEqual(['Bob']);
    expect(await names('abcd-2345')).toEqual(['Alice_100%']);
    expect(await names(BOB)).toEqual(['Bob']);
    // `%` et `_` comptent comme des lettres.
    expect(await names('100%')).toEqual(['Alice_100%']);
    expect(await names('e_1')).toEqual(['Alice_100%']);
    expect(await names('%')).toEqual(['Alice_100%']);
  });

  it('montre la fiche d\'un compte', async () => {
    const res = await call(`/api/users/${ALICE}`, { token: await good() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toMatchObject({ name: 'Alice_100%', email: 'alice@exemple.fr', badges: [], reportsMade: 0 });
    expect(body.devices).toHaveLength(1);
    expect(body.social).toMatchObject({ enabled: true, code: 'ABCD2345', friends: 0 });
    expect(body.reportsReceived).toMatchObject([{ reporterName: 'Bob', reason: 'spam' }]);
    expect((await call('/api/users/inconnu', { token: await good() })).status).toBe(404);
  });

  it('donne et retire un badge, depuis le dashboard seulement, et le note au journal', async () => {
    const token = await good();
    const put = (on: boolean, origin = `https://${HOST}`) =>
      call(`/api/users/${ALICE}/badges`, { token, method: 'PUT', body: { badge: 'certifie', on }, origin });
    expect((await put(true, 'https://ailleurs.fr')).status).toBe(403);
    expect((await call(`/api/users/${ALICE}/badges`, { token, method: 'PUT', body: { badge: 'inconnu', on: true }, origin: `https://${HOST}` })).status).toBe(400);
    expect(await (await put(true)).json()).toEqual({ badges: ['certifie'] });
    expect(pushed).toContain(ALICE);
    // Déjà donné : rien de plus au journal.
    await put(true);
    expect(await (await put(false)).json()).toEqual({ badges: [] });
    const log = (await (await call('/api/log', { token })).json()) as { log: { action: string; targetName: string; actor: string }[] };
    expect(log.log.map((l) => l.action)).toEqual(['badge.retirer', 'badge.donner']);
    expect(log.log[0]).toMatchObject({ targetName: 'Alice_100%', actor: ADMIN });
    const fiche = (await (await call(`/api/users/${ALICE}`, { token })).json()) as { log: unknown[] };
    expect(fiche.log).toHaveLength(2);
  });

  it('donne les chiffres de l\'accueil', async () => {
    const stats = (await (await call('/api/stats', { token: await good() })).json()) as Record<string, any>;
    expect(stats).toMatchObject({ users: 2, newWeek: 1, activeWeek: 1, friendsOn: 1, reports: 1, reportsWeek: 1 });
    expect(stats.signups).toHaveLength(30);
    expect(stats.signups.reduce((n: number, d: { n: number }) => n + d.n, 0)).toBe(1);
  });
});

describe('bugs', () => {
  const HOOK = 'https://discord.com/api/webhooks/123/jeton-de-test';
  const now = Date.now();
  const put = async (id: number, body: unknown) =>
    call(`/api/bugs/${id}`, { token: await good(), method: 'PUT', body, origin: `https://${HOST}` });
  type List = { bugs: { id: number; status: string }[]; counts: Record<string, number> };
  const list = async (query = '') => (await (await call(`/api/bugs${query}`, { token: await good() })).json()) as List;

  beforeAll(async () => {
    const row = { description: 'Détails', version: '1.2.29', os: 'windows', createdAt: now, updatedAt: now };
    await db.insert(schema.bugs).values([
      { ...row, title: 'Plantage au lancement', capture: 'image/png', discordId: '555' },
      { ...row, title: 'Jaquette floue', os: 'linux' },
      { ...row, title: 'Plantage encore', status: 'rejete', closedAt: now }
    ]);
    bucket.set('bugs/1', new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it('liste les bugs par statut, avec leur nombre, et cherche par numéro ou mot', async () => {
    const open = await list();
    expect(open.bugs.map((b) => b.id)).toEqual([2, 1]);
    expect(open.counts).toEqual({ nouveau: 2, rejete: 1 });
    expect((await list('?statut=tous')).bugs).toHaveLength(3);
    expect((await list('?statut=rejete')).bugs.map((b) => b.id)).toEqual([3]);
    expect((await list('?statut=tous&q=plantage')).bugs.map((b) => b.id)).toEqual([3, 1]);
    expect((await list('?statut=tous&q=%232')).bugs.map((b) => b.id)).toEqual([2]);
    expect((await call('/api/bugs?statut=bizarre', { token: await good() })).status).toBe(400);
    const stats = (await (await call('/api/stats', { token: await good() })).json()) as { bugsOpen: number };
    expect(stats.bugsOpen).toBe(2);
  });

  it('montre la fiche et la capture', async () => {
    const res = await call('/api/bugs/1', { token: await good() });
    expect(await res.json()).toMatchObject({ id: 1, title: 'Plantage au lancement', capture: true, discord: true, log: [] });
    const shot = await call('/api/bugs/1/capture', { token: await good() });
    expect(shot.headers.get('content-type')).toBe('image/png');
    expect((await call('/api/bugs/2/capture', { token: await good() })).status).toBe(404);
    expect((await call('/api/bugs/99', { token: await good() })).status).toBe(404);
  });

  it('suit un bug, le note au journal et repeint son message Discord', async () => {
    env.BUG_WEBHOOK = HOOK;
    const real = globalThis.fetch;
    const sent: { url: string; method?: string; body: string }[] = [];
    globalThis.fetch = (async (u: string, init: RequestInit) => {
      sent.push({ url: String(u), method: init.method, body: String(init.body) });
      return Response.json({});
    }) as typeof fetch;
    try {
      expect((await put(1, { status: 'corrige', fixedIn: '1.0 <b>' })).status).toBe(400);
      expect((await put(1, { status: 'doublon', duplicateOf: 1 })).status).toBe(400);
      expect((await put(1, { status: 'fini' })).status).toBe(400);
      expect(sent).toEqual([]);

      const fixed = await put(1, { status: 'corrige', fixedIn: '1.2.30', note: 'Pilote audio' });
      expect(await fixed.json()).toMatchObject({ status: 'corrige', fixedIn: '1.2.30', note: 'Pilote audio' });
      const [row] = (await db.select().from(schema.bugs)).filter((b) => b.id === 1);
      expect(row.closedAt).toBeGreaterThan(0);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ url: `${HOOK}/messages/555`, method: 'PATCH' });
      const embed = JSON.parse(sent[0].body).embeds[0];
      expect(embed).toMatchObject({ title: '🐛 #1 Plantage au lancement', url: `https://${HOST}/#/bugs/1`, color: 0x34d399 });
      expect(embed.fields[2]).toEqual({ name: 'Statut', value: 'Corrigé dans Hangar 1.2.30', inline: true });
      expect(embed.image).toEqual({ url: 'attachment://capture.png' });

      // Note seule : journal, mais Discord ne change pas.
      await put(1, { note: 'Pilote audio Realtek' });
      expect(sent).toHaveLength(1);

      // Rouvert : plus de date de clôture ni de version de correction.
      expect(await (await put(1, { status: 'en_cours' })).json()).toMatchObject({ status: 'en_cours', fixedIn: null, closedAt: null });
      // Doublon d'un autre : précisé dans Discord ; un bug sans message Discord n'en envoie pas.
      expect(await (await put(2, { status: 'doublon', duplicateOf: '#1' })).json()).toMatchObject({ duplicateOf: 1 });
      expect(sent).toHaveLength(2);
    } finally {
      globalThis.fetch = real;
      env.BUG_WEBHOOK = undefined;
    }
    const fiche = (await (await call('/api/bugs/1', { token: await good() })).json()) as { log: { action: string; detail: unknown }[] };
    // Ordre non comparé : plusieurs lignes peuvent tomber dans la même milliseconde.
    expect(fiche.log.map((l) => l.action).sort()).toEqual(['bug.note', 'bug.note', 'bug.statut', 'bug.statut']);
    expect(fiche.log.map((l) => l.detail)).toContainEqual({ bug: 1, de: 'nouveau', vers: 'corrige', fixedIn: '1.2.30' });
    const log = (await (await call('/api/log', { token: await good() })).json()) as { log: { targetName: string }[] };
    expect(log.log[0].targetName).toBe('#2 Jaquette floue');
  });

  it('efface la capture 90 jours après la clôture', async () => {
    await put(1, { status: 'rejete' });
    expect(await cleanBugCaptures(db, env.AVATARS, Date.now() + 89 * 86_400_000)).toBe(0);
    expect(await cleanBugCaptures(db, env.AVATARS, Date.now() + 91 * 86_400_000)).toBe(1);
    expect(bucket.has('bugs/1')).toBe(false);
    expect(await (await call('/api/bugs/1', { token: await good() })).json()).toMatchObject({ capture: false });
  });
});

describe('modération', () => {
  const write = async (path: string, method: string, body?: unknown) =>
    call(path, { token: await good(), method, body, origin: `https://${HOST}` });
  const read = async <T = any>(path: string) => (await (await call(path, { token: await good() })).json()) as T;

  it('traite les signalements et les compte', async () => {
    const open = await read('/api/reports');
    expect(open.reports).toMatchObject([{ id: 'r1', reporterName: 'Bob', targetName: 'Alice_100%', status: 'ouvert', targetSanctions: [] }]);
    expect(open.counts).toEqual({ ouvert: 1 });
    expect((await read('/api/stats')).reportsOpen).toBe(1);
    expect((await write('/api/reports/r1', 'PUT', { status: 'fini' })).status).toBe(400);
    expect((await write('/api/reports/r9', 'PUT', { status: 'traite' })).status).toBe(404);
    expect(await (await write('/api/reports/r1', 'PUT', { status: 'traite' })).json()).toEqual({ status: 'traite' });
    expect((await read('/api/reports')).reports).toEqual([]);
    expect((await read('/api/reports?statut=traite')).reports[0].handledAt).toBeGreaterThan(0);
    expect((await read('/api/stats')).reportsOpen).toBe(0);
    const fiche = await read(`/api/users/${ALICE}`);
    expect(fiche.reportsReceived[0].status).toBe('traite');
  });

  it('sanctionne un compte et lève la sanction, avec le journal', async () => {
    const give = (body: unknown, id = ALICE) => write(`/api/users/${id}/sanctions`, 'POST', body);
    expect((await give({ kind: 'social', reason: ' ', days: 7 })).status).toBe(400);
    expect((await give({ kind: 'social', reason: 'Spam', days: 0 })).status).toBe(400);
    expect((await give({ kind: 'muet', reason: 'Spam', days: 7 })).status).toBe(400);
    expect((await give({ kind: 'social', reason: 'Spam', days: 7 }, 'inconnu')).status).toBe(404);

    const s = (await (await give({ kind: 'social', reason: 'Spam', days: 7 })).json()) as { id: string; active: boolean; until: number };
    expect(s.active).toBe(true);
    expect(s.until).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    const [soc] = (await db.select().from(schema.social)).filter((r) => r.userId === ALICE);
    expect(soc.enabled).toBe(false);
    const flag = async () => (await read('/api/users')).users.find((u: { id: string }) => u.id === ALICE).sanction;
    expect(await flag()).toBe('social');
    expect((await read('/api/reports?statut=tous')).reports[0].targetSanctions).toEqual(['social']);
    expect((await read(`/api/users/${ALICE}`)).sanctions).toMatchObject([{ kind: 'social', reason: 'Spam', active: true }]);

    expect(await (await write(`/api/sanctions/${s.id}`, 'DELETE')).json()).toMatchObject({ active: false });
    expect((await write(`/api/sanctions/${s.id}`, 'DELETE')).status).toBe(404);
    expect(await flag()).toBeNull();
    const actions = (await read(`/api/users/${ALICE}`)).log.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['sanction.donner', 'sanction.lever', 'signalement.statut']));
  });
});

describe('badges', () => {
  const origin = `https://${HOST}`;
  const send = async (path: string, method: string, body: unknown) =>
    call(`/api/badges${path}`, { token: await good(), method, body, origin });

  it("liste les 4 badges d'origine, dans l'ordre", async () => {
    const me = (await (await call('/api/me', { token: await good() })).json()) as { badges: { id: string; legacy: boolean; color: string }[] };
    expect(me.badges.map((b) => b.id)).toEqual(['certifie', 'equipe', 'testeur', 'chasseur']);
    expect(me.badges.every((b) => b.legacy)).toBe(true);
    expect(me.badges[0].color).toBe('accent');
  });

  it('crée, modifie, ordonne et supprime un badge, avec le journal', async () => {
    // Champs invalides refusés.
    for (const body of [
      { name: '', icon: 'star', color: '#ffaa00' },
      { name: 'X'.repeat(41), icon: 'star', color: '#ffaa00' },
      { name: 'Ok', icon: 'licorne', color: '#ffaa00' },
      { name: 'Ok', icon: 'star', color: 'rouge' },
      { name: 'Ok', icon: 'star', color: '#ffaa00', description: 'd'.repeat(141) }
    ]) {
      expect((await send('', 'POST', body)).status).toBe(400);
    }
    const res = await send('', 'POST', { name: '  Fan  de la première heure ', icon: 'heart', color: '#f2556b', description: 'Là depuis le début' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'fan-de-la-premiere-heure' });
    // Une couleur par badge, désactivés compris.
    expect((await send('', 'POST', { name: 'Autre', icon: 'star', color: 'accent' })).status).toBe(409);
    expect((await send('/equipe', 'PUT', { color: '#f2556b' })).status).toBe(409);
    expect((await send('/equipe', 'PUT', { color: '#8d70ff', name: 'Équipe Hangar' })).status).toBe(200);
    // Même nom : identifiant suivant.
    expect(await (await send('', 'POST', { name: 'Fan de la première heure', icon: 'star', color: '#123456' })).json()).toEqual({
      id: 'fan-de-la-premiere-heure-2'
    });
    const edited = (await (await send('/fan-de-la-premiere-heure', 'PUT', { name: 'Fan', active: false })).json()) as {
      badges: { id: string; name: string; active: boolean; position: number }[];
    };
    expect(edited.badges.find((b) => b.id === 'fan-de-la-premiere-heure')).toMatchObject({ name: 'Fan', active: false, position: 5 });
    expect((await send('/inconnu', 'PUT', { name: 'X' })).status).toBe(404);
    expect((await send('/equipe', 'PUT', { color: 'violet' })).status).toBe(400);

    // Ordre : tous les badges, une fois chacun.
    const ids = edited.badges.map((b) => b.id);
    expect((await send('/order', 'PUT', { ids: ids.slice(1) })).status).toBe(400);
    expect((await send('/order', 'PUT', { ids: [ids[0], ...ids.slice(0, -1)] })).status).toBe(400);
    const order = [ids.at(-1), ...ids.slice(0, -1)];
    const sorted = (await (await send('/order', 'PUT', { ids: order })).json()) as { badges: { id: string }[] };
    expect(sorted.badges.map((b) => b.id)).toEqual(order);

    // Suppression : jamais un badge d'origine, jamais un badge donné.
    expect((await send('/testeur', 'DELETE', null)).status).toBe(409);
    await send('/fan-de-la-premiere-heure-2/users', 'POST', { users: [BOB], on: true });
    expect((await send('/fan-de-la-premiere-heure-2', 'DELETE', null)).status).toBe(409);
    await send('/fan-de-la-premiere-heure-2/users', 'POST', { users: [BOB], on: false });
    expect((await send('/fan-de-la-premiere-heure-2', 'DELETE', null)).status).toBe(200);
    expect((await send('/order', 'PUT', { ids: order.filter((i) => i !== 'fan-de-la-premiere-heure-2') })).status).toBe(200);

    const log = (await (await call('/api/log', { token: await good() })).json()) as { log: { action: string }[] };
    expect(log.log.map((l) => l.action).slice(0, 7)).toEqual([
      'badge.ordre',
      'badge.supprimer',
      'badge.retirer',
      'badge.donner',
      'badge.ordre',
      'badge.modifier',
      'badge.creer'
    ]);
  });

  it('donne un badge à plusieurs comptes par identifiant, code ami ou e-mail', async () => {
    const res = await send('/testeur/users', 'POST', { users: [BOB, 'abcd-2345', 'ALICE@exemple.fr', 'personne@nulle.part', ''], on: true });
    expect(await res.json()).toEqual({ found: 2, changed: 2, missing: ['personne@nulle.part'] });
    expect(await (await send('/testeur/users', 'POST', { users: [BOB], on: true })).json()).toMatchObject({ changed: 0 });
    const fiche = (await (await call(`/api/users/${BOB}`, { token: await good() })).json()) as { badges: string[] };
    expect(fiche.badges).toEqual(['testeur']);
    expect((await send('/testeur/users', 'POST', { users: Array.from({ length: 201 }, (_, i) => `x${i}@a.fr`), on: true })).status).toBe(400);
    expect((await send('/testeur/users', 'POST', { users: [], on: true })).status).toBe(400);
    expect((await send('/inconnu/users', 'POST', { users: [BOB], on: true })).status).toBe(404);
    expect(await (await send('/testeur/users', 'POST', { users: [BOB, ALICE], on: false })).json()).toMatchObject({ changed: 2 });
  });
});
