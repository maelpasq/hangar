// Appels à l'API du dashboard (server/src/admin/routes.ts), sur la même adresse : Cloudflare Access
// ajoute lui-même le jeton de l'administrateur. En `npm run admin:dev`, des données de démo.
/** Identifiant d'un badge (`certifie`, ou un badge créé dans le dashboard). */
export type Badge = string;

/** Badge tel que le dashboard le gère (server/src/admin/badges.ts). */
export interface AdminBadge {
  id: string;
  name: string;
  description: string;
  /** Emblème de l'app (`GIVEN_ICONS`). */
  icon: string;
  /** `#rrggbb` ou `accent`. */
  color: string;
  position: number;
  active: boolean;
  /** Nombre de comptes qui l'ont. */
  held: number;
  /** Un des 4 badges d'origine : ne se supprime pas. */
  legacy: boolean;
}

export interface BadgeFields {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  active?: boolean;
}

export interface Me {
  email: string;
  badges: AdminBadge[];
}

export interface Stats {
  users: number;
  newWeek: number;
  activeWeek: number;
  friendsOn: number;
  online: number;
  reports: number;
  reportsWeek: number;
  bugsOpen: number;
  reportsOpen: number;
  signups: { day: number; n: number }[];
  badges: Record<string, number>;
}

export type SanctionKind = 'social' | 'total';
export type ReportStatus = 'ouvert' | 'traite' | 'rejete';

export interface Sanction {
  id: string;
  kind: SanctionKind;
  /** Motif montré à la personne. */
  reason: string;
  /** Fin (ms), null : définitive. */
  until: number | null;
  at: number;
  actor: string;
  liftedAt: number | null;
  active: boolean;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string | null;
  targetId: string;
  targetName: string | null;
  targetSanctions: SanctionKind[];
  reason: string;
  excerpt: string | null;
  at: number;
  status: ReportStatus;
  handledAt: number | null;
}

export interface ReportList {
  reports: Report[];
  counts: Partial<Record<ReportStatus, number>>;
  more: boolean;
}

export type BugStatus = 'nouveau' | 'confirme' | 'en_cours' | 'corrige' | 'rejete' | 'doublon';

export interface BugRow {
  id: number;
  title: string;
  version: string;
  os: string;
  status: BugStatus;
  fixedIn: string | null;
  duplicateOf: number | null;
  capture: boolean;
  discord: boolean;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

export interface BugCard extends BugRow {
  description: string;
  note: string | null;
  log: LogRow[];
}

export interface BugList {
  bugs: BugRow[];
  counts: Partial<Record<BugStatus, number>>;
  more: boolean;
}

export interface BugChange {
  status?: BugStatus;
  fixedIn?: string | null;
  duplicateOf?: string | number | null;
  note?: string | null;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  since: number;
  lastSeen: number | null;
  certified: boolean;
  /** Sanction en cours (`total` l'emporte). */
  sanction: SanctionKind | null;
}

export interface LogRow {
  id: string;
  at: number;
  actor: string;
  action: string;
  targetId: string | null;
  targetName?: string | null;
  detail: Record<string, unknown> | null;
}

export interface UserCard {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  since: number;
  avatar: boolean;
  devices: { id: string; name: string; createdAt: number; lastSeen: number }[];
  social: { enabled: boolean; code: string; findable: boolean; online: boolean; seen: number | null; friends: number } | null;
  library: { entries: number; sessions: number; playMs: number; covers: number };
  badges: Badge[];
  reportsReceived: { id: string; reporterId: string; reporterName: string | null; reason: string; excerpt: string | null; at: number; status: ReportStatus }[];
  reportsMade: number;
  sanctions: Sanction[];
  log: LogRow[];
}

export class ApiError extends Error {
  /** `code` : le champ `error` de la réponse (`version`, `doublon`...), si elle en a un. */
  constructor(
    public status: number,
    public code = ''
  ) {
    super(`Erreur ${status}`);
  }
}

const demo = import.meta.env.DEV ? import('./mock').then((m) => m.mock) : null;

async function call<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  if (demo) return (await demo)(path, init) as T;
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: init ? { 'content-type': 'application/json' } : undefined,
    body: init ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin'
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new ApiError(res.status, typeof body?.error === 'string' ? body.error : '');
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => call<Me>('/me'),
  stats: () => call<Stats>('/stats'),
  users: (q: string) => call<{ users: UserRow[] }>(`/users?q=${encodeURIComponent(q)}`),
  user: (id: string) => call<UserCard>(`/users/${encodeURIComponent(id)}`),
  setBadge: (id: string, badge: Badge, on: boolean) =>
    call<{ badges: Badge[] }>(`/users/${encodeURIComponent(id)}/badges`, { method: 'PUT', body: { badge, on } }),
  badges: () => call<{ badges: AdminBadge[] }>('/badges'),
  createBadge: (fields: BadgeFields) => call<{ id: string }>('/badges', { method: 'POST', body: fields }),
  updateBadge: (id: string, fields: BadgeFields) =>
    call<{ badges: AdminBadge[] }>(`/badges/${encodeURIComponent(id)}`, { method: 'PUT', body: fields }),
  orderBadges: (ids: string[]) => call<{ badges: AdminBadge[] }>('/badges/order', { method: 'PUT', body: { ids } }),
  deleteBadge: (id: string) => call<{ badges: AdminBadge[] }>(`/badges/${encodeURIComponent(id)}`, { method: 'DELETE', body: null }),
  /** Donne (`on`) ou retire un badge à plusieurs comptes (identifiant, code ami ou e-mail). */
  bulkBadge: (id: string, users: string[], on: boolean) =>
    call<{ found: number; changed: number; missing: string[] }>(`/badges/${encodeURIComponent(id)}/users`, {
      method: 'POST',
      body: { users, on }
    }),
  log: (before?: number) => call<{ log: LogRow[]; more: boolean }>(`/log${before ? `?before=${before}` : ''}`),
  avatarUrl: (id: string) => (demo ? null : `/api/users/${encodeURIComponent(id)}/avatar`),
  bugs: (statut: string, q: string, before?: number) =>
    call<BugList>(`/bugs?statut=${encodeURIComponent(statut)}&q=${encodeURIComponent(q)}${before ? `&before=${before}` : ''}`),
  bug: (id: number) => call<BugCard>(`/bugs/${id}`),
  updateBug: (id: number, change: BugChange) => call<BugRow>(`/bugs/${id}`, { method: 'PUT', body: change }),
  captureUrl: (id: number) => (demo ? null : `/api/bugs/${id}/capture`),
  reports: (statut: string, before?: number) =>
    call<ReportList>(`/reports?statut=${encodeURIComponent(statut)}${before ? `&before=${before}` : ''}`),
  setReport: (id: string, status: ReportStatus) =>
    call<{ status: ReportStatus }>(`/reports/${encodeURIComponent(id)}`, { method: 'PUT', body: { status } }),
  sanction: (userId: string, kind: SanctionKind, reason: string, days: number | null) =>
    call<Sanction>(`/users/${encodeURIComponent(userId)}/sanctions`, { method: 'POST', body: { kind, reason, days } }),
  lift: (id: string) => call<Sanction>(`/sanctions/${encodeURIComponent(id)}`, { method: 'DELETE', body: null })
};

/** Environnement d'après l'adresse : `hangar-admin-test…` est celui de Hangar Test. */
export const envName = import.meta.env.DEV ? 'Démo' : location.hostname.includes('-test') ? 'Test' : 'Prod';
