# Hangar

> Pour développer avec Claude Code : voir `CLAUDE.md` et `docs/` (SPEC, DESIGN, ARCHITECTURE, PLAN, DECISIONS).

Bibliothèque de jeux unifiée pour Windows 10/11 et macOS (Tauri 2 + Rust, interface Svelte 5).

Au premier démarrage, Hangar détecte tous les jeux installés, affiche leurs vraies jaquettes et les lance via leur launcher (ou directement l'exécutable s'il n'y en a pas) :

| Source | Détection | Lancement |
|---|---|---|
| Steam | `libraryfolders.vdf` + `appmanifest_*.acf` | `steam://rungameid/<id>` |
| Epic Games | `ProgramData\Epic\...\Manifests\*.item` | `com.epicgames.launcher://apps/...?action=launch` |
| GOG | Registre `GOG.com\Games` | GOG Galaxy `/command=runGame`, sinon l'exe |
| Ubisoft Connect | Registre `Ubisoft\Launcher\Installs` | `uplay://launch/<id>/0` |
| EA app | Clés de désinstallation + dossier `__Installer` | Exe du jeu (ouvre l'EA app) |
| Battle.net | Clés de désinstallation (`--uid=`) | `Battle.net.exe --exec="launch <code>"` |
| Riot Games | `ProgramData\Riot Games\Metadata` | `RiotClientServices.exe --launch-product=...` |
| Xbox / Microsoft Store | `Get-AppxPackage` + `MicrosoftGame.config` | `shell:AppsFolder\<famille>!<app>` |
| Dossiers locaux | Un jeu par sous-dossier, exe choisi automatiquement (launcher prioritaire) | Exe |
| Ajout manuel | Exe, raccourci ou `.bat` choisi par toi | Exe + arguments |

Sur macOS : Steam (`~/Library/Application Support/Steam`), Epic (`~/Library/Application Support/Epic/.../Manifests`), Riot (`/Users/Shared/Riot Games`), les apps de la catégorie Jeux de `/Applications` (jeux GOG reconnus à leur `goggame-*.info`), les dossiers locaux (`.app`) et l'ajout manuel. Ubisoft, EA, Battle.net et Xbox n'ont pas de détection Mac. Lancement via `open`.

## Fonctionnalités

- Accueil avec carrousel des jeux mis en avant, « Reprendre », favoris et « Les plus joués ».
- Bibliothèque filtrable par store, triable (Récents, A-Z, Temps de jeu), grille virtualisée pour les grandes collections.
- Page de jeu : temps de jeu, dernière session, lancements, taille sur le disque, histogramme des 14 derniers jours.
- Suivi des parties : Hangar détecte le processus du jeu, chronomètre la session et peut l'arrêter.
- Jaquettes automatiques (CDN Steam, recherche Steam pour les jeux hors Steam), mises en cache sur le disque ; jaquette personnalisée ou générée.
- Recherche instantanée (`Ctrl K` ou tape n'importe où, `Entrée` ouvre, `Ctrl Entrée` lance).
- Renommer, masquer (avec Annuler), favoris, dossiers locaux, stores désactivables, couleur d'accent, démarrage avec Windows.

Données : `%APPDATA%\studio.pamal.hangar\state.json` (réglages, favoris, temps de jeu), cache dans `%LOCALAPPDATA%\studio.pamal.hangar\cache`, journal dans `%LOCALAPPDATA%\studio.pamal.hangar\logs`.

## Compiler (sur Windows)

Prérequis : Rust (rustup, toolchain MSVC), Node.js, et les « Build Tools for Visual Studio » (charge de travail C++). WebView2 est déjà présent sur Windows 10/11.

```bat
build.bat
```

ou à la main :

```bat
npm install
npm run build
```

Résultats :
- Exe portable : `src-tauri\target\release\hangar.exe`
- Installeur (par utilisateur, sans droits admin) : `src-tauri\target\release\bundle\nsis\Hangar_1.0.0_x64-setup.exe`

## Publier une version (Windows + Mac) et mise à jour intégrée

Le workflow `.github/workflows/release.yml` construit l'installeur Windows et le `.dmg` macOS (universel Intel + Apple Silicon), les publie dans une release GitHub et génère `latest.json`. Hangar le lit au démarrage et via Paramètres > Mise à jour : le bouton « Mettre à jour » télécharge, vérifie la signature, installe et redémarre.

Une seule fois :
1. Créer le dépôt GitHub `maelpasq/hangar` (public, sinon `latest.json` n'est pas lisible ; sinon changer `plugins.updater.endpoints` dans `src-tauri/tauri.conf.json`).
2. Secrets du dépôt : `TAURI_SIGNING_PRIVATE_KEY` = contenu de `~/.tauri/hangar.key`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` vide. Ne jamais perdre cette clé : sans elle, les versions installées ne peuvent plus se mettre à jour.

À chaque version :

```bash
npm version patch        # ou minor / major : met à jour la version et crée le tag vX.Y.Z
git push --follow-tags   # lance la release
```

L'app Mac n'est pas signée par Apple : au premier lancement, clic droit sur Hangar > Ouvrir (ou `xattr -cr /Applications/Hangar.app`). Les mises à jour suivantes passent par le bouton.

## Développer

```bash
npm run dev        # app Tauri avec rechargement à chaud
npm run dev:web    # interface seule dans un navigateur, avec 36 jeux de démo
npm run check      # svelte-check + tsc
npm run test       # tests frontend (vitest)
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```
