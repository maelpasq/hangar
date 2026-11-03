// Modèle de données partagé avec le backend Rust (structs en camelCase).

export type StoreId =
  | 'steam'
  | 'epic'
  | 'gog'
  | 'ubisoft'
  | 'ea'
  | 'battlenet'
  | 'xbox'
  | 'riot'
  | 'local'
  | 'manual';

export interface Launch {
  kind: 'uri' | 'exe';
  target: string;
  args: string;
  cwd?: string | null;
}

export interface Game {
  id: string;
  name: string;
  store: StoreId;
  installDir?: string | null;
  launch: Launch;
  launcherName: string;
  steamAppId?: number | null;
  exePath?: string | null;
  /** Image locale fournie par le store (logo Xbox), utilisée pour la jaquette générée. */
  logo?: string | null;
  processNames: string[];
  genre?: string | null;
}

export interface Session {
  gameId: string;
  start: number;
  end: number;
}

export interface Totals {
  playMs: number;
  launches: number;
  lastPlayed: number;
}

export type SortKey = 'recent' | 'az' | 'hours';

export interface Prefs {
  minimizeOnLaunch: boolean;
  startWithWindows: boolean;
  autoCovers: boolean;
}

export interface PersistedState {
  version: 1;
  favorites: string[];
  hidden: string[];
  renames: Record<string, string>;
  /** gameId -> chemin local, "steam:<id>" ou "none" */
  customCovers: Record<string, string>;
  /** gameId -> appid Steam (0 = introuvable) */
  steamIdCache: Record<string, number>;
  firstSeen: Record<string, number>;
  totals: Record<string, Totals>;
  sessions: Session[];
  localFolders: string[];
  manualGames: Game[];
  disabledStores: StoreId[];
  accent: string;
  sort: SortKey;
  prefs: Prefs;
}

export interface SteamHit {
  id: number;
  name: string;
}

export type LaunchEvent =
  | { type: 'started'; gameId: string }
  | { type: 'running'; gameId: string; pid: number }
  | { type: 'ended'; gameId: string; session: Session | null }
  | { type: 'failed'; gameId: string; message: string };
