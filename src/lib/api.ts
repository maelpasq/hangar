// Seul point d'appel aux commandes Tauri. En dehors de Tauri (npm run dev:web),
// l'implémentation de démo de mock.ts est utilisée.

import type { CloudChange, CloudSession, CloudStatus, SocialEvent } from './types';
import { displayVersion } from './util/release-notes';
import type { AccountStatus, Achievements, Artwork, CloseAction, DesktopInfo, InstallTarget, TrayGame, TrayState, Game, LaunchEvent, LauncherPrompt, PersistedState, Session, SteamHit, StoreId } from './types';

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
  /** `force` (bouton Actualiser) : resynchronise aussi les comptes et les versions GOG. */
  scanGames(localFolders: string[], force?: boolean): Promise<Game[]>;
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
  /** Ramène la fenêtre d'un jeu en cours au premier plan ; faux si elle est introuvable. */
  focusGame(gameId: string): Promise<boolean>;
  /** Réaffiche les fenêtres de launcher cachées par Hangar ; faux s'il n'y en avait aucune. */
  showLaunchers(): Promise<boolean>;
  /** Ouvre la désinstallation d'un jeu dans son launcher ; renvoie le message à afficher. */
  uninstallGame(gameId: string): Promise<string>;
  /** Ouvre les mises à jour d'un jeu dans son launcher ; renvoie le message à afficher. */
  updateGame(gameId: string): Promise<string>;
  /** Fermeture de la fenêtre (demander, zone de notification, quitter) et raccourci global. */
  setDesktop(closeAction: CloseAction, globalShortcut: boolean, padButton: boolean): Promise<DesktopInfo>;
  /** Mode manette fermé : Hangar retourne là où il était si le bouton Xbox l'avait ramené (`restore`). */
  padBack(restore: boolean): Promise<void>;
  /** La Game Bar de Windows s'ouvre avec le bouton Xbox (faux hors Windows). */
  gameBarOnButton(): Promise<boolean>;
  /** Jeux récents du menu de l'icône et apparence de l'app (thème, accent). */
  setTrayRecents(games: TrayGame[], theme: string, accent: string): Promise<void>;
  /** Fenêtre du menu de l'icône : son contenu. */
  trayState(): Promise<TrayState>;
  /** Fenêtre du menu de l'icône : `show`, `quit`, `hide` ou `game:<id>`. */
  trayAction(action: string): Promise<void>;
  /** La fenêtre principale a été cachée (fermeture, raccourci) : le mode manette se ferme. */
  onMainHidden(cb: () => void): Promise<() => void>;
  /** Fenêtre fermée alors que le réglage est « Demander » : Hangar pose la question. */
  onCloseAsk(cb: () => void): Promise<() => void>;
  /** Réponse à la question : quitter Hangar, ou cacher la fenêtre (arrière-plan). */
  closeMain(quit: boolean): Promise<void>;
  /** Discord : jeu en cours (début en ms) ou null pour effacer. */
  setPresence(gameId: string | null, start: number): Promise<void>;
  /** Un jeu a été choisi dans le menu de l'icône. */
  onTrayLaunch(cb: (gameId: string) => void): Promise<() => void>;
  /** Bouton Xbox pressé alors qu'une autre app était devant : Hangar vient d'être ramené. */
  /** Bouton Xbox depuis une autre app : 'open' (Hangar ramené devant) ou 'close' (mode manette sans le focus). */
  onPadGuide(cb: (what: 'open' | 'close') => void): Promise<() => void>;
  openFolder(path: string): Promise<void>;
  resolveSteamId(name: string): Promise<number | null>;
  /** Site officiel d'un jeu d'après sa fiche Steam (null : aucun). */
  officialSite(appId: number): Promise<string | null>;
  /** Site officiel d'un jeu d'après Wikidata, cherché par son nom exact (null : aucun). */
  wikidataSite(name: string): Promise<string | null>;
  searchSteam(query: string): Promise<SteamHit[]>;
  /** Jaquette et bannière d'un jeu, toutes sources confondues (store, Steam, SteamGridDB). */
  findArtwork(gameId: string, refresh: boolean): Promise<Artwork>;
  /** Jaquette d'un jeu vu chez un autre compte et absent d'ici (ID portable + nom). */
  findSocialArtwork(id: string, name: string): Promise<Artwork>;
  /** Clé API SteamGridDB, rangée dans le coffre du système (vide : la retire). */
  setSteamGridKey(key: string): Promise<void>;
  /** Source affichable d'une image distante (en cache disque côté Tauri), ou null si introuvable. */
  image(url: string): Promise<string | null>;
  /** Icône 256 px d'un exécutable (ou d'un logo Xbox), source affichable ou null. */
  exeIcon(path: string): Promise<string | null>;
  /** `fresh` : recalculée sans le cache de 24 h. */
  folderSize(path: string, fresh?: boolean): Promise<number | null>;
  /** Genre en français (Steam), en cache côté backend. */
  gameInfo(gameId: string): Promise<{ genre: string | null }>;
  /** Succès Steam d'un jeu, seulement avec le compte Steam relié (null sinon). */
  steamAchievements(gameId: string, fresh?: boolean): Promise<Achievements | null>;
  setAutostart(on: boolean): Promise<void>;
  /** Lancé avec le système : remet la fenêtre devant et répond vrai (une fois par lancement). */
  padAtLogin(): Promise<boolean>;
  /** Copie une image locale dans le dossier des jaquettes et renvoie son chemin. */
  importCover(gameId: string, path: string): Promise<string>;
  /** Chemin local vers URL affichable. */
  localSrc(path: string): string;
  pickExe(): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  pickImage(): Promise<string | null>;
  onLaunch(cb: (e: LaunchEvent) => void): Promise<() => void>;
  /** Le launcher attend une réponse (Steam Cloud) : Hangar pose la question. */
  onLauncherPrompt(cb: (p: LauncherPrompt) => void): Promise<() => void>;
  /** `show` : montre la boîte du launcher au-dessus de Hangar ; sinon elle est annulée. */
  answerLauncherPrompt(hwnd: number, show: boolean): Promise<void>;
  onScanPartial(cb: (games: Game[]) => void): Promise<() => void>;
  accountsStatus(): Promise<AccountStatus[]>;
  /** Clé d'API Web Steam de l'utilisateur ; renvoie le nombre de jeux trouvés. */
  connectSteam(key: string): Promise<number>;
  /** Connexion GOG / Epic dans une fenêtre officielle ; Xbox : attend la saisie du code de
   *  `xboxLoginCode` sur microsoft.com/link. Renvoie le nombre de jeux trouvés. */
  connectAccount(store: StoreId): Promise<number>;
  /** Xbox : code à saisir sur microsoft.com/link. */
  xboxLoginCode(): Promise<{ userCode: string; url: string }>;
  /** Xbox : abandonne l'attente de la connexion. */
  xboxLoginCancel(): Promise<void>;
  disconnectAccount(store: StoreId): Promise<void>;
  /** Compte Hangar : état (demande au serveur si un jeton est rangé). */
  cloudStatus(): Promise<CloudStatus>;
  /** Connexion dans le navigateur, retour par 127.0.0.1 ; rend l'état une fois connecté. */
  cloudLogin(deviceId: string): Promise<CloudStatus>;
  cloudCancelLogin(): Promise<void>;
  /** Déconnecte ce poste ; les données restent sur le poste et sur le compte. */
  cloudLogout(): Promise<void>;
  cloudRenameDevice(id: string, name: string): Promise<CloudStatus>;
  /** Déconnecte un autre poste à distance. */
  cloudForgetDevice(id: string): Promise<CloudStatus>;
  /** Synchro : changements du compte depuis le curseur (une page). */
  cloudPull(since: number): Promise<{ cursor: number; more: boolean; changes: CloudChange[] }>;
  /** Synchro : envoi groupé (1000 changements au plus). */
  cloudPush(changes: CloudChange[]): Promise<void>;
  /** Sessions de jeu de tous les postes depuis le curseur (une page). */
  cloudPullSessions(since: number): Promise<{ cursor: number; more: boolean; sessions: CloudSession[] }>;
  /** Envoi des sessions finies de ce poste (1000 au plus ; ajout seulement). */
  cloudPushSessions(sessions: CloudSession[]): Promise<void>;
  /** Clé SteamGridDB du compte (chiffrée côté serveur) ; rend vrai si ce poste a une clé. */
  cloudSyncSteamGridDb(first: boolean): Promise<boolean>;
  /** Connexions des launchers partagées par le compte (connectées ou déconnectées ailleurs). */
  cloudSyncLaunchers(): Promise<void>;
  /** Profil : nouveau pseudo. */
  cloudSetProfile(name: string): Promise<CloudStatus>;
  /** Nouvel avatar : image déjà réduite (PNG, JPEG ou WebP, 512 Ko au plus). */
  cloudSetAvatar(bytes: Uint8Array): Promise<CloudStatus>;
  cloudRemoveAvatar(): Promise<CloudStatus>;
  /** Empreinte d'une jaquette en fichier local (null : elle reste sur ce poste). */
  cloudCoverHash(path: string): Promise<string | null>;
  /** Envoie une jaquette au compte (faux : refusée par le serveur). */
  cloudUploadCover(path: string, hash: string): Promise<boolean>;
  /** Télécharge une jaquette du compte : chemin local, ou null si elle n'y est plus. */
  cloudFetchCover(hash: string): Promise<string | null>;
  /** Exporte les données du compte dans un fichier choisi (null : annulé). */
  cloudExport(): Promise<string | null>;
  /** Supprime le compte et toutes ses données sur le serveur. */
  cloudDeleteAccount(): Promise<void>;
  /** Appel de l'API sociale du compte (chemin sous `/social/`). */
  social<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T>;
  /** Avatar ou bannière d'un compte, en `data:` (null : aucun). */
  socialImage(kind: 'avatar' | 'banner', userId: string): Promise<string | null>;
  /** Envoie la bannière du profil (déjà recadrée) : rend sa version. */
  socialBanner(bytes: Uint8Array): Promise<string>;
  /** Ouvre ou ferme la connexion temps réel des amis. */
  socialLive(on: boolean): Promise<void>;
  /** Notification du système (Hangar pas au premier plan). */
  socialNotify(title: string, body: string): Promise<void>;
  onSocialEvent(cb: (e: SocialEvent) => void): Promise<() => void>;
  /** La connexion temps réel s'ouvre (true) ou se coupe (false). */
  onSocialLive(cb: (on: boolean) => void): Promise<() => void>;
  /** Page d'aide connue (liste fermée côté backend). */
  openLink(link: 'steam-api-key' | 'microsoft-link' | 'steamgriddb-api' | 'gamebar-settings' | 'privacy'): Promise<void>;
  /** Ouvre le lien d'installation d'un jeu dans le navigateur (`https://` seulement). */
  openGameLink(url: string): Promise<void>;
  /** Ouvre la page d'un jeu vu chez un ami dans son launcher (Steam, GOG, Battle.net, Microsoft Store). */
  openStorePage(id: string): Promise<void>;
  /** Envoie un signalement de bug au développeur (capture : chemin d'une image, facultatif). */
  reportBug(title: string, description: string, screenshot: string | null): Promise<void>;
  /** Ouvre un jeu du catalogue web-games.json dans sa propre fenêtre Hangar. */
  openWebGame(id: string): Promise<void>;
  /** Fenêtre d'un jeu web fermée (identifiant du catalogue). */
  onWebClosed(cb: (id: string) => void): Promise<() => void>;
  /** Les comptes ont été synchronisés : rescanner. */
  onAccountsSynced(cb: () => void): Promise<() => void>;
  appVersion(): Promise<string>;
  /** Nouvelle version publiée sur GitHub (avec le texte de sa release), ou null si Hangar est à jour. */
  checkUpdate(): Promise<{ version: string; notes: string } | null>;
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
  type Img = { path: string; landscape: boolean } | null;
  const artworkOf = (a: { cover: Img; hero: Img; source: string }): Artwork => ({
    cover: a.cover ? { src: convertFileSrc(a.cover.path), landscape: a.cover.landscape } : null,
    hero: a.hero ? convertFileSrc(a.hero.path) : null,
    source: a.source
  });
  const { getIdentifier, getVersion } = await import('@tauri-apps/api/app');
  let pending: Awaited<ReturnType<typeof updater.check>> = null;
  const w = getCurrentWindow();

  const on = <T>(name: string, cb: (p: T) => void) => listen<T>(name, (e) => cb(e.payload));

  return {
    isTauri: true,
    scanGames: (localFolders, force = false) => invoke('scan_games', { localFolders, force }),
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
    focusGame: (gameId) => invoke('focus_game', { gameId }),
    showLaunchers: () => invoke('show_launchers'),
    uninstallGame: (gameId) => invoke('uninstall_game', { gameId }),
    updateGame: (gameId) => invoke('update_game', { gameId }),
    setDesktop: (closeAction, globalShortcut, padButton) => invoke('set_desktop', { closeAction, globalShortcut, padButton }),
    padBack: (restore) => invoke('pad_back', { restore }),
    gameBarOnButton: () => invoke('game_bar_on_button'),
    setTrayRecents: (games, theme, accent) => invoke('set_tray_recents', { games, theme, accent }),
    trayState: () => invoke('tray_state'),
    trayAction: (action) => invoke('tray_action', { action }),
    onMainHidden: (cb) => on<null>('main://hidden', () => cb()),
    onCloseAsk: (cb) => on<null>('main://close-ask', () => cb()),
    closeMain: (quit) => invoke('close_main', { quit }),
    setPresence: (gameId, start) => invoke('set_presence', { gameId, start: Math.max(0, Math.round(start)) }),
    onTrayLaunch: (cb) => on<string>('tray://launch', cb),
    onPadGuide: (cb) => on<string>('pad://guide', (w) => cb(w === 'close' ? 'close' : 'open')),
    openFolder: (path) => invoke('open_folder', { path }),
    resolveSteamId: (name) => invoke('resolve_steam_id', { name }),
    officialSite: (appId) => invoke('official_site', { appId }),
    wikidataSite: (name) => invoke('wikidata_site', { name }),
    searchSteam: (query) => invoke('search_steam', { query }),
    setSteamGridKey: (key) => invoke('set_steamgriddb_key', { key }),
    findArtwork: async (gameId, refresh) => artworkOf(await invoke<Parameters<typeof artworkOf>[0]>('find_artwork', { gameId, refresh })),
    findSocialArtwork: async (id, name) => artworkOf(await invoke<Parameters<typeof artworkOf>[0]>('find_social_artwork', { id, name })),
    image: async (url) => {
      const p = await invoke<string | null>('image', { url });
      return p ? convertFileSrc(p) : null;
    },
    exeIcon: async (path) => {
      const p = await invoke<string | null>('exe_icon', { path });
      return p ? convertFileSrc(p) : null;
    },
    folderSize: (path, fresh = false) => invoke('folder_size', { path, fresh }),
    gameInfo: (gameId) => invoke('game_info', { gameId }),
    steamAchievements: (gameId, fresh = false) => invoke('steam_achievements', { gameId, fresh }),
    setAutostart: (on) => invoke('set_autostart', { on }),
    padAtLogin: () => invoke('pad_at_login'),
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
        on<{ gameId: string; session: Session }>('launch://session', (p) => cb({ type: 'session', ...p })),
        on<{ gameId: string; session: Session | null }>('launch://ended', (p) => cb({ type: 'ended', ...p })),
        on<{ gameId: string; message: string }>('launch://failed', (p) => cb({ type: 'failed', ...p }))
      ]);
      return () => offs.forEach((o) => o());
    },
    onLauncherPrompt: (cb) => on<LauncherPrompt>('launch://prompt', cb),
    answerLauncherPrompt: (hwnd, show) => invoke('answer_launcher_prompt', { hwnd, show }),
    onScanPartial: (cb) => on<Game[]>('scan://partial', cb),
    accountsStatus: () => invoke('accounts_status'),
    connectSteam: (key) => invoke('connect_steam', { key }),
    connectAccount: (store) => invoke('connect_account', { store }),
    xboxLoginCode: () => invoke('xbox_login_code'),
    xboxLoginCancel: () => invoke('xbox_login_cancel'),
    disconnectAccount: (store) => invoke('disconnect_account', { store }),
    cloudStatus: () => invoke('cloud_status'),
    cloudLogin: (deviceId) => invoke('cloud_login', { deviceId }),
    cloudCancelLogin: () => invoke('cloud_cancel_login'),
    cloudLogout: () => invoke('cloud_logout'),
    cloudRenameDevice: (id, name) => invoke('cloud_rename_device', { id, name }),
    cloudForgetDevice: (id) => invoke('cloud_forget_device', { id }),
    cloudPull: (since) => invoke('cloud_pull', { since }),
    cloudPush: (changes) => invoke('cloud_push', { changes }),
    cloudPullSessions: (since) => invoke('cloud_pull_sessions', { since }),
    cloudPushSessions: (sessions) => invoke('cloud_push_sessions', { sessions }),
    cloudSyncSteamGridDb: (first) => invoke('cloud_sync_steamgriddb', { first }),
    cloudSyncLaunchers: () => invoke('cloud_sync_launchers'),
    cloudSetProfile: (name) => invoke('cloud_set_profile', { name }),
    cloudSetAvatar: (bytes) => invoke('cloud_set_avatar', { bytes: Array.from(bytes) }),
    cloudRemoveAvatar: () => invoke('cloud_remove_avatar'),
    cloudCoverHash: (path) => invoke('cloud_cover_hash', { path }),
    cloudUploadCover: (path, hash) => invoke('cloud_upload_cover', { path, hash }),
    cloudFetchCover: (hash) => invoke('cloud_fetch_cover', { hash }),
    cloudExport: () => invoke('cloud_export'),
    cloudDeleteAccount: () => invoke('cloud_delete_account'),
    social: (method, path, body) => invoke('cloud_social', { method, path, body: body ?? null }),
    socialImage: (kind, userId) => invoke('cloud_social_image', { kind, userId }),
    socialBanner: (bytes) => invoke('cloud_social_banner', { bytes: Array.from(bytes) }),
    socialLive: (on) => invoke('cloud_live', { on }),
    socialNotify: (title, body) => invoke('social_notify', { title, body }),
    onSocialEvent: (cb) => on<SocialEvent>('social://event', cb),
    onSocialLive: (cb) => on<boolean>('social://live', cb),
    openLink: (link) => invoke('open_link', { link }),
    openGameLink: (url) => invoke('open_game_link', { url }),
    openStorePage: (id) => invoke('open_store_page', { id }),
    reportBug: (title, description, screenshot) => invoke('report_bug', { title, description, screenshot }),
    openWebGame: (id) => invoke('open_web_game', { id }),
    onWebClosed: (cb) => on<string>('web://closed', cb),
    onAccountsSynced: (cb) => on<null>('accounts://synced', () => cb()),
    appVersion: async () => displayVersion(await getVersion()),
    checkUpdate: async () => {
      if ((await getIdentifier()).endsWith('.test')) throw new Error("Mises à jour désactivées dans l'environnement de test.");
      pending = await updater.check();
      return pending ? { version: displayVersion(pending.version), notes: pending.body ?? '' } : null;
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

// Appels jamais montrés comme un chargement : travail de fond (images, infos, sauvegarde,
// synchro), dialogues et connexions qui attendent l'utilisateur, lancement (LaunchOverlay),
// mise à jour de Hangar (sa propre progression), fenêtre et écouteurs.
const UNTRACKED = new Set<string>([
  'loadState', 'saveState', 'loadLibrary', 'saveLibrary', 'launchGame', 'installProgress', 'steamDownloads',
  'setTrayRecents', 'trayState', 'trayAction', 'closeMain', 'padBack', 'setPresence', 'gameBarOnButton',
  'image', 'exeIcon', 'folderSize', 'gameInfo', 'steamAchievements', 'findSocialArtwork', 'padAtLogin',
  'pickExe', 'pickFolder', 'pickImage', 'answerLauncherPrompt', 'connectAccount', 'xboxLoginCancel',
  'cloudLogin', 'cloudCancelLogin', 'cloudCoverHash', 'cloudUploadCover', 'cloudFetchCover', 'socialImage',
  'socialLive', 'socialNotify', 'appVersion', 'installUpdate', 'officialSite', 'wikidataSite'
]);

/** Passe chaque appel de `a` par `busy.track` (sauf UNTRACKED, les écouteurs et la fenêtre). */
function withBusy(a: Api, track: <T>(p: Promise<T>) => Promise<T>): Api {
  const out = { ...a } as Record<string, unknown>;
  for (const [name, fn] of Object.entries(a)) {
    if (typeof fn !== 'function' || UNTRACKED.has(name) || /^on[A-Z]/.test(name)) continue;
    out[name] = (...args: unknown[]) => {
      const r = (fn as (...x: unknown[]) => unknown)(...args);
      // Jaquette cherchée en fond (sans « Actualiser ») : pas une action.
      if (!(r instanceof Promise) || (name === 'findArtwork' && !args[1])) return r;
      return track(r);
    };
  }
  return out as unknown as Api;
}

/** À appeler une fois au démarrage, avant tout accès à `api`. */
export async function initApi(): Promise<Api> {
  const raw = isTauri() ? await tauriApi() : (await import('./mock')).mockApi();
  const { busy } = await import('./stores/busy.svelte');
  api = withBusy(raw, (p) => busy.track(p));
  return api;
}
