// Implémentation de démo de api.ts pour `npm run dev:web` : les 36 jeux de la maquette,
// des sessions et favoris fictifs, un lancement simulé.

import demo from '../../design/reference/demo-games.json';
import type { Api } from './api';
import { STORES } from './stores-meta';
import type { AccountStatus, CloudChange, CloudSession, CloudStatus, Game, LaunchEvent, LauncherPrompt, PersistedState, Session, StoreId } from './types';
import { RELEASES } from './util/release-notes';
import { mockSocial } from './mock-social';
import type { SocialEvent } from './types';
import { defaultState } from './util/state';

/** Version affichée en démo : la dernière de docs/RELEASES.md. */
const DEMO_VERSION = RELEASES[0]?.version ?? '1.0.0';

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
  rockstar: (n) => `C:\\Program Files\\Rockstar Games\\${n}`,
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
  // Notes de la version de démo déjà vues (sinon la fenêtre Nouveautés à chaque chargement).
  s.lastVersion = DEMO_VERSION;
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
  notInstalled: true,
  linux: id !== 632470
}));

const REEL = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === 'reel';

export function mockApi(): Api {
  const now = Date.now();
  let state: unknown = REEL ? defaultState() : demoState(now);
  let library: Game[] = [];
  const lib = [...(REEL ? reelLibrary() : games.map(toGame)), ...UNINSTALLED].map((g) =>
    REEL || !['steam:satisfactory', 'steam:cyberpunk'].includes(g.id) ? g : { ...g, updatePending: true, updateBytes: 2_400_000_000 }
  );
  const listeners = new Set<(e: LaunchEvent) => void>();
  const running = new Map<string, { start: number; timers: number[] }>();
  const emit = (e: LaunchEvent) => listeners.forEach((l) => l(e));
  // Démo d'une question de Steam Cloud : `?prompt=syncFailed` (ou pending, conflict).
  const promptKind = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('prompt') : null;
  const prompts = new Set<(p: LauncherPrompt) => void>();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const imgCache = new Map<string, Promise<string | null>>();
  const connected = new Map<StoreId, AccountStatus>();
  // Connexion Xbox de démo : attente du code, annulable.
  let xboxWaiting = false;
  let cloud: CloudStatus = { connected: false, offline: false, revoked: false, user: null, devices: [] };
  let cloudCancelled = false;
  const socialListeners = new Set<(e: SocialEvent) => void>();
  // Temps réel de démo : ouvert dès que l'app le demande (statut « En ligne »).
  const liveListeners = new Set<(on: boolean) => void>();
  const social = mockSocial((e) => socialListeners.forEach((l) => l(e)));
  // Serveur de démo : un jeu manuel d'un autre PC (carte « Sur un autre PC ») et une collection.
  const day = 864e5;
  const remote = new Map<string, CloudChange>(
    [
      { key: 'game:@hollow_knight.exe|hollow knight', value: JSON.stringify({ name: 'Hollow Knight', steamAppId: 367520, installUrl: 'https://www.hollowknight.com/' }), updatedAt: Date.now() - 3 * day },
      { key: 'game:@outer.exe|outer wilds', value: JSON.stringify({ name: 'Outer Wilds', steamAppId: null, installUrl: null }), updatedAt: Date.now() - 3 * day },
      // Pas sur Steam : son site vient de Wikidata.
      { key: 'game:@lunar client.exe|lunar client', value: JSON.stringify({ name: 'Lunar Client', steamAppId: null, installUrl: null }), updatedAt: Date.now() - 3 * day },
      { key: 'fav:@hollow_knight.exe|hollow knight', value: 'true', updatedAt: Date.now() - 2 * day },
      { key: 'collection:cdemo', value: JSON.stringify({ name: 'Sur le portable', games: ['@hollow_knight.exe|hollow knight', '@outer.exe|outer wilds'] }), updatedAt: Date.now() - 2 * day },
      // Temps de jeu du portable (temps cumulé et détail par PC).
      { key: `time:${'b'.repeat(32)}:epic:fortnite`, value: JSON.stringify({ ms: 31 * 36e5, n: 40, last: Date.now() - 2 * day }), updatedAt: Date.now() - 2 * day },
      { key: `time:${'b'.repeat(32)}:riot:valorant`, value: JSON.stringify({ ms: 12 * 36e5, n: 18, last: Date.now() - 4 * day }), updatedAt: Date.now() - 4 * day },
      { key: `time:${'b'.repeat(32)}:@hollow_knight.exe|hollow knight`, value: JSON.stringify({ ms: 23 * 36e5, n: 15, last: Date.now() - 2 * day }), updatedAt: Date.now() - 2 * day }
    ].map((c) => [c.key, { ...c, deviceId: 'b'.repeat(32) }])
  );
  const remoteSessions: CloudSession[] = [
    [2, 'epic:fortnite', 2.5],
    [3, 'epic:fortnite', 1.2],
    [6, 'epic:fortnite', 3],
    [4, 'riot:valorant', 1.5],
    [2, '@hollow_knight.exe|hollow knight', 2]
  ].map(([days, gameId, hours], i) => {
    const end = Date.now() - (days as number) * day;
    return { id: `demo-${i}`, gameId: gameId as string, start: end - (hours as number) * 36e5, end, deviceId: 'b'.repeat(32) };
  });
  let remoteCursor = 1;
  const remoteSeq = new Map<string, number>([...remote.keys()].map((k) => [k, 1]));
  const synced = new Set<() => void>();
  const syncedNow = () => synced.forEach((cb) => cb());
  const link = (store: StoreId, user: string | null, games: number) => {
    const gain = { steam: [37, 52, 0], epic: [6, 0, 2], gog: [0, 0, 0] }[store as 'steam'] ?? [0, 0, 0];
    const [added, playTime, updates] = gain;
    connected.set(store, {
      store,
      detected: true,
      connectable: true,
      connected: true,
      user,
      games,
      syncedAt: Date.now(),
      added,
      playTime,
      updates
    });
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
      if (promptKind) {
        const kind = promptKind as LauncherPrompt['kind'];
        entry.timers.push(window.setTimeout(() => prompts.forEach((cb) => cb({ kind, hwnd: 1 })), 1600));
        return;
      }
      entry.timers.push(
        window.setTimeout(() => {
          entry.start = Date.now();
          emit({ type: 'running', gameId, pid: 4242 });
        }, 2100)
      );
    },
    installGame: async (id) => {
      await wait(300);
      return `Démo : ${id} s'installe en arrière-plan.`;
    },
    installProgress: async () => null,
    steamDownloads: async () => [],
    showSteamDownloads: async () => {},
    installTargets: async (id) =>
      id.startsWith('steam:') || id.startsWith('epic:')
        ? [
            { path: 'D:/Jeux', label: 'D:/Jeux', free: 955_000_000_000 },
            { path: 'C:/Jeux', label: 'C:/Jeux', free: 12_000_000_000 }
          ]
        : [],
    stopGame: async (gameId) => {
      const r = running.get(gameId);
      if (!r) return;
      r.timers.forEach(clearTimeout);
      running.delete(gameId);
      await wait(300);
      const session: Session | null = r.start ? { gameId, start: r.start, end: Date.now() } : null;
      emit({ type: 'ended', gameId, session });
    },
    focusGame: async (gameId) => running.has(gameId),
    showLaunchers: async () => false,
    openFolder: async () => {},
    uninstallGame: async (id) => `Démo : désinstallation de ${id} en cours…`,
    updateGame: async (id) => `Démo : ${id} se met à jour en arrière-plan.`,
    setDesktop: async () => ({ presenceAvailable: true, shortcut: 'Ctrl+Alt+H', shortcutOk: true }),
    padBack: async () => {},
    gameBarOnButton: async () => true,
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
    onCloseAsk: async () => () => {},
    closeMain: async () => {},
    setPresence: async () => {},
    onTrayLaunch: async () => () => {},
    onPadGuide: async () => () => {},
    resolveSteamId: async () => null,
    officialSite: async (appId) => ({ 367520: 'https://hollowknight.com', 504230: 'https://www.celestegame.com' })[appId] ?? null,
    wikidataSite: async (name) => (/lunar client/i.test(name) ? 'https://www.lunarclient.com/' : null),
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
    findSocialArtwork: async () => ({ cover: null, hero: null, source: '' }),
    setSteamGridKey: async () => {},
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
    steamAchievements: async (gameId) =>
      connected.has('steam') && gameId.startsWith('steam:') ? { unlocked: 34, total: 50 } : null,
    folderSize: async (path) => {
      const g = games.find((d) => (PATHS[d.store] ?? PATHS.local)(d.name) === path);
      return g ? g.sizeGb * 1_000_000_000 : null;
    },
    setAutostart: async () => {},
    padAtLogin: async () => false,
    importCover: async (_id, path) => path,
    localSrc: (path) => path,
    pickExe: async () => 'D:\\Jeux\\Mon jeu\\MonJeu.exe',
    pickFolder: async () => 'F:\\Jeux portables',
    pickImage: async () => null,
    onLaunch: async (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onLauncherPrompt: async (cb) => {
      prompts.add(cb);
      return () => prompts.delete(cb);
    },
    answerLauncherPrompt: async () => {},
    onScanPartial: async () => () => {},
    accountsStatus: async () =>
      (['steam', 'epic', 'gog', 'ubisoft', 'ea', 'battlenet', 'riot', 'rockstar', 'xbox'] as StoreId[]).map(
        (store) =>
          connected.get(store) ?? {
            store,
            detected: store !== 'battlenet',
            connectable: ['steam', 'gog', 'epic', 'xbox'].includes(store),
            connected: false,
            games: 0,
            added: 0,
            playTime: 0,
            updates: 0
          }
      ),
    connectSteam: async (key) => {
      await wait(800);
      if (!/^[0-9a-f]{32}$/i.test(key.trim()))
        throw 'Clé invalide : une clé Steam fait 32 caractères (chiffres et lettres A à F).';
      return link('steam', null, 214);
    },
    xboxLoginCode: async () => {
      await wait(400);
      xboxWaiting = true;
      return { userCode: 'HGR4X2BQ', url: 'https://www.microsoft.com/link' };
    },
    xboxLoginCancel: async () => {
      xboxWaiting = false;
    },
    connectAccount: async (store) => {
      if (store === 'xbox') {
        await wait(6000);
        if (!xboxWaiting) throw 'Connexion annulée.';
        xboxWaiting = false;
        return link(store, 'Joueur', 17);
      }
      await wait(1200);
      return link(store, 'Joueur', store === 'gog' ? 38 : 112);
    },
    disconnectAccount: async (store) => {
      connected.delete(store);
      syncedNow();
    },
    // Compte Hangar de démo : connexion en 2 s (annulable), deux postes.
    cloudStatus: async () => structuredClone(cloud),
    cloudLogin: async () => {
      cloudCancelled = false;
      await wait(2000);
      if (cloudCancelled) throw '';
      cloud = {
        connected: true,
        offline: false,
        revoked: false,
        user: { id: 'demo-compte-0001', name: 'Alex', email: 'alex@exemple.fr', avatar: null, createdAt: Date.now() - 5000 },
        devices: [
          { id: 'a'.repeat(32), name: 'PC-SALON', createdAt: Date.now() - 864e5 * 30, lastSeen: Date.now(), connected: true, current: true },
          { id: 'b'.repeat(32), name: 'Portable', createdAt: Date.now() - 864e5 * 9, lastSeen: Date.now() - 864e5 * 2, connected: true, current: false }
        ]
      };
      return structuredClone(cloud);
    },
    cloudCancelLogin: async () => {
      cloudCancelled = true;
    },
    cloudLogout: async () => {
      cloud = { connected: false, offline: false, revoked: false, user: null, devices: [] };
    },
    cloudRenameDevice: async (id, name) => {
      cloud.devices = cloud.devices.map((d) => (d.id === id ? { ...d, name } : d));
      return structuredClone(cloud);
    },
    cloudForgetDevice: async (id) => {
      cloud.devices = cloud.devices.map((d) => (d.id === id ? { ...d, connected: false } : d));
      return structuredClone(cloud);
    },
    cloudPull: async (since) => {
      await wait(400);
      if (!cloud.connected) throw "Ce poste n'est pas connecté au compte.";
      const changes = [...remote.values()].filter((c) => (remoteSeq.get(c.key) ?? 0) > since);
      return { cursor: remoteCursor, more: false, changes: structuredClone(changes) };
    },
    cloudPush: async (changes) => {
      await wait(300);
      if (!cloud.connected) throw "Ce poste n'est pas connecté au compte.";
      remoteCursor++;
      for (const c of changes) {
        const prev = remote.get(c.key);
        if (prev && prev.updatedAt >= c.updatedAt) continue;
        remote.set(c.key, { ...c, deviceId: 'a'.repeat(32) });
        remoteSeq.set(c.key, remoteCursor);
      }
    },
    cloudPullSessions: async (since) => {
      await wait(200);
      if (!cloud.connected) throw "Ce poste n'est pas connecté au compte.";
      return { cursor: remoteCursor, more: false, sessions: since ? [] : structuredClone(remoteSessions) };
    },
    cloudPushSessions: async (sessions) => {
      await wait(200);
      if (!cloud.connected) throw "Ce poste n'est pas connecté au compte.";
      remoteCursor++;
      for (const s of sessions) if (!remoteSessions.some((x) => x.id === s.id)) remoteSessions.push({ ...s, deviceId: 'a'.repeat(32) });
    },
    cloudSyncSteamGridDb: async () => false,
    cloudSyncLaunchers: async () => {},
    cloudSetProfile: async (name) => {
      await wait(300);
      if (!cloud.user) throw "Ce poste n'est pas connecté au compte.";
      cloud.user.name = name.replace(/\s+/g, ' ').trim();
      return structuredClone(cloud);
    },
    cloudSetAvatar: async (bytes) => {
      await wait(400);
      if (!cloud.user) throw "Ce poste n'est pas connecté au compte.";
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      cloud.user.avatar = `data:image/webp;base64,${btoa(s)}`;
      return structuredClone(cloud);
    },
    cloudRemoveAvatar: async () => {
      if (cloud.user) cloud.user.avatar = null;
      return structuredClone(cloud);
    },
    cloudCoverHash: async () => null,
    cloudUploadCover: async () => true,
    cloudFetchCover: async () => null,
    cloudExport: async () => 'C:\\Users\\demo\\Downloads\\compte-hangar.json',
    cloudDeleteAccount: async () => {
      cloud = { connected: false, offline: false, revoked: false, user: null, devices: [] };
    },
    social: async <T>(method: string, path: string, body?: unknown) => {
      if (!cloud.connected) throw "Ce poste n'est pas connecté au compte.";
      return (await social.handle(method, path, body ?? {})) as T;
    },
    socialImage: async () => null,
    socialBanner: async () => {
      await wait(500);
      return (social.settings.banner = Date.now().toString(36));
    },
    socialLive: async (on) => {
      setTimeout(() => liveListeners.forEach((l) => l(on)), 150);
    },
    socialNotify: async () => {},
    onSocialEvent: async (cb) => {
      socialListeners.add(cb);
      return () => socialListeners.delete(cb);
    },
    onSocialLive: async (cb) => {
      liveListeners.add(cb);
      return () => liveListeners.delete(cb);
    },
    openLink: async () => {},
    openGameLink: async () => {},
    reportBug: async () => { await wait(800); },
    openWebGame: async () => {},
    onWebClosed: async () => () => {},
    onAccountsSynced: async (cb) => {
      synced.add(cb);
      return () => synced.delete(cb);
    },
    appVersion: async () => DEMO_VERSION,
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
