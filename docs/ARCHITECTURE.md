# Hangar - architecture technique

## 1. Stack

| Couche | Choix |
|---|---|
| Shell | Tauri 2 (WebView2), cible `x86_64-pc-windows-msvc` |
| Backend | Rust stable, edition 2021 |
| Frontend | Svelte 5 (runes) + TypeScript + Vite |
| Style | CSS natif avec variables (tokens), pas de framework CSS |
| Icônes | `lucide-svelte` |
| Police | `@fontsource-variable/geist` (embarquée) |
| Tests | Vitest (frontend), `cargo test` (backend), Playwright optionnel pour les captures |
| Plugins Tauri | `dialog`, `autostart`, `single-instance`, `window-state` |

Crates Rust : `serde`, `serde_json`, `winreg`, `windows-sys` (Shell, WindowsAndMessaging, Threading), `ureq` (rustls), `base64`, `sysinfo` (suivi des processus), `notify` (facultatif, surveillance des manifestes), `thiserror`, `log` + `tauri-plugin-log`.

## 2. Arborescence cible

```
hangar/
  CLAUDE.md
  docs/                      SPEC, DESIGN, ARCHITECTURE, PLAN, DECISIONS
  design/reference/          maquette validée (.dc.html)
  package.json  vite.config.ts  svelte.config.js  tsconfig.json
  index.html
  src/
    main.ts
    App.svelte               coque : barre latérale, barre du haut, routeur d'écrans, overlays
    lib/
      api.ts                 seul point d'appel aux commandes Tauri (typé)
      mock.ts                implémentation de démo de api.ts pour `npm run dev:web`
      types.ts               Game, Launch, Session, Settings, State...
      stores/                état Svelte (library, ui, settings, running)
      styles/tokens.css  base.css  motion.css
      util/                  format (durées, dates relatives), search (normalisation accents), color (hash -> dégradé)
      components/
        Sidebar.svelte  TopBar.svelte  SearchPanel.svelte
        GameCard.svelte  Cover.svelte  GeneratedCover.svelte
        HeroCarousel.svelte  Row.svelte  TopPlayedList.svelte
        PlayButton.svelte  FavButton.svelte  Chip.svelte  Segmented.svelte  Toggle.svelte
        ContextMenu.svelte  Modal.svelte  Toast.svelte  LaunchOverlay.svelte  RunningCard.svelte
        ActivityChart.svelte
      screens/
        Home.svelte  Library.svelte  GamePage.svelte  Settings.svelte
      modals/
        AddGame.svelte  Rename.svelte  ChangeCover.svelte  ConfirmStop.svelte
  src-tauri/
    Cargo.toml  tauri.conf.json  capabilities/default.json  icons/
    src/
      main.rs                construction de l'app, enregistrement des commandes et plugins
      commands.rs            commandes Tauri (fines, délèguent aux modules)
      state.rs               lecture/écriture atomique de state.json, migrations
      scanner/
        mod.rs               scan_all (parallèle), dédoublonnage, cache
        steam.rs  epic.rs  gog.rs  ubisoft.rs  ea.rs  battlenet.rs  riot.rs  xbox.rs  local.rs
        exe.rs               heuristique d'exécutable principal
        registry.rs          aides winreg (cfg windows)
      launcher.rs            ShellExecuteW, lancement, arrêt
      tracker.rs             suivi des processus et des sessions
      art.rs                 résolution Steam, cache disque des images, icônes d'exe
      size.rs                taille des dossiers (en tâche de fond, cachée)
  legacy/                    ancienne UI vanilla (à supprimer à la fin)
```

Le fichier actuel `src-tauri/src/scanner.rs` contient déjà tous les détecteurs. Découpe-le dans `scanner/` sans changer leur logique, puis améliore.

## 3. Modèle de données (TypeScript, miroir des structs Rust en camelCase)

```ts
type StoreId = 'steam'|'epic'|'gog'|'ubisoft'|'ea'|'battlenet'|'xbox'|'riot'|'local'|'manual';

interface Launch { kind: 'uri'|'exe'; target: string; args: string; cwd?: string }

interface Game {
  id: string;              // "steam:526870", "epic:<appName>", "local:<chemin minuscule>"...
  name: string;            // nom détecté
  store: StoreId;
  installDir?: string;
  launch: Launch;
  launcherName: string;    // "Steam", "Epic Games Launcher", "l'exécutable du jeu"...
  steamAppId?: number;     // natif (Steam) ou résolu
  exePath?: string;        // exe principal, pour l'icône et le suivi de processus
  processNames: string[];  // noms de processus qui signifient « le jeu tourne »
  genre?: string;          // Steam : via appdetails (facultatif, en cache), sinon vide
  notInstalled?: boolean;  // possédé mais pas installé : launch = installation dans le launcher
}

interface Session { gameId: string; start: number; end: number }   // ms epoch

interface PersistedState {
  version: 1;
  favorites: string[];
  hidden: string[];
  renames: Record<string, string>;
  customCovers: Record<string, string>;       // gameId -> chemin local ou "steam:<id>" ou "none"
  steamIdCache: Record<string, number>;       // gameId -> appid (0 = introuvable)
  firstSeen: Record<string, number>;
  totals: Record<string, { playMs: number; launches: number; lastPlayed: number }>;
  sessions: Session[];                         // 90 derniers jours
  localFolders: string[];
  manualGames: Game[];
  disabledStores: StoreId[];
  accent: string;
  sort: 'recent'|'az'|'hours';
  prefs: { minimizeOnLaunch: boolean; startWithWindows: boolean; autoCovers: boolean };
}
```

## 4. Commandes Tauri (`src/lib/api.ts` les expose une à une, typées)

| Commande | Rôle |
|---|---|
| `scan_games(localFolders) -> Game[]` | Scan complet, en parallèle (un thread par détecteur), Xbox inclus |
| `load_state() -> PersistedState` / `save_state(state)` | Persistance atomique, migrations par `version` |
| `launch_game(game) -> ()` | Lance, démarre le suivi du processus, émet les événements ci-dessous |
| `install_game(gameId)` | Jeu non installé : ouvre son installation dans le launcher (pas de suivi de processus) |
| `stop_game(gameId)` | Termine proprement les processus du jeu |
| `accounts_status() -> AccountStatus[]` | Par store : détecté, connectable, connecté, pseudo, nombre de jeux, date de synchro, erreur. Jamais de jeton |
| `connect_steam(key) -> number` | Vérifie la clé d'API Web Steam (32 hex) par un appel réel, la range dans le coffre du système |
| `connect_account(store) -> number` | GOG / Epic : fenêtre de connexion officielle, échange du code contre un jeton de rafraîchissement (coffre du système) |
| `disconnect_account(store)` | Efface le jeton et la liste en cache |
| `open_link(id)` | Ouvre une page d'aide d'une liste fermée (pas d'URL libre) |
| événement `accounts://synced` | Les comptes ont changé : le frontend rafraîchit l'état et rescanne |
| `open_folder(path)` | Explorateur Windows |
| `pick_exe()` / `pick_folder()` | Via `tauri-plugin-dialog` côté frontend directement |
| `resolve_steam_id(name) -> number?` | Recherche Steam |
| `search_steam(name) -> {id,name}[]` | Pour la modale « Changer la jaquette » (5 résultats) |
| `find_artwork(gameId, steamGridKey, refresh) -> {cover, hero, source}` | Jaquette et bannière d'un jeu : image native du store (Epic, GOG, Xbox), puis Steam, puis SteamGridDB ; résultat mis en cache (`cache\artwork.json`) |
| `image(url) -> string` | Renvoie un chemin local en cache (servi via le protocole `asset:`), télécharge si absent |
| `exe_icon(path) -> string?` | Icône d'exe extraite en PNG 256 px (IShellItemImageFactory), en cache |
| `folder_size(path) -> number` | Taille en octets, calculée en tâche de fond et mise en cache 24 h |
| `set_autostart(on)` | Plugin autostart |

Événements émis par le backend :

| Événement | Charge utile | Moment |
|---|---|---|
| `launch://started` | `{ gameId }` | ShellExecute réussi |
| `launch://running` | `{ gameId, pid }` | Premier processus du jeu détecté |
| `launch://ended` | `{ gameId, session }` | Plus aucun processus du jeu depuis 5 s |
| `launch://failed` | `{ gameId, message }` | Échec |
| `scan://partial` | `Game[]` | Un détecteur lent (Xbox) a répondu |

## 5. Points techniques importants

### Heuristique d'exécutable principal (`exe.rs`)
Reprendre `best_exe` de `scanner.rs` : exes jusqu'à 4 niveaux, liste d'exclusions (unins, setup, redist, crash, helper, anticheat...), dossiers ignorés (`_CommonRedist`, `__Installer`, `Engine`...), score = launcher au niveau 0-1 (+60), nom proche du dossier (+45), suffixe `Shipping`/`Win64` (+15), profondeur (-8 par niveau), taille (+1 par 20 Mo, max 30). Ajouter des tests unitaires avec une arborescence temporaire.

### Suivi des processus (`tracker.rs`)
- Après un lancement, interroger `sysinfo` toutes les 2 s pendant 90 s max pour trouver un processus dont l'exe est dans `installDir` (comparaison de chemins insensible à la casse) ou dont le nom est dans `processNames`. Les processus des launchers (steam.exe, EpicGamesLauncher.exe, Battle.net.exe, RiotClientServices.exe, GalaxyClient.exe, upc.exe, EADesktop.exe) sont ignorés.
- Une fois trouvé : suivre toutes les 5 s, fin de session quand plus aucun processus correspondant n'existe.
- Une seule boucle de suivi globale (pas un thread par jeu). Pas de suivi si l'app est fermée : à la réouverture, ne rien inventer.

### Lancement (`launcher.rs`)
`ShellExecuteW` (verbe `open`) pour les URI, `shell:AppsFolder\...` et les exe avec arguments et dossier de travail. Code de retour ≤ 32 = erreur, traduite en message français clair. Ne jamais passer par `cmd /c start` (le `&` des URI Epic casse).

### Images (`art.rs`)
- Le frontend n'appelle jamais directement les CDN : il demande `image(url)` au backend qui télécharge (ureq + rustls, délai 8 s), stocke dans `%LOCALAPPDATA%\studio.pamal.hangar\cache\img\<hash>.jpg` et renvoie le chemin, converti avec `convertFileSrc`. Activer `assetProtocol` avec une portée limitée à ce dossier et à `covers\`.
- File d'attente avec 6 téléchargements simultanés max, priorité aux jaquettes visibles.
- 404 en cache aussi (fichier `.miss`) pour ne pas réessayer en boucle (expiration 7 jours).

### Performances frontend
- Grille virtualisée au-delà de 150 jeux.
- `loading="lazy"` et `decoding="async"` sur les images.
- Animations uniquement sur `transform` et `opacity`.
- La lumière d'ambiance est une seule image (240 px de large suffit) floutée par CSS.

### Mode web de démo
`npm run dev:web` lance Vite seul ; `api.ts` détecte l'absence de `window.__TAURI_INTERNALS__` et utilise `mock.ts` : 36 jeux de démo (ceux de la maquette, avec leurs appid Steam), sessions et favoris fictifs, lancement simulé (événements émis avec des délais). Images : URL du CDN Steam directement.

### Sécurité
- CSP stricte : `default-src 'self'; img-src 'self' asset: http://asset.localhost data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src ipc: http://ipc.localhost`.
- Capabilities Tauri minimales (fenêtre, dialog, autostart, événements).
- Aucune commande générique « exécuter n'importe quoi » exposée : `launch_game` ne lance que des jeux connus (détectés ou ajoutés manuellement via le sélecteur de fichiers).

## 6. Build et distribution

- `npm run build` produit `src-tauri/target/release/hangar.exe` (portable) et `bundle/nsis/Hangar_<version>_x64-setup.exe` (installation par utilisateur).
- `npm run build:setup` produit ensuite `installer/target/release/hangar-setup.exe` : l'installeur aux couleurs de Hangar (petite app Tauri, `installer/`) qui embarque ce NSIS et l'exécute en silencieux. Le NSIS seul reste utilisé par l'updater.
- Workflow GitHub Actions `.github/workflows/build.yml` (déjà présent) : build sur `windows-latest`, artefacts exe + installeur.
- Identifiant d'app : `studio.pamal.hangar`. Version dans `package.json` et `tauri.conf.json`, synchronisées.
