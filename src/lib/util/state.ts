import type { Game, PersistedState, SortKey, StoreId } from '../types';
import { STORE_ORDER } from '../stores-meta';

export const SESSION_DAYS = 90;

export function defaultState(): PersistedState {
  return {
    version: 1,
    favorites: [],
    hidden: [],
    renames: {},
    customCovers: {},
    steamIdCache: {},
    firstSeen: {},
    totals: {},
    sessions: [],
    localFolders: [],
    manualGames: [],
    disabledStores: [],
    accent: '#7c6cff',
    theme: 'dark',
    sort: 'recent',
    prefs: { minimizeOnLaunch: true, startWithWindows: false, autoCovers: true, steamGridDbKey: '' }
  };
}

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const numMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'number' && isFinite(x)) out[k] = x;
  return out;
};
const strMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'string') out[k] = x;
  return out;
};

/**
 * Lit un état venant du disque (n'importe quelle version, y compris la v1 de l'app
 * qui n'avait pas de champ `version`) et le ramène au format courant.
 */
export function normalizeState(raw: unknown, now = Date.now()): PersistedState {
  const s = defaultState();
  if (!isObj(raw)) return s;

  s.favorites = strArr(raw.favorites);
  s.hidden = strArr(raw.hidden);
  s.renames = strMap(raw.renames);
  s.customCovers = strMap(raw.customCovers);
  s.steamIdCache = numMap(raw.steamIdCache);
  s.firstSeen = numMap(raw.firstSeen);
  s.localFolders = strArr(raw.localFolders);
  s.disabledStores = strArr(raw.disabledStores).filter((x): x is StoreId => STORE_ORDER.includes(x as StoreId));
  if (typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent)) s.accent = raw.accent;
  if (raw.theme === 'dark' || raw.theme === 'light' || raw.theme === 'system') s.theme = raw.theme;
  if (raw.sort === 'recent' || raw.sort === 'az' || raw.sort === 'hours') s.sort = raw.sort as SortKey;
  if (isObj(raw.prefs)) {
    const p = raw.prefs;
    if (typeof p.minimizeOnLaunch === 'boolean') s.prefs.minimizeOnLaunch = p.minimizeOnLaunch;
    if (typeof p.startWithWindows === 'boolean') s.prefs.startWithWindows = p.startWithWindows;
    if (typeof p.autoCovers === 'boolean') s.prefs.autoCovers = p.autoCovers;
    if (typeof p.steamGridDbKey === 'string') s.prefs.steamGridDbKey = p.steamGridDbKey.trim();
  }
  if (Array.isArray(raw.manualGames)) {
    s.manualGames = raw.manualGames.filter(isObj).map((g) => manualGame(g as unknown as Game)).filter((g) => g !== null);
  }
  if (isObj(raw.totals)) {
    for (const [id, t] of Object.entries(raw.totals)) {
      if (!isObj(t)) continue;
      s.totals[id] = {
        playMs: typeof t.playMs === 'number' ? t.playMs : 0,
        launches: typeof t.launches === 'number' ? t.launches : 0,
        lastPlayed: typeof t.lastPlayed === 'number' ? t.lastPlayed : 0
      };
    }
  }
  if (Array.isArray(raw.sessions)) {
    const min = now - SESSION_DAYS * 86_400_000;
    s.sessions = raw.sessions
      .filter(isObj)
      .filter((x) => typeof x.gameId === 'string' && typeof x.start === 'number' && typeof x.end === 'number')
      .map((x) => ({ gameId: x.gameId as string, start: x.start as number, end: x.end as number }))
      .filter((x) => x.end >= min && x.end >= x.start);
  }

  // Migration depuis la v1 (pas de `version`) : recents, launches, coverCache.
  if (raw.version === undefined) {
    const recents = numMap(raw.recents);
    const launches = numMap(raw.launches);
    for (const id of new Set([...Object.keys(recents), ...Object.keys(launches)])) {
      const t = (s.totals[id] ??= { playMs: 0, launches: 0, lastPlayed: 0 });
      t.lastPlayed = Math.max(t.lastPlayed, recents[id] ?? 0);
      t.launches = Math.max(t.launches, launches[id] ?? 0);
    }
    Object.assign(s.steamIdCache, numMap(raw.coverCache));
  }
  return s;
}

function manualGame(g: Game): Game | null {
  if (typeof g.id !== 'string' || typeof g.name !== 'string' || !isObj(g.launch)) return null;
  const target = typeof g.launch.target === 'string' ? g.launch.target : '';
  if (!target) return null;
  return {
    id: g.id.startsWith('manual:') ? g.id : `manual:${target.toLowerCase()}`,
    name: g.name,
    store: 'manual',
    installDir: typeof g.installDir === 'string' ? g.installDir : null,
    launch: {
      kind: 'exe',
      target,
      args: typeof g.launch.args === 'string' ? g.launch.args : '',
      cwd: typeof g.launch.cwd === 'string' ? g.launch.cwd : null
    },
    launcherName: "l'exécutable du jeu",
    steamAppId: null,
    exePath: target.toLowerCase().endsWith('.exe') ? target : null,
    processNames: [],
    genre: null
  };
}
