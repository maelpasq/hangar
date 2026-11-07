// Seul point d'appel aux commandes Tauri. En dehors de Tauri (npm run dev:web),
// l'implémentation de démo de mock.ts est utilisée.

import type { AccountStatus, Artwork, DesktopInfo, TrayGame, TrayState, Game, LaunchEvent, PersistedState, Session, SteamHit, StoreId } from './types';

export interface WindowApi {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Sort de la réduction et ramène la fenêtre au premier plan. */
  restore(): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  onFocusChange(cb: (focused: boolean) => void): Promise<() => void>;
}

export interface Api {
  isTauri: boolean;
  scanGames(localFolders: string[]): Promise<Game[]>;
  loadState(): Promise<unknown>;
  saveState(state: PersistedState): Promise<void>;
  loadLibrary(): Promise<Game[]>;
  saveLibrary(games: Game[]): Promise<void>;
  launchGame(gameId: string): Promise<void>;
  /** Ouvre l'installation d'un jeu non installé dans son launcher. */
  /** Installe le jeu (Steam : en arrière-plan) ; renvoie le message à afficher. */
  installGame(gameId: string): Promise<string>;
  /** Progression (0 à 1) d'un téléchargement Steam en cours, null une fois fini. */
  installProgress(gameId: string): Promise<number | null>;
  stopGame(gameId: string): Promise<void>;
  /** Réaffiche les fenêtres de launcher cachées par Hangar ; faux s'il n'y en avait aucune. */
  showLaunchers(): Promise<boolean>;
  /** Ouvre la désinstallation d'un jeu dans son launcher ; renvoie le message à afficher. */
  uninstallGame(gameId: string): Promise<string>;
  /** Ouvre les mises à jour d'un jeu dans son launcher ; renvoie le message à afficher. */
  updateGame(gameId: string): Promise<string>;
  /** Fermeture dans la zone de notification et raccourci global. */
  setDesktop(closeToTray: boolean, globalShortcut: boolean): Promise<DesktopInfo>;
  /** Jeux récents du menu de l'icône et apparence de l'app (thème, accent). */
  setTrayRecents(games: TrayGame[], theme: string, accent: string): Promise<void>;
  /** Fenêtre du menu de l'icône : son contenu. */
  trayState(): Promise<TrayState>;
  /** Fenêtre du menu de l'icône : `show`, `quit`, `hide` ou `game:<id>`. */
  trayAction(action: string): Promise<void>;
  /** La fenêtre principale a été cachée (fermeture, raccourci) : le mode manette se ferme. */
  onMainHidden(cb: () => void): Promise<() => void>;
  /** Discord : jeu en cours (début en ms) ou null pour effacer. */
  setPresence(gameId: string | null, start: number): Promise<void>;
  /** Un jeu a été choisi dans le menu de l'icône. */
  onTrayLaunch(cb: (gameId: string) => void): Promise<() => void>;
  openFolder(path: string): Promise<void>;
  resolveSteamId(name: string): Promise<number | null>;
  searchSteam(query: string): Promise<SteamHit[]>;
  /** Jaquette et bannière d'un jeu, toutes sources confondues (store, Steam, SteamGridDB). */
  findArtwork(gameId: string, steamGridKey: string | null, refresh: boolean): Promise<Artwork>;
  /** Source affichable d'une image distante (en cache disque côté Tauri), ou null si introuvable. */
  image(url: string): Promise<string | null>;
  /** Icône 256 px d'un exécutable (ou d'un logo Xbox), source affichable ou null. */
  exeIcon(path: string): Promise<string | null>;
  folderSize(path: string): Promise<number | null>;
  /** Genre en français (Steam), en cache côté backend. */
  gameInfo(gameId: string): Promise<{ genre: string | null }>;
  setAutostart(on: boolean): Promise<void>;
  /** Copie une image locale dans le dossier des jaquettes et renvoie son chemin. */
  importCover(gameId: string, path: string): Promise<string>;
  /** Chemin local vers URL affichable. */
  localSrc(path: string): string;
  pickExe(): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  pickImage(): Promise<string | null>;
  onLaunch(cb: (e: LaunchEvent) => void): Promise<() => void>;
  onScanPartial(cb: (games: Game[]) => void): Promise<() => void>;
  accountsStatus(): Promise<AccountStatus[]>;
  /** Clé d'API Web Steam de l'utilisateur ; renvoie le nombre de jeux trouvés. */
  connectSteam(key: string): Promise<number>;
  /** Connexion GOG / Epic dans une fenêtre officielle ; renvoie le nombre de jeux trouvés. */
  connectAccount(store: StoreId): Promise<number>;
  disconnectAccount(store: StoreId): Promise<void>;
  /** Page d'aide connue (liste fermée côté backend). */
  openLink(link: 'steam-api-key'): Promise<void>;
  /** Ouvre un jeu du catalogue web-games.json dans sa propre fenêtre Hangar. */
  openWebGame(id: string): Promise<void>;
  /** Fenêtre d'un jeu web fermée (identifiant du catalogue). */
  onWebClosed(cb: (id: string) => void): Promise<() => void>;
  /** Les comptes ont été synchronisés : rescanner. */
  onAccountsSynced(cb: () => void): Promise<() => void>;
  appVersion(): Promise<string>;
  /** Nouvelle version publiée sur GitHub, ou null si Hangar est à jour. */
  checkUpdate(): Promise<{ version: string } | null>;
  /** Télécharge et installe la version trouvée par checkUpdate, puis redémarre Hangar. */
  installUpdate(onProgress: (ratio: number | null) => void): Promise<void>;
  win: WindowApi;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function tauriApi(): Promise<Api> {
  const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const dialog = await import('@tauri-apps/plugin-dialog');
  const updater = await import('@tauri-apps/plugin-updater');
  const { relaunch } = await import('@tauri-apps/plugin-process');
  const { getIdentifier, getVersion } = await import('@tauri-apps/api/app');
  let pending: Awaited<ReturnType<typeof updater.check>> = null;
  const w = getCurrentWindow();

  const pick = async (opts: Parameters<typeof dialog.open>[0]) => {
    const r = await dialog.open({ multiple: false, ...opts });
    return typeof r === 'string' ? r : null;
  };

  const on = <T>(name: string, cb: (p: T) => void) => listen<T>(name, (e) => cb(e.payload));

  return {
    isTauri: true,
    scanGames: (localFolders) => invoke('scan_games', { localFolders }),
    loadState: () => invoke('load_state'),
    saveState: (state) => invoke('save_state', { state }),
    loadLibrary: () => invoke('load_library'),
    saveLibrary: (games) => invoke('save_library', { games }),
    launchGame: (gameId) => invoke('launch_game', { gameId }),
    installGame: (gameId) => invoke('install_game', { gameId }),
    installProgress: (gameId) => invoke('install_progress', { gameId }),
    stopGame: (gameId) => invoke('stop_game', { gameId }),
    showLaunchers: () => invoke('show_launchers'),
    uninstallGame: (gameId) => invoke('uninstall_game', { gameId }),
    updateGame: (gameId) => invoke('update_game', { gameId }),
    setDesktop: (closeToTray, globalShortcut) => invoke('set_desktop', { closeToTray, globalShortcut }),
    setTrayRecents: (games, theme, accent) => invoke('set_tray_recents', { games, theme, accent }),
    trayState: () => invoke('tray_state'),
    trayAction: (action) => invoke('tray_action', { action }),
    onMainHidden: (cb) => on<null>('main://hidden', () => cb()),
    setPresence: (gameId, start) => invoke('set_presence', { gameId, start: Math.max(0, Math.round(start)) }),
    onTrayLaunch: (cb) => on<string>('tray://launch', cb),
    openFolder: (path) => invoke('open_folder', { path }),
    resolveSteamId: (name) => invoke('resolve_steam_id', { name }),
    searchSteam: (query) => invoke('search_steam', { query }),
    findArtwork: async (gameId, steamGridKey, refresh) => {
      type Img = { path: string; landscape: boolean } | null;
      const a = await invoke<{ cover: Img; hero: Img; source: string }>('find_artwork', {
        gameId,
        steamGridKey,
        refresh
      });
      return {
        cover: a.cover ? { src: convertFileSrc(a.cover.path), landscape: a.cover.landscape } : null,
        hero: a.hero ? convertFileSrc(a.hero.path) : null,
        source: a.source
      };
    },
    image: async (url) => {
      const p = await invoke<string | null>('image', { url });
      return p ? convertFileSrc(p) : null;
    },
    exeIcon: async (path) => {
      const p = await invoke<string | null>('exe_icon', { path });
      return p ? convertFileSrc(p) : null;
    },
    folderSize: (path) => invoke('folder_size', { path }),
    gameInfo: (gameId) => invoke('game_info', { gameId }),
    setAutostart: (on) => invoke('set_autostart', { on }),
    importCover: (gameId, path) => invoke('import_cover', { gameId, path }),
    localSrc: (path) => convertFileSrc(path),
    pickExe: () =>
      pick({
        title: 'Choisir le jeu',
        filters: [{ name: 'Jeux et raccourcis', extensions: ['exe', 'lnk', 'url', 'bat', 'app'] }]
      }),
    pickFolder: () => pick({ title: 'Choisir un dossier de jeux', directory: true }),
    pickImage: () =>
      pick({ title: 'Choisir une image', filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] }),
    onLaunch: async (cb) => {
      const offs = await Promise.all([
        on<{ gameId: string }>('launch://started', (p) => cb({ type: 'started', ...p })),
        on<{ gameId: string; pid: number }>('launch://running', (p) => cb({ type: 'running', ...p })),
        on<{ gameId: string; session: Session | null }>('launch://ended', (p) => cb({ type: 'ended', ...p })),
        on<{ gameId: string; message: string }>('launch://failed', (p) => cb({ type: 'failed', ...p }))
      ]);
      return () => offs.forEach((o) => o());
    },
    onScanPartial: (cb) => on<Game[]>('scan://partial', cb),
    accountsStatus: () => invoke('accounts_status'),
    connectSteam: (key) => invoke('connect_steam', { key }),
    connectAccount: (store) => invoke('connect_account', { store }),
    disconnectAccount: (store) => invoke('disconnect_account', { store }),
    openLink: (link) => invoke('open_link', { link }),
    openWebGame: (id) => invoke('open_web_game', { id }),
    onWebClosed: (cb) => on<string>('web://closed', cb),
    onAccountsSynced: (cb) => on<null>('accounts://synced', () => cb()),
    appVersion: () => getVersion(),
    checkUpdate: async () => {
      if ((await getIdentifier()).endsWith('.test')) throw new Error("Mises à jour désactivées dans l'environnement de test.");
      pending = await updater.check();
      return pending ? { version: pending.version } : null;
    },
    installUpdate: async (onProgress) => {
      if (!pending) throw new Error('Aucune mise à jour à installer.');
      let total = 0;
      let done = 0;
      await pending.downloadAndInstall((e) => {
        if (e.event === 'Started') total = e.data.contentLength ?? 0;
        else if (e.event === 'Progress') {
          done += e.data.chunkLength;
          onProgress(total ? done / total : null);
        }
      });
      // Sous Windows l'installeur ferme déjà Hangar ; sous macOS il faut relancer.
      await relaunch();
    },
    win: {
      minimize: () => w.minimize(),
      toggleMaximize: () => w.toggleMaximize(),
      close: () => w.close(),
      isMaximized: () => w.isMaximized(),
      restore: async () => {
        await w.unminimize();
        await w.show();
        await w.setFocus();
      },
      setFullscreen: (on) => w.setFullscreen(on),
      onFocusChange: (cb) => w.onFocusChanged((e) => cb(e.payload))
    }
  };
}

export let api: Api;

/** À appeler une fois au démarrage, avant tout accès à `api`. */
export async function initApi(): Promise<Api> {
  if (isTauri()) {
    api = await tauriApi();
  } else {
    const { mockApi } = await import('./mock');
    api = mockApi();
  }
  return api;
}
