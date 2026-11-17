// Données de démo de `npm run admin:dev` : jamais dans la version compilée (import réservé au mode dev).
import { ApiError, type Badge, type BugCard, type BugChange, type BugStatus, type LogRow, type UserCard, type UserRow } from './api';
import { OPEN_IDS } from './bug-status';

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

const TITLES = [
  'Le jeu ne se lance pas depuis Epic',
  'Jaquette floue sur les jeux GOG',
  'La fenêtre clignote au démarrage',
  'Temps de jeu compté deux fois',
  'Crash en ouvrant les paramètres',
  'Le scan ne trouve pas Battle.net',
  'Texte coupé dans la fiche du jeu'
];
const STATUS_CYCLE: BugStatus[] = ['nouveau', 'nouveau', 'confirme', 'en_cours', 'corrige', 'rejete', 'doublon'];
const bugs: BugCard[] = TITLES.map((title, i) => ({
  id: 41 - i,
  title,
  description: i === 0 ? 'Quand je clique sur Jouer, rien ne se passe.\nLe launcher Epic s\'ouvre puis se ferme.' : '',
  version: i < 3 ? '1.2.29' : '1.2.28',
  os: i === 5 ? 'linux' : 'windows',
  status: STATUS_CYCLE[i],
  fixedIn: STATUS_CYCLE[i] === 'corrige' ? '1.2.29' : null,
  duplicateOf: STATUS_CYCLE[i] === 'doublon' ? 41 : null,
  note: null,
  capture: i % 2 === 0,
  discord: true,
  createdAt: now - (i * 2 + 1) * 3_600_000 * 7,
  updatedAt: now,
  closedAt: STATUS_CYCLE[i] === 'corrige' || STATUS_CYCLE[i] === 'rejete' || STATUS_CYCLE[i] === 'doublon' ? now : null,
  log: []
}));

function mockBugs(seg: string[], url: URL, init?: { method: string; body: unknown }): unknown {
  if (!seg[1]) {
    const statut = url.searchParams.get('statut') ?? 'ouverts';
    const q = (url.searchParams.get('q') ?? '').toLowerCase().replace(/^#/, '');
    const counts: Record<string, number> = {};
    for (const b of bugs) counts[b.status] = (counts[b.status] ?? 0) + 1;
    const list = bugs.filter(
      (b) =>
        (statut === 'tous' || (statut === 'ouverts' ? OPEN_IDS.includes(b.status) : b.status === statut)) &&
        (!q || String(b.id) === q || b.title.toLowerCase().includes(q))
    );
    return { bugs: list, counts, more: false };
  }
  const b = bugs.find((x) => x.id === Number(seg[1]));
  if (!b) throw new ApiError(404);
  if (init) {
    const c = init.body as BugChange;
    const de = b.status;
    if (c.status) b.status = c.status;
    b.fixedIn = b.status === 'corrige' ? (c.fixedIn as string) || null : null;
    b.duplicateOf = b.status === 'doublon' && c.duplicateOf ? Number(String(c.duplicateOf).replace('#', '')) : null;
    b.note = c.note ?? null;
    b.closedAt = OPEN_IDS.includes(b.status) ? null : (b.closedAt ?? Date.now());
    const entry: LogRow = {
      id: crypto.randomUUID(),
      at: Date.now(),
      actor: 'admin@exemple.fr',
      action: 'bug.statut',
      targetId: `bug:${b.id}`,
      targetName: `#${b.id} ${b.title}`,
      detail: { bug: b.id, de, vers: b.status, ...(b.fixedIn ? { fixedIn: b.fixedIn } : {}) }
    };
    b.log.unshift(entry);
    log.unshift(entry);
    return b;
  }
  return b;
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
      bugsOpen: bugs.filter((b) => OPEN_IDS.includes(b.status)).length,
      signups: Array.from({ length: 30 }, (_, k) => ({ day: now - (29 - k) * DAY, n: Math.round(3 + 4 * Math.sin(k / 3) + (k % 5)) })),
      badges: { certifie: 6, equipe: 2, testeur: 14, chasseur: 5 }
    };
  }
  if (seg[0] === 'log') return { log, more: false };
  if (seg[0] === 'bugs') return mockBugs(seg, url, init);
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
