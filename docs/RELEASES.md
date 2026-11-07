# Versions de Hangar

Ce fichier explique comment publier une version et garde l'historique de toutes les versions.

## Publier une nouvelle version en prod

Une version publiée part chez tous les utilisateurs : le bouton « Mettre à jour » de Hangar lit `latest.json` sur la dernière release GitHub. Ne publie que si l'utilisateur l'a demandé.

1. **Vérifier** que tout passe, depuis la racine du projet :
   ```bash
   npm run verify
   ```
   Chaque étape doit afficher `ok`. `git status` doit être propre et la branche doit être `main`.
2. **Le numéro** : toujours `patch`, règle fixée par l'utilisateur. Chaque version ajoute 0.0.1 au dernier chiffre (1.2.1 -> 1.2.2 -> 1.2.3...), petite correction comme grosse nouveauté. Jamais `minor` ni `major`, même pour une grosse mise à jour.
3. **Ajouter l'entrée de la version** en haut de « Historique » ci-dessous (numéro, date, description pour les utilisateurs), puis committer :
   ```bash
   git commit -am "Versions : notes de la 1.2.1"
   ```
4. **Monter la version et créer le tag** (le numéro vient de `package.json`, `tauri.conf.json` le lit ; le script `version` le recopie dans les `Cargo.toml` et `Cargo.lock`) :
   ```bash
   npm version patch -m $'Version %s\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
   ```
   Toujours `patch` (étape 2). Sous PowerShell, la syntaxe `$'...'` ne marche pas : lance la commande avec l'outil Bash.
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

### 1.2.6 - 7 novembre 2026
**Launchers invisibles** (Windows) : quand tu lances ou mets à jour un jeu, la fenêtre de son launcher (Steam, Epic, Ubisoft Connect, EA app, Battle.net...) reste cachée, il travaille en arrière-plan et tu ne vois que ton jeu. S'il attend quelque chose de toi (connexion, contrat), le bouton « Afficher le launcher » le ramène. **Installer** : Hangar te demande dans quel dossier du launcher installer le jeu, avec la place libre de chaque disque. Les jeux Steam se téléchargent en arrière-plan avec la progression sur le bouton (« Installation 42 % »), puis « prêt » avec un bouton « Jouer ». **Désinstaller** : après confirmation dans Hangar, les jeux Steam, Epic et GOG sont supprimés sans ouvrir leur launcher. Garde-fous : rien pendant une partie, Epic jamais fermé pendant un téléchargement, alerte si un téléchargement Steam ne démarre pas.

### 1.2.5 - 7 novembre 2026
**Mises à jour des jeux** : Hangar repère les jeux Steam, Epic et GOG qui attendent une mise à jour, les range dans un nouvel onglet « Mises à jour » et te prévient par une notification. Le bouton « Mettre à jour » ouvre la mise à jour dans le bon launcher (Steam, Epic, GOG Galaxy, Microsoft Store), et un menu « Mises à jour » apparaît en haut à droite quand un jeu attend. La vérification se refait toute seule, jamais pendant une partie. **Assistant de configuration** : à la première ouverture (et une fois pour ceux qui ont déjà Hangar), quatre étapes pour régler tes launchers, tes dossiers de jeux, ta couleur et les jeux web, à relancer depuis Paramètres > Général. Les filtres de la bibliothèque ont de nouvelles listes déroulantes aux couleurs de Hangar, et le bouton de mise à jour de l'app devient « Mettre à jour Hangar ».

### 1.2.4 - 6 novembre 2026
**Discord Rich Presence** : la jaquette de ton jeu s'affiche maintenant quelle que soit sa source (Steam, Epic, GOG, Xbox, SteamGridDB), plus seulement pour les jeux Steam. Les **jeux web** apparaissent aussi sur Discord, avec leur jaquette, et disparaissent quand tu fermes leur fenêtre.

### 1.2.3 - 6 novembre 2026
**Discord Rich Presence** : tes amis Discord voient à quoi tu joues, avec le nom du jeu, sa jaquette, l'icône Hangar dans le coin, « Lancé avec Hangar » et le temps de jeu. Désactivé par défaut : à activer dans Paramètres > Général > « Afficher mon jeu sur Discord ». Passe par l'app Discord installée sur l'appareil.

### 1.2.2 - 5 novembre 2026
**Mode manette corrigé** : Hangar ne se rouvre plus en plein écran après avoir été fermé ou quitté en mode manette, et une fenêtre restée à la taille de l'écran retrouve sa taille normale. Le curseur se cache quand tu joues à la manette et revient dès que la souris bouge. **Nouveau menu de l'icône** : un clic gauche sur l'icône Hangar de la zone de notification ouvre un petit menu avec tes jeux récents et leur jaquette, « Ouvrir Hangar » et « Quitter Hangar » (le clic droit garde le menu simple). Les jaquettes s'affichent dès le tout premier lancement.

### 1.2.1 - 5 novembre 2026
**Mode manette** : Hangar en plein écran, à la manette ou au clavier (Start pour l'ouvrir, A pour jouer, LB / RB pour changer d'onglet). **Collections** : range tes jeux dans tes propres listes (clic droit > Collections), affichées dans la barre latérale, et filtre la bibliothèque par genre ou temps de jeu. **Zone de notification** : tes jeux récents à un clic de l'icône Hangar, la fenêtre s'y cache quand tu la fermes, et Ctrl+Alt+H l'affiche ou la cache. **Désinstaller** un jeu ouvre sa désinstallation dans son launcher. Sécurité renforcée : pop-ups et téléchargements bloqués dans les jeux web, chemins de fichiers limités aux jeux de la bibliothèque, images téléchargées seulement depuis les sites autorisés.

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
