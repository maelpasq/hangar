import type { CloudSync, Collection, DeviceTime, Game, PersistedState, PortableGame, Session, SortKey, StoreId } from '../types';
import { httpsLink, profileGamesOf } from './sync';
import { STORE_ORDER } from '../stores-meta';

export const SESSION_DAYS = 90;
/** Identifiant d'installation (32 caractères hexadécimaux). */
export const DEVICE_ID = /^[0-9a-f]{32}$/;

export function defaultState(): PersistedState {
  return {
    version: 2,
    deviceId: newDeviceId(),
    stamps: {},
    portable: {},
    installLinks: {},
    favorites: [],
    hidden: [],
    renames: {},
    customCovers: {},
    steamIdCache: {},
    officialSites: {},
    firstSeen: {},
    webPlayed: {},
    totals: {},
    sessions: [],
    localFolders: [],
    manualGames: [],
    collections: [],
    disabledStores: [],
    accent: '#7c6cff',
    theme: 'dark',
    sort: 'recent',
    onboarded: false,
    lastVersion: null,
    prefs: {
      minimizeOnLaunch: true,
      startWithWindows: false,
      autoCovers: true,
      showUninstalled: true,
      steamGridDb: false,
      webGames: null,
      closeAction: 'ask',
      globalShortcut: true,
      discordPresence: false,
      padButton: false,
      padAtLogin: false,
      startPage: null,
      showcase: [],
      profileGames: []
    },
    cloud: defaultCloud()
  };
}

export function defaultCloud(): CloudSync {
  return { cursor: 0, dirty: [], merged: false, hiddenHere: [], aliases: {}, times: {}, timeSent: {}, sessionCursor: 0, coverHash: {}, coversSent: [], coverWanted: {} };
}

/** Identifiant d'installation : aléatoire, sans rapport avec la machine ni la personne. */
function newDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const numMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'number' && isFinite(x)) out[k] = x;
  return out;
};
/** Empreinte SHA-256 d'une jaquette envoyée au compte (hexadécimal). */
export const COVER_HASH = /^[0-9a-f]{64}$/;

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

  // Version 2 (socle du compte Hangar) : un état d'avant n'a aucun de ces champs. L'identifiant
  // est créé ici et les dates de modification au premier enregistrement (`stampChanges`).
  if (typeof raw.deviceId === 'string' && /^[0-9a-f]{32}$/.test(raw.deviceId)) s.deviceId = raw.deviceId;
  s.stamps = numMap(raw.stamps);
  if (isObj(raw.portable)) {
    for (const [id, f] of Object.entries(raw.portable)) {
      const fiche = isObj(f) ? portableGame(f) : null;
      if (fiche) s.portable[id] = fiche;
    }
  }
  for (const [id, url] of Object.entries(strMap(raw.installLinks))) {
    if (url === '' || httpsLink(url)) s.installLinks[id] = url;
  }
  s.favorites = strArr(raw.favorites);
  s.hidden = strArr(raw.hidden);
  s.renames = strMap(raw.renames);
  s.customCovers = strMap(raw.customCovers);
  s.steamIdCache = numMap(raw.steamIdCache);
  for (const [key, url] of Object.entries(strMap(raw.officialSites))) {
    if (/^(\d+|wd:.{1,200})$/.test(key) && (url === '' || httpsLink(url))) s.officialSites[key] = url;
  }
  s.firstSeen = numMap(raw.firstSeen);
  s.webPlayed = numMap(raw.webPlayed);
  s.localFolders = strArr(raw.localFolders);
  s.disabledStores = strArr(raw.disabledStores).filter((x): x is StoreId => STORE_ORDER.includes(x as StoreId));
  if (typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent)) s.accent = raw.accent;
  if (raw.theme === 'dark' || raw.theme === 'light' || raw.theme === 'system') s.theme = raw.theme;
  if (raw.sort === 'recent' || raw.sort === 'az' || raw.sort === 'hours') s.sort = raw.sort as SortKey;
  s.onboarded = raw.onboarded === true;
  if (typeof raw.lastVersion === 'string' && /^\d+(\.\d+)*$/.test(raw.lastVersion)) s.lastVersion = raw.lastVersion;
  if (isObj(raw.prefs)) {
    const p = raw.prefs;
    if (typeof p.minimizeOnLaunch === 'boolean') s.prefs.minimizeOnLaunch = p.minimizeOnLaunch;
    if (typeof p.startWithWindows === 'boolean') s.prefs.startWithWindows = p.startWithWindows;
    if (typeof p.autoCovers === 'boolean') s.prefs.autoCovers = p.autoCovers;
    if (typeof p.showUninstalled === 'boolean') s.prefs.showUninstalled = p.showUninstalled;
    if (typeof p.webGames === 'boolean') s.prefs.webGames = p.webGames;
    for (const k of ['globalShortcut', 'discordPresence', 'padButton', 'padAtLogin'] as const) {
      if (typeof p[k] === 'boolean') s.prefs[k] = p[k];
    }
    // Fermeture : l'ancien réglage était activé d'office (true enregistré pour tout le monde),
    // donc seul un « false » choisi par l'utilisateur est gardé ; sinon Hangar demandera.
    if (p.closeAction === 'ask' || p.closeAction === 'tray' || p.closeAction === 'quit') s.prefs.closeAction = p.closeAction;
    else if (p.closeToTray === false) s.prefs.closeAction = 'quit';
    const sp = p.startPage;
    if (sp === 'home' || sp === 'library' || sp === 'favorites' || sp === 'web') s.prefs.startPage = sp;
    else if (typeof sp === 'string' && /^collection:.+/.test(sp)) s.prefs.startPage = sp as `collection:${string}`;
    if (typeof p.steamGridDb === 'boolean') s.prefs.steamGridDb = p.steamGridDb;
    if (Array.isArray(p.showcase)) {
      s.prefs.showcase = [...new Set(p.showcase.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 100))].slice(0, 3);
    }
    const pg = profileGamesOf(p.profileGames);
    if (pg) s.prefs.profileGames = pg;
  }
  if (Array.isArray(raw.collections)) {
    const seen = new Set<string>();
    s.collections = raw.collections
      .filter(isObj)
      .filter((c) => typeof c.id === 'string' && typeof c.name === 'string' && c.name.trim() && !seen.has(c.id) && seen.add(c.id))
      .map((c): Collection => ({ id: c.id as string, name: (c.name as string).trim().slice(0, 60), games: [...new Set(strArr(c.games))] }));
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
        lastPlayed: typeof t.lastPlayed === 'number' ? t.lastPlayed : 0,
        ...(typeof t.hangarMs === 'number' && t.hangarMs >= 0 ? { hangarMs: t.hangarMs } : {})
      };
    }
  }
  if (Array.isArray(raw.sessions)) {
    const min = now - SESSION_DAYS * 86_400_000;
    s.sessions = raw.sessions
      .filter(isObj)
      .filter((x) => typeof x.gameId === 'string' && typeof x.start === 'number' && typeof x.end === 'number')
      .map((x): Session => {
        const out: Session = { gameId: x.gameId as string, start: x.start as number, end: x.end as number };
        // Session d'un autre poste du compte : son identifiant sert à ne pas la reprendre deux fois.
        if (typeof x.deviceId === 'string' && DEVICE_ID.test(x.deviceId) && typeof x.id === 'string' && x.id) {
          out.deviceId = x.deviceId;
          out.id = x.id;
        } else {
          if (x.done === true) out.done = true;
          if (x.sent === true) out.sent = true;
        }
        return out;
      })
      .filter((x) => x.end >= min && x.end >= x.start);
  }

  if (isObj(raw.cloud)) {
    const c = raw.cloud;
    if (typeof c.cursor === 'number' && Number.isSafeInteger(c.cursor) && c.cursor >= 0) s.cloud.cursor = c.cursor;
    s.cloud.dirty = [...new Set(strArr(c.dirty))];
    s.cloud.merged = c.merged === true;
    s.cloud.hiddenHere = strArr(c.hiddenHere);
    if (isObj(c.aliases)) {
      for (const [id, a] of Object.entries(c.aliases)) {
        if (isObj(a) && typeof a.exe === 'string' && a.exe && typeof a.dir === 'string') s.cloud.aliases[id] = { exe: a.exe, dir: a.dir };
      }
    }
    if (isObj(c.times)) {
      for (const [dev, games] of Object.entries(c.times)) {
        if (!DEVICE_ID.test(dev) || !isObj(games)) continue;
        for (const [pid, t] of Object.entries(games)) {
          const time = isObj(t) ? deviceTime(t) : null;
          if (time) (s.cloud.times[dev] ??= {})[pid] = time;
        }
      }
    }
    s.cloud.timeSent = strMap(c.timeSent);
    if (typeof c.sessionCursor === 'number' && Number.isSafeInteger(c.sessionCursor) && c.sessionCursor >= 0) {
      s.cloud.sessionCursor = c.sessionCursor;
    }
    for (const [path, h] of Object.entries(strMap(c.coverHash))) if (h === '' || COVER_HASH.test(h)) s.cloud.coverHash[path] = h;
    if (Array.isArray(c.coversSent)) {
      s.cloud.coversSent = [...new Set(c.coversSent.filter((h): h is string => typeof h === 'string' && COVER_HASH.test(h)))];
    }
    for (const [id, h] of Object.entries(strMap(c.coverWanted))) if (COVER_HASH.test(h)) s.cloud.coverWanted[id] = h;
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

function deviceTime(t: Raw): DeviceTime | null {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const [playMs, launches, lastPlayed, at] = [n(t.playMs), n(t.launches), n(t.lastPlayed), n(t.at)];
  if (playMs === null || launches === null || lastPlayed === null || at === null) return null;
  return { playMs, launches, lastPlayed, store: t.store === true, at };
}

function portableGame(f: Raw): PortableGame | null {
  if (typeof f.name !== 'string' || typeof f.exe !== 'string' || typeof f.dir !== 'string' || !f.exe) return null;
  const out: PortableGame = { name: f.name, exe: f.exe.toLowerCase(), dir: f.dir.toLowerCase() };
  if (typeof f.steamAppId === 'number' && f.steamAppId > 0) out.steamAppId = f.steamAppId;
  const url = typeof f.installUrl === 'string' ? httpsLink(f.installUrl) : null;
  if (url) out.installUrl = url;
  return out;
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
