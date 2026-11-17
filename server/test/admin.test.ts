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
  }
};

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
