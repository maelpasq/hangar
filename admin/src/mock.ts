// Données de démo de `npm run admin:dev` : jamais dans la version compilée (import réservé au mode dev).
import type { Badge, LogRow, UserCard, UserRow } from './api';

const DAY = 86_400_000;
const now = Date.now();
const NAMES = ['Nova', 'Kestrel', 'Lumen', 'Pixel_Wolf', 'Orbite', 'Mirage', 'Basalte', 'Quartz', 'Zephyr', 'Cobalt', 'Ember', 'Sirius'];

const users: UserRow[] = NAMES.map((name, i) => ({
  id: `demo${String(i).padStart(28, '0')}`,
  name,
  email: `${name.toLowerCase()}@exemple.fr`,
  since: now - (i * 9 + 2) * DAY,
  lastSeen: i % 4 === 3 ? null : now - i * 3_600_000,
  certified: i === 1
}));
const given = new Map<string, Badge[]>([[users[1].id, ['certifie', 'testeur']]]);
const log: LogRow[] = [
  { id: 'l1', at: now - 2 * DAY, actor: 'admin@exemple.fr', action: 'badge.donner', targetId: users[1].id, targetName: users[1].name, detail: { badge: 'testeur' } },
  { id: 'l2', at: now - 5 * DAY, actor: 'admin@exemple.fr', action: 'badge.donner', targetId: users[1].id, targetName: users[1].name, detail: { badge: 'certifie' } }
];

function card(u: UserRow): UserCard {
  const i = users.indexOf(u);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: true,
    since: u.since,
    avatar: false,
    devices: [
      { id: 'a'.repeat(32), name: 'PC salon', createdAt: u.since, lastSeen: u.lastSeen ?? u.since },
      { id: 'b'.repeat(32), name: 'Portable', createdAt: u.since + DAY, lastSeen: u.since + 3 * DAY }
    ],
    social: i % 3 === 2 ? null : { enabled: true, code: 'ABCD2345', findable: true, online: i < 2, seen: now - 60_000, friends: 4 + i },
    library: { entries: 180 + i * 7, sessions: 64 + i, playMs: (120 + i * 13) * 3_600_000, covers: 3 },
    badges: given.get(u.id) ?? [],
    reportsReceived:
      i === 2
        ? [{ id: 'r1', reporterId: users[0].id, reporterName: users[0].name, reason: 'harcelement : messages insistants', excerpt: 'Réponds-moi !!!', at: now - DAY }]
        : [],
    reportsMade: 0,
    log: log.filter((l) => l.targetId === u.id)
  };
}

export async function mock(path: string, init?: { method: string; body: unknown }): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 150));
  const url = new URL(path, 'http://demo');
  const seg = url.pathname.split('/').filter(Boolean);
  if (seg[0] === 'me') return { email: 'admin@exemple.fr', badges: ['certifie', 'equipe', 'testeur', 'chasseur'] };
  if (seg[0] === 'stats') {
    return {
      users: 1284,
      newWeek: 37,
      activeWeek: 412,
      friendsOn: 538,
      online: 46,
      reports: 9,
      reportsWeek: 2,
      signups: Array.from({ length: 30 }, (_, k) => ({ day: now - (29 - k) * DAY, n: Math.round(3 + 4 * Math.sin(k / 3) + (k % 5)) })),
      badges: { certifie: 6, equipe: 2, testeur: 14, chasseur: 5 }
    };
  }
  if (seg[0] === 'log') return { log, more: false };
  if (seg[0] === 'users' && !seg[1]) {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    return { users: users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.includes(q) || u.id === q) };
  }
  const u = users.find((x) => x.id === seg[1]);
  if (!u) throw new Error('introuvable');
  if (seg[2] === 'badges' && init) {
    const { badge, on } = init.body as { badge: Badge; on: boolean };
    const set = new Set(given.get(u.id) ?? []);
    if (on) set.add(badge);
    else set.delete(badge);
    given.set(u.id, [...set]);
    u.certified = set.has('certifie');
    log.unshift({ id: crypto.randomUUID(), at: Date.now(), actor: 'admin@exemple.fr', action: on ? 'badge.donner' : 'badge.retirer', targetId: u.id, targetName: u.name, detail: { badge } });
    return { badges: [...set] };
  }
  return card(u);
}
