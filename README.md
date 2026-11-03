# Hangar

> Pour développer avec Claude Code : voir `PROMPT.md` (message à coller) et `CLAUDE.md`.

Bibliothèque de jeux unifiée pour Windows (Tauri 2 + Rust).

Détecte automatiquement les jeux installés et les lance via leur launcher (ou directement l'exécutable s'il n'y en a pas) :

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
| Ajout manuel | Exe choisi par toi | Exe + arguments |

Fonctions : jaquettes automatiques (CDN Steam, recherche Steam pour les jeux hors Steam), recherche instantanée (tape n'importe où, Entrée lance le 1er résultat), filtres par store, favoris, récemment lancés, renommer, masquer, corriger la jaquette, ouvrir le dossier.

Données sauvegardées dans `%APPDATA%\studio.pamal.hangar\state.json`.

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
- Installeur : `src-tauri\target\release\bundle\nsis\Hangar_1.0.0_x64-setup.exe`

Mode développement (rechargement à chaud de l'interface) : `npm run dev`.
