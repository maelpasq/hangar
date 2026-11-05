# Versions de Hangar

Ce fichier est chargé à chaque nouvelle conversation (importé par `CLAUDE.md`). Il explique comment publier une version et garde l'historique de toutes les versions.

## Publier une nouvelle version en prod

Une version publiée part chez tous les utilisateurs : le bouton « Mettre à jour » de Hangar lit `latest.json` sur la dernière release GitHub. Ne publie que si l'utilisateur l'a demandé.

1. **Vérifier** que tout passe, depuis la racine du projet :
   ```bash
   npm run check
   npm run test
   cd src-tauri && cargo test && cargo clippy -- -D warnings
   rg -n '\x{2014}' --glob '!node_modules' --glob '!target' .
   ```
   La dernière commande ne doit rien afficher. `git status` doit être propre et la branche doit être `main`.
2. **Choisir le numéro** (semver) :
   - `patch` (1.2.0 -> 1.2.1) : corrections, petits ajustements ;
   - `minor` (1.2.0 -> 1.3.0) : nouvelle fonctionnalité visible ;
   - `major` (1.2.0 -> 2.0.0) : refonte ou rupture.
3. **Ajouter l'entrée de la version** en haut de « Historique » ci-dessous (numéro, date, description pour les utilisateurs), puis committer :
   ```bash
   git commit -am "Versions : notes de la 1.2.1"
   ```
4. **Monter la version et créer le tag** (le numéro vient de `package.json`, `tauri.conf.json` le lit) :
   ```bash
   npm version patch -m $'Version %s\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
   ```
   Remplace `patch` par `minor` ou `major` selon l'étape 2. Sous PowerShell, la syntaxe `$'...'` ne marche pas : lance la commande avec l'outil Bash.
5. **Pousser** le commit et le tag :
   ```bash
   git push --follow-tags origin main
   ```
6. **Suivre la construction.** Le tag `v*` lance `.github/workflows/release.yml` (Windows et macOS, environ 15 minutes). `gh` n'est pas installé sur ce poste : passe par l'API publique de GitHub, par exemple en PowerShell :
   ```powershell
   (Invoke-RestMethod "https://api.github.com/repos/maelpasq/hangar/actions/runs?per_page=3").workflow_runs | % { "$($_.name) #$($_.run_number) $($_.status)/$($_.conclusion)" }
   ```
7. **Vérifier la release** sur https://github.com/maelpasq/hangar/releases : elle doit contenir `Hangar-Setup.exe`, `Hangar_x.y.z_x64-setup.exe` et sa `.sig`, `Hangar_x.y.z_universal.dmg`, `Hangar_universal.app.tar.gz` et sa `.sig`, et `latest.json`.

Fichiers de la release :
- `Hangar-Setup.exe` : installeur aux couleurs de Hangar (`installer/`), celui à donner aux gens. Il embarque l'installeur NSIS.
- `Hangar_x.y.z_x64-setup.exe` : installeur NSIS de Tauri, téléchargé par la mise à jour intégrée. À ne jamais retirer.
- `.dmg` : installation sur Mac. `.app.tar.gz` : mise à jour sur Mac.
- `.sig` : signatures vérifiées par la mise à jour (clé privée dans les secrets GitHub `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
- `latest.json` : la fiche lue par Hangar pour savoir s'il existe une nouvelle version.

Si un build échoue : corrige, committe, puis publie un nouveau `patch`. Ne déplace jamais un tag déjà poussé, des utilisateurs ont peut-être déjà la version.

## Historique

Une entrée par version, la plus récente en haut. La description s'adresse aux utilisateurs.

### 1.2.0 - 5 novembre 2026
Nouvel onglet **Jeux web** : une quarantaine de jeux navigateur (.io, classiques, stratégie, bac à sable : agar.io, slither.io, TETR.IO, OpenFront, Territorial.io, Bloxd...) avec leurs jaquettes, des icônes par genre et les jeux récents en tête. Chaque jeu s'ouvre dans sa propre fenêtre, sans accès à Hangar et limitée au HTTPS. L'onglet est proposé au démarrage (badge « Nouveau » pour ceux qui ont déjà l'app) et s'active dans Paramètres > Général.

### 1.1.3 - 5 novembre 2026
Un launcher désinstallé n'est plus détecté : ses restes sur le disque (dossier de données de Steam, base de GOG Galaxy, catalogue Epic) ne sont plus lus. Corrige des jeux Steam affichés sur un Mac sans Steam.

### 1.1.2 - 5 novembre 2026
Paramètres : les pages Launchers et Comptes sont réunies en une seule page « Launchers et comptes ».

### 1.1.1 - 5 novembre 2026
Paramètres refaits : navigation par section et lignes homogènes, mise en page adaptée aux petites fenêtres.

### 1.1.0 - 5 novembre 2026
Jeux possédés non installés : affichés et installables depuis Hangar (Steam, Epic, GOG, Riot), dans un nouvel onglet « À installer ». Connexion des comptes Steam, GOG et Epic dans les Paramètres pour récupérer toute la bibliothèque (secrets dans le trousseau du système), et tag « Détecté » pour chaque launcher présent.

### 1.0.7 - 4 novembre 2026
Thème clair, sombre ou celui de l'appareil, et paramètres réorganisés.

### 1.0.6 - 4 novembre 2026
Build macOS sur les machines Intel de GitHub (l'app reste universelle Intel et Apple Silicon).

### 1.0.5 - 4 novembre 2026
Correction de la release : l'installeur n'est plus confondu avec l'app.

### 1.0.4 - 4 novembre 2026
Installeur Windows aux couleurs de Hangar. Sur les jaquettes, le bouton du survol lance le jeu et le clic ouvre la fiche. README refait pour GitHub, licence MIT.

### 1.0.3 - 4 novembre 2026
macOS : le cadre natif de la fenêtre n'est plus écrasé par sa taille mémorisée.

### 1.0.2 - 4 novembre 2026
macOS : fenêtre native avec coins arrondis et boutons standards.

### 1.0.1 - 4 novembre 2026
Première version publique de Hangar 2 : interface Svelte fidèle à la maquette, détection de tous les stores (Steam, Epic, GOG, Ubisoft, EA, Battle.net, Riot, Xbox, jeux hors store, dossiers locaux), vraies jaquettes multi-sources, temps de jeu, dernière session, taille et genre importés des stores, logos des stores, identité visuelle.
