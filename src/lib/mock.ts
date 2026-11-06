// Implémentation de démo de api.ts pour `npm run dev:web` : les 36 jeux de la maquette,
// des sessions et favoris fictifs, un lancement simulé.

import demo from '../../design/reference/demo-games.json';
import type { Api } from './api';
import { STORES } from './stores-meta';
import type { AccountStatus, Game, LaunchEvent, PersistedState, Session, StoreId } from './types';
import { defaultState } from './util/state';

interface DemoGame {
  id: string;
  name: string;
  store: string;
  steamAppId: number | null;
  genre: string;
  hours: number;
  lastDays: number;
  sizeGb: number;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

const PATHS: Record<string, (n: string) => string> = {
  steam: (n) => `C:\\Program Files (x86)\\Steam\\steamapps\\common\\${n}`,
  epic: (n) => `C:\\Program Files\\Epic Games\\${n.replace(/\s/g, '')}`,
  gog: (n) => `C:\\GOG Games\\${n}`,
  ubisoft: (n) => `C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\${n}`,
  ea: (n) => `C:\\Program Files\\EA Games\\${n}`,
  battlenet: (n) => `C:\\Program Files (x86)\\${n}`,
  xbox: (n) => `C:\\XboxGames\\${n}\\Content`,
  riot: (n) => `C:\\Riot Games\\${n}`,
  local: (n) => `D:\\Jeux\\${n}`
};

const games: DemoGame[] = (demo as { games: DemoGame[] }).games;

function toGame(d: DemoGame): Game {
  const store = d.store as StoreId;
  const dir = (PATHS[store] ?? PATHS.local)(d.name);
  return {
    id: `${store}:${d.id}`,
    name: d.name,
    store,
    installDir: dir,
    launch: { kind: 'uri', target: `demo://${d.id}`, args: '' },
    launcherName: STORES[store].launcher,
    steamAppId: store === 'steam' ? d.steamAppId : null,
    exePath: null,
    processNames: [],
    genre: d.genre
  };
}

/** Pseudo-aléatoire déterministe pour que la démo soit stable d'un rechargement à l'autre. */
function rnd(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function demoState(now: number): PersistedState {
  const s = defaultState();
  const today = new Date(now);
  today.setHours(20, 0, 0, 0);
  const evening = today.getTime();
  s.favorites = (demo as { favorites: string[] }).favorites.map((id) => {
    const g = games.find((x) => x.id === id)!;
    return `${g.store}:${g.id}`;
  });
  games.forEach((d, i) => {
    const id = `${d.store}:${d.id}`;
    const last = Math.min(now - 5 * 60_000, evening - d.lastDays * DAY);
    s.totals[id] = { playMs: d.hours * HOUR, launches: Math.round(d.hours * 1.7 + 3), lastPlayed: last };
    s.firstSeen[id] = now - (40 + ((i * 37) % 200)) * DAY;
    if (d.store !== 'steam' && d.steamAppId) s.steamIdCache[id] = d.steamAppId;
    // Sessions des 14 derniers jours pour l'histogramme.
    for (let day = d.lastDays; day < 14; day++) {
      if (day !== d.lastDays && rnd(i * 31 + day) < 0.45) continue;
      const len = (0.4 + rnd(i * 7 + day) * 3.2) * HOUR;
      const end = day === d.lastDays ? last : evening - day * DAY;
      s.sessions.push({ gameId: id, start: end - len, end });
    }
  });
  s.localFolders = ['D:\\Jeux', 'E:\\Emulation'];
  return s;
}

/**
 * Mode `?demo=reel` : proche d'un vrai premier lancement (peu de jeux, aucun historique,
 * pas de genre, beaucoup de jaquettes générées, noms et chemins très longs).
 */
function reelLibrary(): Game[] {
  const g = (id: string, name: string, store: StoreId, steamAppId: number | null, dir: string): Game => ({
    id: `${store}:${id}`,
    name,
    store,
    installDir: dir,
    launch: { kind: 'uri', target: `demo://${id}`, args: '' },
    launcherName: STORES[store].launcher,
    steamAppId,
    exePath: null,
    processNames: [],
    genre: null
  });
  return [
    g('284160', 'BeamNG.drive', 'steam', 284160, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\BeamNG.drive'),
    g('1248130', 'Farming Simulator 22', 'steam', 1248130, 'D:\\SteamLibrary\\steamapps\\common\\Farming Simulator 22'),
    g('620', 'Portal 2', 'steam', 620, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Portal 2'),
    g('526870', 'Satisfactory', 'steam', 526870, 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Satisfactory'),
    g('fortnite', 'Fortnite', 'epic', null, 'C:\\Program Files\\Epic Games\\Fortnite'),
    g('trackmania', 'Trackmania', 'ubisoft', null, 'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Trackmania'),
    g('valorant', 'VALORANT', 'riot', null, 'C:\\Riot Games\\VALORANT\\live'),
    g('minecraft', 'Minecraft Launcher', 'xbox', null, 'C:\\XboxGames\\Minecraft Launcher\\Content'),
    g('aniimo', 'Aniimo', 'local', null, 'C:\\Users\\Joueur\\AppData\\Local\\Programs\\Aniimo'),
    g('hytale', 'Hytale', 'local', null, 'C:\\Users\\Joueur\\AppData\\Roaming\\Hytale'),
    g('lunar', 'Lunar Client', 'local', null, 'C:\\Users\\Joueur\\AppData\\Local\\Programs\\lunarclient'),
    g(
      'long',
      "Un jeu au nom vraiment très très long pour tester les ellipses partout dans l'interface : Édition Ultime",
      'local',
      null,
      'E:\\Jeux indépendants\\Collection personnelle\\Prototypes et essais\\Un jeu au nom vraiment très très long\\Binaries\\Win64'
    )
  ];
}

/** Jeux possédés mais pas installés (bouton Installer). */
const UNINSTALLED: Game[] = [
  [400, 'Portal'],
  [1145360, 'Hades'],
  [632470, 'Disco Elysium'],
  [105600, 'Terraria']
].map(([id, name]) => ({
  id: `steam:${id}`,
  name: name as string,
  store: 'steam',
  installDir: null,
  launch: { kind: 'uri', target: `steam://install/${id}`, args: '' },
  launcherName: STORES.steam.launcher,
  steamAppId: id as number,
  exePath: null,
  processNames: [],
  notInstalled: true
}));

const REEL = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === 'reel';

export function mockApi(): Api {
  const now = Date.now();
  let state: unknown = REEL ? defaultState() : demoState(now);
  let library: Game[] = [];
  const lib = [...(REEL ? reelLibrary() : games.map(toGame)), ...UNINSTALLED];
  const listeners = new Set<(e: LaunchEvent) => void>();
  const running = new Map<string, { start: number; timers: number[] }>();
  const emit = (e: LaunchEvent) => listeners.forEach((l) => l(e));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const imgCache = new Map<string, Promise<string | null>>();
  const connected = new Map<StoreId, AccountStatus>();
  const synced = new Set<() => void>();
  const syncedNow = () => synced.forEach((cb) => cb());
  const link = (store: StoreId, user: string | null, games: number) => {
    connected.set(store, { store, detected: true, connectable: true, connected: true, user, games, syncedAt: Date.now() });
    syncedNow();
    return games;
  };

  return {
    isTauri: false,
    scanGames: async () => {
      await wait(700);
      return lib;
    },
    loadState: async () => state,
    saveState: async (s) => {
      state = JSON.parse(JSON.stringify(s));
    },
    loadLibrary: async () => library,
    saveLibrary: async (g) => {
      library = g;
    },
    launchGame: async (gameId) => {
      if (running.has(gameId)) return;
      const entry = { start: 0, timers: [] as number[] };
      running.set(gameId, entry);
      entry.timers.push(window.setTimeout(() => emit({ type: 'started', gameId }), 1000));
      entry.timers.push(
        window.setTimeout(() => {
          entry.start = Date.now();
          emit({ type: 'running', gameId, pid: 4242 });
        }, 2100)
      );
    },
    installGame: async () => {
      await wait(300);
    },
    stopGame: async (gameId) => {
      const r = running.get(gameId);
      if (!r) return;
      r.timers.forEach(clearTimeout);
      running.delete(gameId);
      await wait(300);
      const session: Session | null = r.start ? { gameId, start: r.start, end: Date.now() } : null;
      emit({ type: 'ended', gameId, session });
    },
    openFolder: async () => {},
    uninstallGame: async (id) => `Démo : la désinstallation de ${id} s'ouvrirait dans son launcher.`,
    setDesktop: async () => ({ presenceAvailable: true, shortcut: 'Ctrl+Alt+H', shortcutOk: true }),
    setTrayRecents: async () => {},
    trayState: async () => ({
      games: [
        { id: 'steam:526870', name: 'Satisfactory', cover: null },
        { id: 'steam:1293830', name: 'Forza Horizon 5', cover: null },
        { id: 'riot:valorant', name: 'VALORANT', cover: null }
      ],
      theme: 'dark',
      accent: '#7c6cff'
    }),
    trayAction: async () => {},
    onMainHidden: async () => () => {},
    setPresence: async () => {},
    onTrayLaunch: async () => () => {},
    resolveSteamId: async () => null,
    searchSteam: async (query) => {
      await wait(250);
      const q = query.trim().toLowerCase();
      if (/^\d+$/.test(q)) return [{ id: Number(q), name: `ID ${q}` }];
      return games
        .filter((g) => g.steamAppId && g.name.toLowerCase().includes(q))
        .slice(0, 5)
        .map((g) => ({ id: g.steamAppId!, name: g.name }));
    },
    findArtwork: async () => ({ cover: null, hero: null, source: '' }),
    image: (url) => {
      let p = imgCache.get(url);
      if (!p) {
        p = new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(url);
          img.onerror = () => resolve(null);
          img.src = url;
        });
        imgCache.set(url, p);
      }
      return p;
    },
    exeIcon: async () => null,
    gameInfo: async () => ({ genre: null }),
    folderSize: async (path) => {
      const g = games.find((d) => (PATHS[d.store] ?? PATHS.local)(d.name) === path);
      return g ? g.sizeGb * 1_000_000_000 : null;
    },
    setAutostart: async () => {},
    importCover: async (_id, path) => path,
    localSrc: (path) => path,
    pickExe: async () => 'D:\\Jeux\\Mon jeu\\MonJeu.exe',
    pickFolder: async () => 'F:\\Jeux portables',
    pickImage: async () => null,
    onLaunch: async (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onScanPartial: async () => () => {},
    accountsStatus: async () =>
      (['steam', 'epic', 'gog', 'ubisoft', 'ea', 'battlenet', 'riot', 'xbox'] as StoreId[]).map(
        (store) =>
          connected.get(store) ?? {
            store,
            detected: store !== 'battlenet',
            connectable: ['steam', 'gog', 'epic'].includes(store),
            connected: false,
            games: 0
          }
      ),
    connectSteam: async (key) => {
      await wait(800);
      if (!/^[0-9a-f]{32}$/i.test(key.trim()))
        throw 'Clé invalide : une clé Steam fait 32 caractères (chiffres et lettres A à F).';
      return link('steam', null, 214);
    },
    connectAccount: async (store) => {
      await wait(1200);
      return link(store, 'Joueur', store === 'gog' ? 38 : 112);
    },
    disconnectAccount: async (store) => {
      connected.delete(store);
      syncedNow();
    },
    openLink: async () => {},
    openWebGame: async () => {},
    onWebClosed: async () => () => {},
    onAccountsSynced: async (cb) => {
      synced.add(cb);
      return () => synced.delete(cb);
    },
    appVersion: async () => '1.0.0',
    checkUpdate: async () => {
      await new Promise((r) => setTimeout(r, 600));
      return { version: '1.1.0' };
    },
    installUpdate: async (onProgress) => {
      for (let i = 1; i <= 10; i++) {
        await new Promise((r) => setTimeout(r, 150));
        onProgress(i / 10);
      }
    },
    win: {
      minimize: async () => {},
      toggleMaximize: async () => {},
      close: async () => {},
      isMaximized: async () => false,
      restore: async () => {},
      setFullscreen: async (on) => {
        if (on) await document.documentElement.requestFullscreen?.().catch(() => {});
        else if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      },
      onFocusChange: async (cb) => {
        const f = () => cb(true);
        const b = () => cb(false);
        window.addEventListener('focus', f);
        window.addEventListener('blur', b);
        return () => {
          window.removeEventListener('focus', f);
          window.removeEventListener('blur', b);
        };
      }
    }
  };
}
