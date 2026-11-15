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
  | 'rockstar'
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
  /** Non installé et jouable sous Linux (version native, ou Vérifié / Jouable sur Steam Deck). */
  linux?: boolean;
  /** Studio, éditeur, date de sortie (ms) et succès, quand un compte les donne (Xbox). */
  developer?: string;
  publisher?: string;
  released?: number;
  achievements?: Achievements;
  /** Mise à jour en attente ou en cours dans le launcher (Steam). */
  updatePending?: boolean;
  /** Reste à télécharger pour cette mise à jour, en octets. */
  updateBytes?: number | null;
  /** Page où retrouver le jeu, trouvée au scan (jeux hors store, `https://` seulement). */
  installUrl?: string;
  /** Jeu local ou manuel du compte Hangar, introuvable sur ce PC (carte en gris « Sur un autre PC »).
   * Créé par le frontend seulement, jamais envoyé au backend. */
  elsewhere?: boolean;
}

/**
 * Fiche portable d'un jeu local ou manuel : de quoi le reconnaître sur un autre poste, où son
 * identifiant (un chemin) n'est pas le même.
 */
export interface PortableGame {
  name: string;
  /** Signature : nom de l'exécutable et nom du dossier du jeu, en minuscules. */
  exe: string;
  dir: string;
  steamAppId?: number;
  installUrl?: string;
}

export interface Session {
  gameId: string;
  start: number;
  end: number;
  /** Session d'un autre poste du compte Hangar (absent : ce poste). */
  deviceId?: string;
  /** Identifiant sur le compte (sessions des autres postes). */
  id?: string;
  /** Partie terminée (plus de point d'étape à venir). */
  done?: boolean;
  /** Déjà envoyée au compte. */
  sent?: boolean;
}

/** Temps de jeu d'un jeu sur un autre poste du compte Hangar. */
export interface DeviceTime {
  playMs: number;
  launches: number;
  lastPlayed: number;
  /** Ce temps comprend celui que le store compte déjà sur tous les postes (Steam, GOG Galaxy). */
  store: boolean;
  /** Date de la valeur sur le compte. */
  at: number;
}

export interface Totals {
  playMs: number;
  launches: number;
  lastPlayed: number;
  /**
   * Temps mesuré par Hangar seul (parties lancées depuis Hangar sur ce poste), sans les heures du
   * store. Absent : pas encore suivi, estimé (voir `measuredMs`).
   */
  hangarMs?: number;
}

export type SortKey = 'recent' | 'az' | 'hours';

/** Onglet où Hangar s'ouvre. */
export type StartPage = 'home' | 'library' | 'favorites' | 'web' | `collection:${string}`;

export interface Prefs {
  minimizeOnLaunch: boolean;
  startWithWindows: boolean;
  autoCovers: boolean;
  /** Jeux possédés dans les launchers mais pas installés, affichés dans la bibliothèque. */
  showUninstalled: boolean;
  /** Une clé API SteamGridDB (facultative, pour les jeux absents de Steam) est enregistrée
   * dans le coffre du système. La clé elle-même ne passe jamais par le frontend. */
  steamGridDb: boolean;
  /** Onglet Jeux web. null : pas encore demandé (première ouverture ou mise à jour). */
  webGames: boolean | null;
  /** Fermer la fenêtre : demander (par défaut), la cacher dans la zone de notification, ou quitter. */
  closeAction: CloseAction;
  /** Raccourci global (Ctrl+Alt+H) pour afficher ou cacher Hangar. */
  globalShortcut: boolean;
  /** « Joue à ... » sur Discord pendant une partie (désactivé par défaut : visible des amis). */
  discordPresence: boolean;
  /** Mode manette : Start et le bouton central (Xbox, PS, Home) l'ouvrent, même depuis une autre app (désactivé par défaut). */
  padButton: boolean;
  /** Démarrage avec le système en mode manette (plein écran) plutôt que réduit. Active aussi `startWithWindows`. */
  padAtLogin: boolean;
  /** Onglet ouvert au démarrage. null : pas encore demandé (première ouverture ou mise à jour). */
  startPage: StartPage | null;
}

/** Ce que fait la fermeture de la fenêtre principale. */
export type CloseAction = 'ask' | 'tray' | 'quit';

/** Liste de jeux faite par l'utilisateur (« Avec les potes », « À finir »...). */
export interface Collection {
  id: string;
  name: string;
  games: string[];
}

/** Jeu récent du menu de l'icône (jaquette : image locale en cache). */
export interface TrayGame {
  id: string;
  name: string;
  cover?: string | null;
}

/** Contenu du menu de l'icône. */
export interface TrayState {
  games: TrayGame[];
  theme: string;
  accent: string;
}

/** Dossier proposé pour installer un jeu (bibliothèque du launcher). */
export interface InstallTarget {
  /** Identifiant renvoyé tel quel au backend. */
  path: string;
  /** Dossier affiché. */
  label: string;
  /** Place libre sur le disque en octets, 0 si inconnue. */
  free: number;
}

/** Ce que le backend sait faire sur ce bureau. */
export interface DesktopInfo {
  presenceAvailable: boolean;
  /** Libellé du raccourci global (« Ctrl+Alt+H »). */
  shortcut: string;
  /** Faux si un autre programme utilise déjà ce raccourci. */
  shortcutOk: boolean;
}

/** « system » suit le réglage clair / sombre de l'appareil. */
export type Theme = 'dark' | 'light' | 'system';

/**
 * État enregistré sur le poste. Ce qui pourra suivre un compte Hangar (favoris, renommages,
 * collections, apparence...) est défini dans `util/sync.ts` ; le reste est propre à ce poste.
 */
export interface PersistedState {
  version: 2;
  /** Identifiant aléatoire de cette installation (rien qui vienne de la machine). */
  deviceId: string;
  /** Élément synchronisable (clé de `syncEntries`) -> dernière modification, ms epoch.
   * Une clé sans élément correspondant est une suppression. */
  stamps: Record<string, number>;
  /** Jeu local ou manuel (gameId) -> fiche portable, gardée même si le jeu n'est plus trouvé. */
  portable: Record<string, PortableGame>;
  /** gameId -> lien d'installation choisi par l'utilisateur ("" : aucun lien voulu). */
  installLinks: Record<string, string>;
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
  collections: Collection[];
  disabledStores: StoreId[];
  accent: string;
  theme: Theme;
  sort: SortKey;
  /** Assistant de configuration vu (installation neuve, ou une fois après la mise à jour qui l'ajoute). */
  onboarded: boolean;
  /** Version de Hangar dont les notes ont été vues (null : inconnue, avant la 1.2.24). */
  lastVersion: string | null;
  prefs: Prefs;
  /** Synchro avec le compte Hangar (propre à ce poste, jamais synchronisé). */
  cloud: CloudSync;
}

/** État de la synchro sur ce poste (docs/COMPTE.md, section 6). */
export interface CloudSync {
  /** Curseur du serveur : changements déjà récupérés. */
  cursor: number;
  /** Éléments modifiés ici et pas encore envoyés (file hors ligne). */
  dirty: string[];
  /** Première synchro faite avec le compte connecté (sinon : fusion à proposer). */
  merged: boolean;
  /** Jeux « Sur un autre PC » masqués sur ce poste seulement. */
  hiddenHere: string[];
  /** Jeu ajouté ici à la place d'un jeu du compte (« J'ai déjà ce jeu ») -> signature de ce jeu. */
  aliases: Record<string, { exe: string; dir: string }>;
  /** Temps de jeu des autres postes : deviceId -> identifiant portable du jeu -> temps. */
  times: Record<string, Record<string, DeviceTime>>;
  /** Temps de jeu de ce poste déjà envoyés (clé « time:... » -> valeur envoyée). */
  timeSent: Record<string, string>;
  /** Curseur du serveur pour les sessions de jeu. */
  sessionCursor: number;
}

/** Un élément synchronisé, tel que l'API le donne et le reçoit (value null : supprimé). */
export interface CloudChange {
  key: string;
  value: string | null;
  updatedAt: number;
  deviceId?: string;
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
  /** Ce que le compte apporte au dernier scan : jeux que seul le compte montre, temps de jeu
   *  venu du compte, mises à jour trouvées grâce à lui (Epic). */
  added: number;
  playTime: number;
  updates: number;
}

/** Une session de jeu telle que l'API la donne et la reçoit (gameId : identifiant portable). */
export interface CloudSession {
  id: string;
  gameId: string;
  start: number;
  end: number;
  /** Poste qui l'a enregistrée (donné par le serveur). */
  deviceId?: string;
}

/** Poste relié au compte Hangar. */
export interface CloudDevice {
  id: string;
  name: string;
  createdAt: number;
  lastSeen: number;
  /** Faux : poste déconnecté (ses données restent sur le compte). */
  connected: boolean;
  /** Ce poste-ci. */
  current: boolean;
}

/** Compte Hangar (facultatif). Le jeton reste dans le coffre du système, jamais ici. */
export interface CloudStatus {
  connected: boolean;
  /** Connecté, mais le serveur ne répond pas : dernier état connu. */
  offline: boolean;
  /** Le poste vient d'être déconnecté à distance. */
  revoked: boolean;
  user: CloudUser | null;
  devices: CloudDevice[];
}

/** Profil du compte Hangar. */
export interface CloudUser {
  id: string;
  /** Pseudo (vide : le début de l'adresse e-mail est affiché). */
  name: string;
  email: string;
  /** Avatar en `data:`, ou null : initiale sur fond d'accent. */
  avatar: string | null;
  /** Profil visible de tous (page publique sur le serveur du compte). */
  public: boolean;
}

/** Succès Steam d'un jeu (compte Steam connecté). */
export interface Achievements {
  unlocked: number;
  /** 0 : nombre total inconnu (certains jeux Xbox) ; le Gamerscore donne alors la progression. */
  total: number;
  gamerscore?: number;
  gamerscoreTotal?: number;
}

export interface SteamHit {
  id: number;
  name: string;
}

/** Boîte de Steam Cloud qui attend une réponse avant de lancer le jeu, posée dans Hangar. */
export interface LauncherPrompt {
  kind: 'syncFailed' | 'pending' | 'conflict';
  /** Fenêtre de Steam (cachée) à qui renvoyer la réponse. */
  hwnd: number;
}

export type LaunchEvent =
  | { type: 'started'; gameId: string }
  | { type: 'running'; gameId: string; pid: number }
  | { type: 'session'; gameId: string; session: Session }
  | { type: 'ended'; gameId: string; session: Session | null }
  | { type: 'failed'; gameId: string; message: string };
