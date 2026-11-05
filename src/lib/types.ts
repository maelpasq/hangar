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
  /** Temps de jeu connu du store (Steam, GOG Galaxy), en ms. */
  storePlayMs?: number | null;
  /** Dernière session connue du store, ms epoch. */
  storeLastPlayed?: number | null;
  /** Taille sur disque donnée par le store, en octets. */
  sizeBytes?: number | null;
  /** Date d'installation, ms epoch. */
  installedAt?: number | null;
  /** Possédé mais pas installé : `launch` ouvre son installation dans le launcher. */
  notInstalled?: boolean;
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
  /** Jeux possédés dans les launchers mais pas installés, affichés dans la bibliothèque. */
  showUninstalled: boolean;
  /** Clé API SteamGridDB (facultative) pour les jeux absents de Steam. */
  steamGridDbKey: string;
  /** Onglet Jeux web. null : pas encore demandé (première ouverture ou mise à jour). */
  webGames: boolean | null;
}

/** « system » suit le réglage clair / sombre de l'appareil. */
export type Theme = 'dark' | 'light' | 'system';

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
  /** id du jeu web (web-games.json) -> dernier lancement */
  webPlayed: Record<string, number>;
  totals: Record<string, Totals>;
  sessions: Session[];
  localFolders: string[];
  manualGames: Game[];
  disabledStores: StoreId[];
  accent: string;
  theme: Theme;
  sort: SortKey;
  prefs: Prefs;
}

/** Images trouvées automatiquement par le backend (sources multiples). */
export interface Artwork {
  cover: { src: string; landscape: boolean } | null;
  hero: string | null;
  source: string;
}

/** État d'un launcher : détecté sur l'appareil, compte connecté (jamais de jeton côté frontend). */
export interface AccountStatus {
  store: StoreId;
  detected: boolean;
  connectable: boolean;
  connected: boolean;
  user?: string | null;
  games: number;
  syncedAt?: number | null;
  error?: string | null;
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
