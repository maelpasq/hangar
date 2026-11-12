// Seul point d'appel aux commandes Tauri. En dehors de Tauri (npm run dev:web),
// l'implémentation de démo de mock.ts est utilisée.

import type { AccountStatus, Artwork, DesktopInfo, InstallTarget, TrayGame, TrayState, Game, LaunchEvent, McAccount, McPack, McProgress, McVersion, PersistedState, Session, SteamHit, StoreId } from './types';

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
  /** Dossiers du launcher où installer le jeu, celui par défaut en tête ; vide si le launcher choisit. */
  installTargets(gameId: string): Promise<InstallTarget[]>;
  /** Installe le jeu dans `dir` (l'un de `installTargets`) ; renvoie le message à afficher. */
  installGame(gameId: string, dir?: string | null): Promise<string>;
  /** [progression de 0 à 1, en pause] d'un téléchargement Steam en cours, null une fois fini. */
  installProgress(gameId: string): Promise<[number, boolean] | null>;
  /** Jeux Steam en cours de téléchargement (ids Hangar). */
  steamDownloads(): Promise<string[]>;
  /** Affiche la page des téléchargements de Steam. */
  showSteamDownloads(): Promise<void>;
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
  findArtwork(gameId: string, refresh: boolean): Promise<Artwork>;
  /** Clé API SteamGridDB, rangée dans le coffre du système (vide : la retire). */
  setSteamGridKey(key: string): Promise<void>;
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
  openLink(link: 'steam-api-key' | 'microsoft-link'): Promise<void>;
  /** Envoie un signalement de bug au développeur (capture : chemin d'une image, facultatif). */
  reportBug(title: string, description: string, screenshot: string | null): Promise<void>;
  /** Ouvre un jeu du catalogue web-games.json dans sa propre fenêtre Hangar. */
  openWebGame(id: string): Promise<void>;
  /** Fenêtre d'un jeu web fermée (identifiant du catalogue). */
  onWebClosed(cb: (id: string) => void): Promise<() => void>;
  /** Hangar MC : versions officielles de Minecraft (Fabric ou Legacy Fabric), la plus récente d'abord. */
  mcVersions(): Promise<McVersion[]>;
  /** Fichiers de Hangar MC (le mod), pas inclus dans l'installeur. */
  mcPack(): Promise<McPack>;
  /** Les télécharge ; l'avancement arrive par onMcProgress (version `hangarmc`). */
  mcPackInstall(): Promise<void>;
  /** Télécharge Minecraft, Java, Fabric et les mods de Hangar MC pour cette version. */
  mcInstall(id: string): Promise<void>;
  mcLaunch(id: string): Promise<void>;
  onMcProgress(cb: (p: McProgress) => void): Promise<() => void>;
  mcAccount(): Promise<McAccount>;
  /** Code à saisir sur microsoft.com/link. */
  mcLoginStart(): Promise<{ userCode: string; url: string }>;
  /** Attend la saisie du code ; renvoie le pseudo Minecraft. */
  mcLoginFinish(): Promise<string>;
  /** Retire un compte. */
  mcLogout(uuid: string): Promise<void>;
  /** Choisit le compte qui joue. */
  mcSelect(uuid: string): Promise<void>;
  /** Abandonne la connexion en cours. */
  mcLoginCancel(): Promise<void>;
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
  const updater = await import('@tauri-apps/plugin-updater');
  const { relaunch } = await import('@tauri-apps/plugin-process');
  const { getIdentifier, getVersion } = await import('@tauri-apps/api/app');
  let pending: Awaited<ReturnType<typeof updater.check>> = null;
  const w = getCurrentWindow();

  const on = <T>(name: string, cb: (p: T) => void) => listen<T>(name, (e) => cb(e.payload));

  return {
    isTauri: true,
    scanGames: (localFolders) => invoke('scan_games', { localFolders }),
    loadState: () => invoke('load_state'),
    saveState: (state) => invoke('save_state', { state }),
    loadLibrary: () => invoke('load_library'),
    saveLibrary: (games) => invoke('save_library', { games }),
    launchGame: (gameId) => invoke('launch_game', { gameId }),
    installTargets: (gameId) => invoke('install_targets', { gameId }),
    installGame: (gameId, dir) => invoke('install_game', { gameId, dir: dir ?? null }),
    installProgress: (gameId) => invoke('install_progress', { gameId }),
    steamDownloads: () => invoke('steam_downloads'),
    showSteamDownloads: () => invoke('show_steam_downloads'),
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
    setSteamGridKey: (key) => invoke('set_steamgriddb_key', { key }),
    findArtwork: async (gameId, refresh) => {
      type Img = { path: string; landscape: boolean } | null;
      const a = await invoke<{ cover: Img; hero: Img; source: string }>('find_artwork', {
        gameId,
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
    // Boîtes de choix ouvertes par le backend : lui seul sait quels fichiers l'utilisateur a
    // choisis (un jeu ajouté à la main ne peut lancer que l'un d'eux).
    pickExe: () => invoke<string | null>('pick_exe'),
    pickFolder: () => invoke<string | null>('pick_folder'),
    pickImage: () => invoke<string | null>('pick_image'),
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
    reportBug: (title, description, screenshot) => invoke('report_bug', { title, description, screenshot }),
    openWebGame: (id) => invoke('open_web_game', { id }),
    onWebClosed: (cb) => on<string>('web://closed', cb),
    mcVersions: () => invoke('mc_versions'),
    mcPack: () => invoke('mc_pack'),
    mcPackInstall: () => invoke('mc_pack_install'),
    mcInstall: (id) => invoke('mc_install', { id }),
    mcLaunch: (id) => invoke('mc_launch', { id }),
    onMcProgress: (cb) => on<McProgress>('mc://progress', cb),
    mcAccount: () => invoke('mc_account'),
    mcLoginStart: () => invoke('mc_login_start'),
    mcLoginFinish: () => invoke('mc_login_finish'),
    mcLogout: (uuid) => invoke('mc_logout', { uuid }),
    mcSelect: (uuid) => invoke('mc_select', { uuid }),
    mcLoginCancel: () => invoke('mc_login_cancel'),
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
