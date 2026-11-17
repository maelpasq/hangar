// Appels à l'API du dashboard (server/src/admin/routes.ts), sur la même adresse : Cloudflare Access
// ajoute lui-même le jeton de l'administrateur. En `npm run admin:dev`, des données de démo.
import type { Badge } from '../../src/lib/types';

export type { Badge };

export interface Me {
  email: string;
  badges: Badge[];
}

export interface Stats {
  users: number;
  newWeek: number;
  activeWeek: number;
  friendsOn: number;
  online: number;
  reports: number;
  reportsWeek: number;
  signups: { day: number; n: number }[];
  badges: Partial<Record<Badge, number>>;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  since: number;
  lastSeen: number | null;
  certified: boolean;
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
  reportsReceived: { id: string; reporterId: string; reporterName: string | null; reason: string; excerpt: string | null; at: number }[];
  reportsMade: number;
  log: LogRow[];
}

export class ApiError extends Error {
  constructor(public status: number) {
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
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}

export const api = {
  me: () => call<Me>('/me'),
  stats: () => call<Stats>('/stats'),
  users: (q: string) => call<{ users: UserRow[] }>(`/users?q=${encodeURIComponent(q)}`),
  user: (id: string) => call<UserCard>(`/users/${encodeURIComponent(id)}`),
  setBadge: (id: string, badge: Badge, on: boolean) =>
    call<{ badges: Badge[] }>(`/users/${encodeURIComponent(id)}/badges`, { method: 'PUT', body: { badge, on } }),
  log: (before?: number) => call<{ log: LogRow[]; more: boolean }>(`/log${before ? `?before=${before}` : ''}`),
  avatarUrl: (id: string) => (demo ? null : `/api/users/${encodeURIComponent(id)}/avatar`)
};

/** Environnement d'après l'adresse : `hangar-admin-test…` est celui de Hangar Test. */
export const envName = import.meta.env.DEV ? 'Démo' : location.hostname.includes('-test') ? 'Test' : 'Prod';
