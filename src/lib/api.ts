// Seul point d'appel aux commandes Tauri. En dehors de Tauri (npm run dev:web),
// l'implémentation de démo de mock.ts est utilisée.

import type { Game, LaunchEvent, PersistedState, Session, SteamHit } from './types';

export interface WindowApi {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Sort de la réduction et ramène la fenêtre au premier plan. */
  restore(): Promise<void>;
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
  stopGame(gameId: string): Promise<void>;
  openFolder(path: string): Promise<void>;
  resolveSteamId(name: string): Promise<number | null>;
  searchSteam(query: string): Promise<SteamHit[]>;
  /** Source affichable d'une image distante (en cache disque côté Tauri), ou null si introuvable. */
  image(url: string): Promise<string | null>;
  /** Icône 256 px d'un exécutable (ou d'un logo Xbox), source affichable ou null. */
  exeIcon(path: string): Promise<string | null>;
  folderSize(path: string): Promise<number | null>;
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
    stopGame: (gameId) => invoke('stop_game', { gameId }),
    openFolder: (path) => invoke('open_folder', { path }),
    resolveSteamId: (name) => invoke('resolve_steam_id', { name }),
    searchSteam: (query) => invoke('search_steam', { query }),
    image: async (url) => {
      const p = await invoke<string | null>('image', { url });
      return p ? convertFileSrc(p) : null;
    },
    exeIcon: async (path) => {
      const p = await invoke<string | null>('exe_icon', { path });
      return p ? convertFileSrc(p) : null;
    },
    folderSize: (path) => invoke('folder_size', { path }),
    setAutostart: (on) => invoke('set_autostart', { on }),
    importCover: (gameId, path) => invoke('import_cover', { gameId, path }),
    localSrc: (path) => convertFileSrc(path),
    pickExe: () =>
      pick({
        title: 'Choisir le jeu',
        filters: [{ name: 'Jeux et raccourcis', extensions: ['exe', 'lnk', 'url', 'bat'] }]
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
