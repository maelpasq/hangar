// Données de démo de `npm run admin:dev` : jamais dans la version compilée (import réservé au mode dev).
import { ApiError, type AdminBadge, type BadgeFields, type Report, type ReportStatus, type Sanction, type SanctionKind, type Badge, type BugCard, type BugChange, type BugStatus, type LogRow, type UserCard, type UserRow } from './api';
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
  certified: i === 1,
  sanction: null
}));
const given = new Map<string, Badge[]>([[users[1].id, ['certifie', 'testeur', 'fan']]]);
/** Badges de démo : les 4 d'origine et un créé dans le dashboard. */
let defs: Omit<AdminBadge, 'held'>[] = [
  { id: 'certifie', name: 'Compte certifié', description: 'Compte vérifié par Hangar', icon: 'seal', color: 'accent', position: 1, active: true, legacy: true },
  { id: 'equipe', name: 'Équipe Hangar', description: 'Membre de pamal Studio', icon: 'shield', color: '#8d70ff', position: 2, active: true, legacy: true },
  { id: 'testeur', name: 'Testeur de Hangar', description: 'Teste les versions de Hangar Test', icon: 'flask', color: '#22b8a6', position: 3, active: true, legacy: true },
  { id: 'chasseur', name: 'Chasseur de bugs', description: 'A signalé un bug corrigé', icon: 'bug', color: '#3fb950', position: 4, active: true, legacy: true },
  { id: 'fan', name: 'Fan de la première heure', description: 'Là depuis la 1.0', icon: 'heart', color: '#f2556b', position: 5, active: true, legacy: false }
];
/** Nombre de comptes par badge, en plus des comptes de démo (ceux d'une vraie base). */
const EXTRA: Record<string, number> = { certifie: 5, equipe: 2, testeur: 13, chasseur: 5, fan: 40 };
const heldOf = (id: string) => (EXTRA[id] ?? 0) + [...given.values()].filter((b) => b.includes(id)).length;
const badgeList = (): AdminBadge[] => defs.map((d) => ({ ...d, held: heldOf(d.id) }));
const logBadge = (action: string, d: { id: string; name: string }, extra: Record<string, unknown> = {}) =>
  log.unshift({ id: crypto.randomUUID(), at: Date.now(), actor: 'admin@exemple.fr', action, targetId: `badge:${d.id}`, targetName: null, detail: { badge: d.id, name: d.name, ...extra } });

function mockBadges(seg: string[], init?: { method: string; body: unknown }): unknown {
  const method = init?.method ?? 'GET';
  if (!seg[1] && method === 'GET') return { badges: badgeList() };
  if (!seg[1] && method === 'POST') {
    const f = init!.body as Required<Pick<BadgeFields, 'name' | 'icon' | 'color'>> & BadgeFields;
    const base = f.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'badge';
    let id = base;
    for (let i = 2; defs.some((d) => d.id === id); i++) id = `${base}-${i}`;
    const d = { id, name: f.name, description: f.description ?? '', icon: f.icon, color: f.color, position: defs.length + 1, active: true, legacy: false };
    defs.push(d);
    logBadge('badge.creer', d);
    return { id };
  }
  if (seg[1] === 'order') {
    const ids = (init!.body as { ids: string[] }).ids;
    defs = ids.map((id, i) => ({ ...defs.find((d) => d.id === id)!, position: i + 1 }));
    log.unshift({ id: crypto.randomUUID(), at: Date.now(), actor: 'admin@exemple.fr', action: 'badge.ordre', targetId: null, targetName: null, detail: { ids } });
    return { badges: badgeList() };
  }
  const d = defs.find((x) => x.id === seg[1]);
  if (!d) throw new ApiError(404, 'introuvable');
  if (seg[2] === 'users') {
    const { users: refs, on } = init!.body as { users: string[]; on: boolean };
    const found = refs.map((r) => users.find((u) => u.id === r || u.email === r.toLowerCase())).filter((u) => !!u);
    const missing = refs.filter((r) => !users.some((u) => u.id === r || u.email === r.toLowerCase()));
    let changed = 0;
    for (const u of found) {
      const set = new Set(given.get(u.id) ?? []);
      if (set.has(d.id) === on) continue;
      if (on) set.add(d.id);
      else set.delete(d.id);
      given.set(u.id, [...set]);
      u.certified = set.has('certifie');
      changed++;
      log.unshift({ id: crypto.randomUUID(), at: Date.now(), actor: 'admin@exemple.fr', action: on ? 'badge.donner' : 'badge.retirer', targetId: u.id, targetName: u.name, detail: { badge: d.id, name: d.name } });
    }
    return { found: found.length, changed, missing };
  }
  if (method === 'DELETE') {
    if (d.legacy) throw new ApiError(409, 'origine');
    if (heldOf(d.id)) throw new ApiError(409, 'utilise');
    defs = defs.filter((x) => x !== d);
    logBadge('badge.supprimer', d);
    return { badges: badgeList() };
  }
  const f = init!.body as BadgeFields;
  const changes = (Object.keys(f) as (keyof BadgeFields)[]).filter((k) => f[k] !== d[k]);
  Object.assign(d, f);
  if (changes.length) logBadge('badge.modifier', d, { changes });
  return { badges: badgeList() };
}
const log: LogRow[] = [
  { id: 'l4', at: now - 3 * 3_600_000, actor: 'admin@exemple.fr', action: 'bug.statut', targetId: 'bug:37', targetName: '#37 Crash en ouvrant les paramètres', detail: { bug: 37, de: 'en_cours', vers: 'corrige', fixedIn: '1.2.29' } },
  { id: 'l5', at: now - 3.5 * 3_600_000, actor: 'admin@exemple.fr', action: 'bug.note', targetId: 'bug:39', targetName: '#39 La fenêtre clignote au démarrage', detail: { bug: 39 } },
  { id: 'l3', at: now - 26 * 3_600_000, actor: 'admin@exemple.fr', action: 'bug.statut', targetId: 'bug:38', targetName: '#38 Temps de jeu compté deux fois', detail: { bug: 38, de: 'confirme', vers: 'en_cours' } },
  { id: 'l6', at: now - 27 * 3_600_000, actor: 'admin@exemple.fr', action: 'bug.statut', targetId: 'bug:35', targetName: '#35 Texte coupé dans la fiche du jeu', detail: { bug: 35, de: 'nouveau', vers: 'doublon', duplicateOf: 41 } },
  { id: 'l1', at: now - 2 * DAY, actor: 'admin@exemple.fr', action: 'badge.donner', targetId: users[1].id, targetName: users[1].name, detail: { badge: 'testeur' } },
  { id: 'l7', at: now - 3 * DAY, actor: 'admin@exemple.fr', action: 'bug.statut', targetId: 'bug:36', targetName: '#36 Le scan ne trouve pas Battle.net', detail: { bug: 36, de: 'nouveau', vers: 'rejete' } },
  { id: 'l8', at: now - 4 * DAY, actor: 'admin@exemple.fr', action: 'badge.retirer', targetId: users[4].id, targetName: users[4].name, detail: { badge: 'chasseur' } },
  { id: 'l2', at: now - 5 * DAY, actor: 'admin@exemple.fr', action: 'badge.donner', targetId: users[1].id, targetName: users[1].name, detail: { badge: 'certifie' } }
];

const reports: Report[] = [
  {
    id: 'r1',
    reporterId: users[0].id,
    reporterName: users[0].name,
    targetId: users[2].id,
    targetName: users[2].name,
    targetSanctions: [],
    reason: 'harcelement : messages insistants',
    excerpt: 'Réponds-moi !!!',
    at: now - DAY,
    status: 'ouvert',
    handledAt: null
  },
  {
    id: 'r2',
    reporterId: users[4].id,
    reporterName: users[4].name,
    targetId: users[6].id,
    targetName: users[6].name,
    targetSanctions: [],
    reason: 'pseudo : pseudo injurieux',
    excerpt: null,
    at: now - 3 * DAY,
    status: 'ouvert',
    handledAt: null
  }
];
const sanctions: (Sanction & { userId: string })[] = [];

function refreshFlags() {
  for (const u of users) {
    const on = sanctions.filter((x) => x.userId === u.id && x.active);
    u.sanction = on.some((x) => x.kind === 'total') ? 'total' : on.length ? 'social' : null;
  }
  for (const r of reports) r.targetSanctions = sanctions.filter((x) => x.userId === r.targetId && x.active).map((x) => x.kind);
}

function mockModeration(seg: string[], url: URL, init?: { method: string; body: unknown }): unknown {
  if (seg[0] === 'reports' && !seg[1]) {
    const statut = url.searchParams.get('statut') ?? 'ouvert';
    const counts: Record<string, number> = {};
    for (const r of reports) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return { reports: reports.filter((r) => statut === 'tous' || r.status === statut), counts, more: false };
  }
  if (seg[0] === 'reports' && init) {
    const r = reports.find((x) => x.id === seg[1]);
    if (!r) throw new ApiError(404);
    r.status = (init.body as { status: ReportStatus }).status;
    r.handledAt = r.status === 'ouvert' ? null : Date.now();
    return { status: r.status };
  }
  if (seg[0] === 'sanctions' && init) {
    const x = sanctions.find((y) => y.id === seg[1]);
    if (!x) throw new ApiError(404);
    x.active = false;
    x.liftedAt = Date.now();
    refreshFlags();
    return x;
  }
  return null;
}

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
        ? reports.filter((r) => r.targetId === u.id).map((r) => ({ ...r, reporterName: r.reporterName }))
        : [],
    reportsMade: 0,
    sanctions: sanctions.filter((x) => x.userId === u.id).map(({ userId: _, ...x }) => x),
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
  if (seg[0] === 'me') return { email: 'admin@exemple.fr', badges: badgeList() };
  if (seg[0] === 'badges') return mockBadges(seg, init);
  if (seg[0] === 'stats') {
    return {
      users: 1284,
      newWeek: 37,
      activeWeek: 412,
      friendsOn: 538,
      online: 46,
      reports: 9,
      reportsWeek: 2,
      reportsOpen: reports.filter((r) => r.status === 'ouvert').length,
      bugsOpen: bugs.filter((b) => OPEN_IDS.includes(b.status)).length,
      signups: Array.from({ length: 30 }, (_, k) => ({ day: now - (29 - k) * DAY, n: Math.round(3 + 4 * Math.sin(k / 3) + (k % 5)) })),
      badges: Object.fromEntries(defs.map((d) => [d.id, heldOf(d.id)]))
    };
  }
  if (seg[0] === 'log') return { log, more: false };
  if (seg[0] === 'bugs') return mockBugs(seg, url, init);
  if (seg[0] === 'reports' || seg[0] === 'sanctions') return mockModeration(seg, url, init);
  if (seg[0] === 'users' && !seg[1]) {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    return { users: users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.includes(q) || u.id === q) };
  }
  const u = users.find((x) => x.id === seg[1]);
  if (!u) throw new Error('introuvable');
  if (seg[2] === 'sanctions' && init) {
    const b = init.body as { kind: SanctionKind; reason: string; days: number | null };
    const x = {
      id: crypto.randomUUID(),
      userId: u.id,
      kind: b.kind,
      reason: b.reason,
      until: b.days === null ? null : Date.now() + b.days * DAY,
      at: Date.now(),
      actor: 'admin@exemple.fr',
      liftedAt: null,
      active: true
    };
    sanctions.unshift(x);
    refreshFlags();
    return x;
  }
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
