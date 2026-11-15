// Parcours complet de l'API sur une base libSQL temporaire (fichier local, aucun réseau).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { b64url, pkceChallenge, randomToken } from '../src/crypto';
import type { Env } from '../src/env';
import { DAY, INACTIVE_DAYS, WARN_DAYS, cleanCovers, cleanLogins, expireAccounts } from '../src/lifecycle';
import { mailHtml, noticeHtml } from '../src/mail';
import { sha256Hex } from '../src/profile';
import * as schema from '../src/schema';

const BASE = 'http://127.0.0.1:8787';
/** Bucket R2 des avatars, en mémoire. */
const bucket = new Map<string, Uint8Array>();
const env: Env = {
  BASE_URL: BASE,
  TURSO_URL: '',
  AUTH_SECRET: 'secret-de-test-secret-de-test-secret-de-test',
  SECRETS_KEY: b64url(new Uint8Array(32).fill(7)),
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
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const dir = mkdtempSync(join(tmpdir(), 'hangar-api-'));
const client = createClient({ url: `file:${join(dir, 'test.db')}` });
const db = drizzle(client, { schema });
const codes = new Map<string, string>();
const app = createApp(db, env, async (to, code) => void codes.set(to, code));

beforeAll(() => migrate(db, { migrationsFolder: './drizzle' }));
afterAll(() => {
  client.close();
  // Sous Windows, le fichier peut rester verrouillé un instant : le dossier temporaire reste alors.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

/** Adresse du visiteur : une par connexion, comme autant de personnes (limite de débit par adresse). */
let ip = '203.0.113.1';
let visitors = 1;

const DEVICE_A = 'a'.repeat(32);
const DEVICE_B = 'b'.repeat(32);

function call(path: string, init: { method?: string; token?: string; cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { origin: BASE, 'cf-connecting-ip': ip };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return app.request(`${BASE}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
}

/** Connexion par code e-mail dans le « navigateur », jusqu'au cookie de session. */
async function browserLogin(email: string): Promise<string> {
  ip = `203.0.113.${++visitors}`;
  const sent = await call('/auth/email-otp/send-verification-otp', { body: { email, type: 'sign-in' } });
  expect(sent.status).toBe(200);
  const signed = await call('/auth/sign-in/email-otp', { body: { email, otp: codes.get(email) } });
  expect(signed.status).toBe(200);
  return signed.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

/** Connexion complète d'un poste : renvoie son jeton. */
async function login(email: string, deviceId: string, deviceName = 'PC de test'): Promise<string> {
  const cookie = await browserLogin(email);
  const verifier = randomToken();
  const query = `port=45123&challenge=${await pkceChallenge(verifier)}&state=etat-de-test`;
  const back = await call(`/desktop/finish?${query}`, { cookie });
  expect(back.status).toBe(302);
  const target = new URL(back.headers.get('location')!);
  expect(target.origin).toBe('http://127.0.0.1:45123');
  expect(target.searchParams.get('state')).toBe('etat-de-test');
  const res = await call('/desktop/token', {
    body: { code: target.searchParams.get('code'), verifier, deviceId, deviceName }
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

const json = async <T = any>(res: Response): Promise<T> => (await res.json()) as T;

describe('connexion', () => {
  it('sert la page de connexion, en français, sans rien charger d\'ailleurs', async () => {
    const res = await call(`/login?port=45123&challenge=${'c'.repeat(43)}&state=etat-de-test`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    const html = await res.text();
    expect(html).toContain('Connexion à Hangar');
    expect(html).not.toContain('Continuer avec');
  });

  it('sert les pages de fin, la police et un e-mail sans rien charger d\'ailleurs', async () => {
    for (const [path, title] of [['/login/done', 'Connexion réussie'], ['/login/refused', 'Connexion refusée']]) {
      const res = await call(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(await res.text()).toContain(title);
    }
    const font = await call('/login/geist.woff2');
    expect(font.headers.get('content-type')).toBe('font/woff2');
    expect(new TextDecoder().decode((await font.arrayBuffer()).slice(0, 4))).toBe('wOF2');
    const logo = await call('/login/logo.png');
    expect(logo.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await logo.arrayBuffer())[1]).toBe(0x50);
    // Le code se copie d'un bloc, et la seule adresse du message est le logo servi par l'API.
    const mail = mailHtml('482913', 'https://api.test');
    expect(mail).toContain('>482913<');
    expect(mail.match(/https?:\/\/[^"' )]+/g)).toEqual(['https://api.test/login/logo.png']);
    expect(noticeHtml('https://api.test').match(/https?:\/\/[^"' )]+/g)).toEqual(['https://api.test/login/logo.png']);
  });

  it('refuse un retour qui ne vise pas un port local valide', async () => {
    for (const q of ['', 'port=80&challenge=x&state=y', `port=45123&challenge=${'c'.repeat(43)}&state=`]) {
      expect((await call(`/login?${q}`)).status).toBe(400);
    }
    // Sans session de navigateur : retour à la page de connexion, jamais vers l'app.
    const res = await call(`/desktop/finish?port=45123&challenge=${'c'.repeat(43)}&state=etat-de-test`);
    expect(res.headers.get('location')).toMatch(/^\/login\?/);
  });

  it('refuse un mauvais code e-mail', async () => {
    await call('/auth/email-otp/send-verification-otp', { body: { email: 'x@exemple.fr', type: 'sign-in' } });
    const res = await call('/auth/sign-in/email-otp', { body: { email: 'x@exemple.fr', otp: '000000' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('exige le vérifieur PKCE et ne rend un code qu\'une fois', async () => {
    const cookie = await browserLogin('pkce@exemple.fr');
    const verifier = randomToken();
    const query = `port=45123&challenge=${await pkceChallenge(verifier)}&state=etat-de-test`;
    const back = await call(`/desktop/finish?${query}`, { cookie });
    const code = new URL(back.headers.get('location')!).searchParams.get('code');
    const bad = await call('/desktop/token', { body: { code, verifier: randomToken(), deviceId: DEVICE_A } });
    expect(bad.status).toBe(401);
    // Le code a été consommé par l'essai raté.
    const again = await call('/desktop/token', { body: { code, verifier, deviceId: DEVICE_A } });
    expect(again.status).toBe(401);
    // La session du navigateur n'existe plus : elle ne peut pas rendre un second code.
    const replay = await call(`/desktop/finish?${query}`, { cookie });
    expect(replay.headers.get('location')).toMatch(/^\/login\?/);
  });

  it('refuse tout sans jeton', async () => {
    for (const path of ['/me', '/sync', '/sessions', '/export', '/secrets/steamgriddb']) {
      expect((await call(path)).status).toBe(401);
      expect((await call(path, { token: 'faux' })).status).toBe(401);
    }
  });
});

describe('compte', () => {
  let a: string;
  let b: string;
  let other: string;

  beforeAll(async () => {
    a = await login('moi@exemple.fr', DEVICE_A, 'Tour');
    b = await login('moi@exemple.fr', DEVICE_B, 'Portable');
    other = await login('autre@exemple.fr', DEVICE_A);
  });

  it('donne le compte et ses postes', async () => {
    const me = await json(await call('/me', { token: a }));
    expect(me.user.email).toBe('moi@exemple.fr');
    expect(me.devices.map((d: any) => [d.name, d.current, d.connected])).toEqual([
      ['Tour', true, true],
      ['Portable', false, true]
    ]);
    expect((await call(`/devices/${DEVICE_B}`, { method: 'PUT', token: a, body: { name: 'Steam Deck' } })).status).toBe(200);
    expect((await call(`/devices/${'c'.repeat(32)}`, { method: 'PUT', token: a, body: { name: 'x' } })).status).toBe(404);
    const after = await json(await call('/me', { token: b }));
    expect(after.devices[1].name).toBe('Steam Deck');
  });

  it('synchronise : le plus récent gagne, une suppression est une marque', async () => {
    const t = Date.now() - 10_000;
    const first = await json(
      await call('/sync', {
        token: a,
        body: {
          changes: [
            { key: 'fav:steam:620', value: '1', updatedAt: t },
            { key: 'rename:steam:620', value: '"Portal"', updatedAt: t }
          ]
        }
      })
    );
    expect(first.cursor).toBe(1);

    // L'autre poste lit tout, puis plus rien de nouveau.
    const pull = await json(await call('/sync?since=0', { token: b }));
    expect(pull.more).toBe(false);
    expect(pull.cursor).toBe(1);
    expect(pull.changes.map((c: any) => c.key).sort()).toEqual(['fav:steam:620', 'rename:steam:620']);
    expect(pull.changes[0].deviceId).toBe(DEVICE_A);
    expect((await json(await call('/sync?since=1', { token: b }))).changes).toEqual([]);

    // Plus ancien : ignoré. Plus récent : gagne, suppression comprise.
    await call('/sync', { token: b, body: { changes: [{ key: 'rename:steam:620', value: '"Vieux"', updatedAt: t - 1 }] } });
    await call('/sync', { token: b, body: { changes: [{ key: 'fav:steam:620', value: null, updatedAt: t + 1 }] } });
    const next = await json(await call('/sync?since=1', { token: a }));
    expect(next.changes).toEqual([{ key: 'fav:steam:620', value: null, updatedAt: t + 1, deviceId: DEVICE_B }]);

    // Une horloge en avance est ramenée à maintenant.
    await call('/sync', { token: a, body: { changes: [{ key: 'set:accent', value: '"#fff"', updatedAt: Date.now() + 1e9 }] } });
    const last = await json(await call(`/sync?since=${next.cursor}`, { token: b }));
    expect(last.changes[0].updatedAt).toBeLessThanOrEqual(Date.now());
  });

  it('refuse les envois mal formés', async () => {
    const bad = [
      { changes: 'x' },
      { changes: [{ key: 'sansprefixe', value: '1', updatedAt: 1 }] },
      { changes: [{ key: 'fav:x', value: 1, updatedAt: 1 }] },
      { changes: [{ key: 'fav:x', value: '1', updatedAt: -1 }] },
      { changes: [{ key: 'fav:x', value: 'v'.repeat(17_000), updatedAt: 1 }] },
      { changes: Array.from({ length: 1001 }, (_, i) => ({ key: `fav:${i}`, value: '1', updatedAt: 1 })) }
    ];
    for (const body of bad) expect((await call('/sync', { token: a, body })).status).toBe(400);
    expect((await call('/sync?since=abc', { token: a })).status).toBe(400);
  });

  it('pagine sans couper un envoi', async () => {
    const t = await login('gros@exemple.fr', DEVICE_A);
    for (let lot = 0; lot < 3; lot++) {
      const changes = Array.from({ length: 900 }, (_, i) => ({ key: `seen:${lot}-${i}`, value: '1', updatedAt: 1000 }));
      expect((await call('/sync', { token: t, body: { changes } })).status).toBe(200);
    }
    const p1 = await json(await call('/sync?since=0', { token: t }));
    expect(p1.more).toBe(true);
    expect(p1.changes.length).toBe(1800);
    expect(p1.cursor).toBe(2);
    const p2 = await json(await call(`/sync?since=${p1.cursor}`, { token: t }));
    expect(p2.more).toBe(false);
    expect(p2.changes.length).toBe(900);
    expect(p2.cursor).toBe(3);
  });

  it('ajoute les sessions de jeu sans doublon', async () => {
    const s = { id: 'session-1', gameId: 'steam:620', start: 1000, end: 5000 };
    expect((await call('/sessions', { token: a, body: { sessions: [s] } })).status).toBe(200);
    // Le même identifiant renvoyé (même modifié) ne change rien.
    await call('/sessions', { token: b, body: { sessions: [{ ...s, end: 9000 }] } });
    const got = await json(await call('/sessions?since=0', { token: b }));
    expect(got.sessions).toEqual([{ ...s, deviceId: DEVICE_A }]);
    expect((await call('/sessions', { token: a, body: { sessions: [{ ...s, id: 'x', end: 10 }] } })).status).toBe(400);
  });

  it('garde la clé SteamGridDB chiffrée, hors de la synchro et de l\'export', async () => {
    expect((await call('/secrets/steamgriddb', { token: a })).status).toBe(404);
    expect((await call('/secrets/autre', { method: 'PUT', token: a, body: { value: 'x' } })).status).toBe(404);
    expect((await call('/secrets/steamgriddb', { method: 'PUT', token: a, body: { value: 'ma-cle-secrete' } })).status).toBe(200);
    expect((await json(await call('/secrets/steamgriddb', { token: b }))).value).toBe('ma-cle-secrete');
    const [row] = await db.select().from(schema.secrets);
    expect(row.value).not.toContain('ma-cle-secrete');
    const exported = JSON.stringify(await json(await call('/export', { token: a })));
    expect(exported).not.toContain('ma-cle-secrete');
    expect(exported).toContain('rename:steam:620');
    expect((await call('/secrets/steamgriddb', { method: 'DELETE', token: b })).status).toBe(200);
    expect((await call('/secrets/steamgriddb', { token: a })).status).toBe(404);
  });

  it('gère le profil : pseudo, avatar et visibilité', async () => {
    const me = await json(await call('/me', { token: a }));
    const id = me.user.id;
    expect(me.user.public).toBe(false);
    expect(me.user.avatar).toBe(null);
    // Privé par défaut : la page publique ne dit rien.
    const hidden = await call(`/u/${id}`);
    expect(hidden.status).toBe(404);
    expect(await hidden.text()).not.toContain('moi@exemple.fr');

    for (const name of ['x', ' ', 'a'.repeat(33), 'a\u0000b', 42]) {
      expect((await call('/me', { method: 'PUT', token: a, body: { name } })).status).toBe(400);
    }
    expect((await call('/me', { method: 'PUT', token: a, body: { public: 'oui' } })).status).toBe(400);
    expect((await call('/me', { method: 'PUT', token: a, body: { name: '  <Pilote>  du  dimanche ', public: true } })).status).toBe(200);

    // L'avatar : une vraie image, pas trop grosse.
    const put = (bytes: Uint8Array<ArrayBuffer>) =>
      app.request(`${BASE}/me/avatar`, { method: 'PUT', headers: { authorization: `Bearer ${a}` }, body: bytes });
    expect((await put(new TextEncoder().encode('<svg onload=x>'))).status).toBe(400);
    expect((await put(new Uint8Array(600 * 1024).fill(0xff))).status).toBe(413);
    const sent = await json(await put(PNG));
    const after = await json(await call('/me', { token: b }));
    expect(after.user).toMatchObject({ name: '<Pilote> du dimanche', public: true, avatar: sent.avatar });
    const pic = await call('/me/avatar', { token: b });
    expect(pic.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await pic.arrayBuffer())).toEqual(PNG);

    // La visibilité suit la synchro des autres postes.
    const sync = await json(await call('/sync?since=0', { token: b }));
    expect(sync.changes.find((ch: any) => ch.key === 'profile:public')?.value).toBe('true');

    // Page publique : pseudo échappé, avatar inclus, temps de jeu de tous les postes, sans l'e-mail.
    await call('/sync', {
      token: b,
      body: {
        changes: [
          { key: `time:${DEVICE_B}:manual:9`, value: JSON.stringify({ ms: 7_200_000, n: 1, last: 1, h: 7_200_000 }), updatedAt: 1 },
          // Heures de Steam reprises : seul le temps mesuré par Hangar (h) compte.
          { key: `time:${DEVICE_B}:steam:10`, value: JSON.stringify({ ms: 360_000_000, n: 1, last: 1, s: 1, h: 3_600_000 }), updatedAt: 1 },
          // Ancienne version de l'app, sans h : tout le temps si le store ne compte rien, rien sinon.
          { key: `time:${DEVICE_A}:manual:9`, value: JSON.stringify({ ms: 3_600_000, n: 1, last: 1 }), updatedAt: 1 },
          { key: `time:${DEVICE_A}:steam:11`, value: JSON.stringify({ ms: 360_000_000, n: 1, last: 1, s: 1 }), updatedAt: 1 }
        ]
      }
    });
    const page = await call(`/u/${id}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('&lt;Pilote&gt; du dimanche');
    expect(html).not.toContain('<Pilote>');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('<b>4 h</b>');
    expect(html).toContain('<b>2</b><span>jeux joués');
    expect(html).not.toContain('moi@exemple.fr');

    expect((await call('/me/avatar', { method: 'DELETE', token: a })).status).toBe(200);
    expect(bucket.size).toBe(0);
    expect((await call('/me/avatar', { token: a })).status).toBe(404);
    expect((await call('/me', { method: 'PUT', token: a, body: { public: false } })).status).toBe(200);
    expect((await call(`/u/${id}`)).status).toBe(404);
  });

  it('copie l\'avatar du service de connexion', async () => {
    const me = await json(await call('/me', { token: other }));
    const url = 'https://cdn.discordapp.com/avatars/1/abc.png';
    await db.update(schema.user).set({ image: url }).where(eq(schema.user.id, me.user.id));
    const real = globalThis.fetch;
    const asked: string[] = [];
    globalThis.fetch = (async (u: string) => {
      asked.push(String(u));
      return new Response(PNG);
    }) as typeof fetch;
    try {
      expect((await json(await call('/me', { token: other }))).user.avatar).toMatch(/^p/);
      expect((await call('/me/avatar', { token: other })).status).toBe(200);
      expect((await call('/me/avatar', { token: other })).status).toBe(200);
    } finally {
      globalThis.fetch = real;
    }
    // Copiée une fois dans R2, puis servie de là.
    expect(asked).toEqual([url]);
    expect((await json(await call('/me', { token: other }))).user.avatar).not.toMatch(/^p/);
  });

  it('garde les jaquettes envoyées, par compte, et fait le ménage des inutilisées', async () => {
    const pic = new Uint8Array([...PNG, 9, 9, 9]);
    const unused = new Uint8Array([...PNG, 8, 8, 8]);
    const hash = await sha256Hex(pic);
    const put = (token: string, h: string, bytes: Uint8Array) =>
      app.request(`${BASE}/covers/${h}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png', 'cf-connecting-ip': ip },
        body: bytes as Uint8Array<ArrayBuffer>
      });
    // Empreinte fausse, pas une image, empreinte mal formée : refusées.
    expect((await put(a, 'f'.repeat(64), pic)).status).toBe(400);
    expect((await put(a, await sha256Hex(new Uint8Array([1, 2, 3])), new Uint8Array([1, 2, 3]))).status).toBe(400);
    expect((await put(a, 'abc', pic)).status).toBe(400);
    expect((await put(a, hash, pic)).status).toBe(200);
    expect((await put(a, hash, pic)).status).toBe(200);
    expect((await put(a, await sha256Hex(unused), unused)).status).toBe(200);

    const got = await call(`/covers/${hash}`, { token: b });
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(pic);
    expect((await call(`/covers/${hash}`, { token: other })).status).toBe(404);

    const t = Date.now();
    await call('/sync', { token: a, body: { changes: [{ key: 'cover:steam:9', value: JSON.stringify(`file:${hash}`), updatedAt: t }] } });
    const exported = await json(await call('/export', { token: a }));
    expect(exported.covers.map((x: any) => x.hash).sort()).toEqual([hash, await sha256Hex(unused)].sort());
    expect(exported.user.public).toBe(false);

    // Trop récentes : gardées. Un jour plus tard : seule celle qu'aucun élément ne désigne part.
    expect(await cleanCovers(db, env.AVATARS, t)).toBe(0);
    expect(await cleanCovers(db, env.AVATARS, t + DAY + 60_000)).toBe(1);
    expect((await call(`/covers/${hash}`, { token: a })).status).toBe(200);
    expect((await call(`/covers/${await sha256Hex(unused)}`, { token: a })).status).toBe(404);
  });

  it('sépare les comptes', async () => {
    expect((await json(await call('/sync?since=0', { token: other }))).changes).toEqual([]);
    expect((await json(await call('/sessions?since=0', { token: other }))).sessions).toEqual([]);
    expect((await call(`/devices/${DEVICE_B}`, { method: 'DELETE', token: other })).status).toBe(404);
  });

  it('déconnecte un poste, puis supprime le compte et toutes ses données', async () => {
    expect((await call(`/devices/${DEVICE_B}`, { method: 'DELETE', token: a })).status).toBe(200);
    expect((await call('/me', { token: b })).status).toBe(401);
    const me = await json(await call('/me', { token: a }));
    expect(me.devices[1].connected).toBe(false);

    expect((await call('/me', { method: 'DELETE', token: a })).status).toBe(200);
    expect((await call('/me', { token: a })).status).toBe(401);
    const id = me.user.id;
    for (const table of [schema.entries, schema.gameSessions, schema.devices, schema.profiles, schema.secrets, schema.covers]) {
      const rows = await db.select().from(table);
      expect(rows.some((r) => r.userId === id)).toBe(false);
    }
    expect((await db.select().from(schema.user)).some((u) => u.id === id)).toBe(false);
    expect([...bucket.keys()].some((k) => k.includes(id))).toBe(false);
    // L'autre compte est intact.
    expect((await call('/me', { token: other })).status).toBe(200);
  });

  it('se déconnecte', async () => {
    expect((await call('/logout', { method: 'POST', token: other })).status).toBe(200);
    expect((await call('/me', { token: other })).status).toBe(401);
  });
});

describe('ménage', () => {
  it('efface les traces de connexion un jour après leur fin', async () => {
    const kept = (await db.select().from(schema.rateLimit)).length;
    expect(kept).toBeGreaterThan(0);
    await cleanLogins(db, Date.now());
    expect(await db.select().from(schema.rateLimit)).toHaveLength(kept);
    await cleanLogins(db, Date.now() + 2 * DAY);
    expect(await db.select().from(schema.session)).toEqual([]);
    expect(await db.select().from(schema.verification)).toEqual([]);
    expect(await db.select().from(schema.rateLimit)).toEqual([]);
  });
});

describe('comptes inactifs', () => {
  it('prévient 30 jours avant, supprime après 2 ans sans connexion, et repart de zéro au retour', async () => {
    const told: string[] = [];
    const notice = async (to: string) => void told.push(to);
    const token = await login('dormeur@exemple.fr', 'd'.repeat(32));
    const id = (await json(await call('/me', { token }))).user.id;
    const now = Date.now();
    const back = (days: number) => now - days * DAY;
    const lastSeen = async (at: number) => {
      await db.update(schema.devices).set({ lastSeen: at }).where(eq(schema.devices.userId, id));
      await db.update(schema.profiles).set({ createdAt: at }).where(eq(schema.profiles.userId, id));
      await db.update(schema.user).set({ createdAt: new Date(at) }).where(eq(schema.user.id, id));
    };

    // Actif : rien.
    expect(await expireAccounts(db, env.AVATARS, notice, now)).toEqual({ warned: 0, deleted: 0 });

    // 23 mois sans connexion : un rappel, une seule fois.
    await lastSeen(back(INACTIVE_DAYS - WARN_DAYS + 1));
    expect(await expireAccounts(db, env.AVATARS, notice, now)).toEqual({ warned: 1, deleted: 0 });
    expect(await expireAccounts(db, env.AVATARS, notice, now + DAY)).toEqual({ warned: 0, deleted: 0 });
    expect(told).toEqual(['dormeur@exemple.fr']);

    // Retour sur le compte après le rappel, puis de nouveau 23 mois d'absence : nouveau rappel.
    // (Plus loin dans le temps, les comptes des autres tests deviennent inactifs eux aussi : on ne
    // regarde que celui-ci.)
    const exists = async () => (await db.select().from(schema.user)).some((u) => u.id === id);
    await lastSeen(now + 2 * DAY);
    const later = now + 2 * DAY + (INACTIVE_DAYS - WARN_DAYS + 1) * DAY;
    await expireAccounts(db, env.AVATARS, notice, later);
    expect(told.filter((t) => t === 'dormeur@exemple.fr')).toHaveLength(2);

    // 30 jours après ce rappel, toujours rien : supprimé.
    await expireAccounts(db, env.AVATARS, notice, later + 29 * DAY);
    expect(await exists()).toBe(true);
    await expireAccounts(db, env.AVATARS, notice, later + WARN_DAYS * DAY);
    expect(await exists()).toBe(false);
    expect((await call('/me', { token })).status).toBe(401);
  });
});
