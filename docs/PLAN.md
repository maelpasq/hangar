# Hangar - plan de réalisation

Fais les étapes dans l'ordre. Chacune se termine par : `npm run check`, `npm run test`, `cargo test`, `cargo clippy -- -D warnings`, la vérification « aucun tiret cadratin », puis un commit. Coche les cases au fur et à mesure dans ce fichier.

## Étape 0 - Préparation
- [x] Lire CLAUDE.md, SPEC.md, DESIGN.md, ARCHITECTURE.md et la maquette.
- [x] `git init` si besoin, `.gitignore` (node_modules, target, gen, dist).
- [x] Déplacer l'ancienne UI `src/` vers `legacy/`.
- [x] Créer `docs/DECISIONS.md` (vide, avec un titre).

## Étape 1 - Squelette Svelte
- [x] Vite + Svelte 5 + TypeScript, `npm run dev`, `npm run dev:web`, `npm run check`, `npm run test`.
- [x] `tauri.conf.json` : `frontendDist: ../dist`, `devUrl`, `beforeDevCommand`, `beforeBuildCommand`, fenêtre sans décorations 1320 × 840 (min 900 × 600), fond `#0a0b0f`, CSP de ARCHITECTURE.md.
- [x] Tokens, base.css, motion.css, police Geist embarquée.
- [x] `types.ts`, `api.ts`, `mock.ts` avec les 36 jeux de démo.
- **Vérif** : `npm run dev:web` affiche une page vide aux bonnes couleurs et à la bonne police.

## Étape 2 - Coque de l'app
- [x] `Sidebar`, `TopBar` (contrôles de fenêtre fonctionnels, zone de déplacement, double-clic), routeur d'écrans avec l'animation d'entrée, lumière d'ambiance.
- [x] Rail replié sous 1000 px.
- **Vérif** : comparaison visuelle avec la maquette (barre latérale et barre du haut).

## Étape 3 - Composants de base
- [x] `Cover` (chaîne de repli des images + jaquette générée), `GameCard` (survol, focus, étoile, double-clic, clic droit), `PlayButton`, `FavButton`, `Chip`, `Segmented`, `Toggle`, `Toast`, `Modal`, `ContextMenu`.
- [x] Tests Vitest : hash couleur stable, format des durées et des dates relatives (« Aujourd'hui », « Hier », « Il y a N jours »), recherche sans accents.

## Étape 4 - Écrans
- [x] Accueil : carrousel (auto, pause au survol / focus perdu / recherche, miniatures avec barre), Reprendre, Favoris, Les plus joués.
- [x] Bibliothèque / Favoris / filtre store : tri mémorisé, puces, grille avec cascade, états vides.
- [x] Page de jeu : bannière Ken Burns sous la barre du haut, jaquette qui chevauche, activité (4 tuiles + histogramme 14 jours), informations, actions, « Aussi dans ta bibliothèque », bouton Retour.
- [x] Paramètres : stores, dossiers, accent (appliqué en direct), comportement, jeux masqués, jeux manuels.
- [x] Recherche : panneau, raccourcis clavier (Ctrl K, /, flèches, Entrée, Ctrl Entrée, Échap).
- **Vérif** : en mode web, chacun des 5 écrans correspond à la maquette. Faire des captures 1440 × 900 avec Playwright et les comparer à l'œil à la maquette.

## Étape 5 - Backend : détection
- [x] Découper `scanner.rs` en modules, scan parallèle, dédoublonnage, `launcherName`, `exePath`, `processNames`.
- [x] Événement `scan://partial` pour Xbox.
- [x] Tests unitaires : parseur VDF (fichiers d'exemple dans `src-tauri/tests/fixtures`), manifeste Epic, YAML Riot, heuristique `best_exe`.
- [x] Brancher `api.ts` sur les vraies commandes ; cache d'affichage instantané au démarrage.

## Étape 6 - Backend : lancement et suivi
- [x] `launcher.rs` (ShellExecuteW), `tracker.rs` (sysinfo), événements `launch://*`.
- [x] `LaunchOverlay` piloté par les événements (fermeture au premier processus ou à 4 s), réduction de la fenêtre selon le réglage, retour au premier plan à la fin.
- [x] `RunningCard` + état « En cours » + « Arrêter » avec confirmation.
- [x] Sessions et totaux enregistrés, histogramme alimenté par les vraies sessions.

## Étape 7 - Images, icônes, tailles
- [x] `art.rs` : cache disque, file de téléchargement, `.miss`, protocole asset.
- [x] Résolution Steam des jeux hors Steam (respecte « Jaquettes automatiques »), modale « Changer la jaquette » avec aperçus.
- [x] Icônes d'exe 256 px pour les jaquettes générées.
- [x] `folder_size` en tâche de fond.

## Étape 8 - Gestion
- [x] Ajouter un jeu (exe ou dossier), Renommer, Masquer (toast avec Annuler), favoris partout, dossiers locaux, stores désactivés.
- [x] Autostart, single-instance (ramène la fenêtre existante), window-state (taille et position mémorisées).

## Étape 9 - Finitions
- [x] `prefers-reduced-motion`, navigation clavier complète, focus visibles, contrastes AA.
- [x] Grille virtualisée au-delà de 150 jeux, mesure du démarrage (< 1 s jusqu'au premier affichage depuis le cache).
- [x] Journal (`tauri-plugin-log`) dans `%LOCALAPPDATA%\studio.pamal.hangar\logs`.
- [x] Supprimer `legacy/`, mettre à jour README.md (captures, fonctionnalités, build).
- [x] `npm run build` : exe portable + installeur NSIS. Tester l'installeur sur Windows 11 (exe vérifié, installeur à tester par l'utilisateur).

## Étape 10 - Recette sur le PC de l'utilisateur
Liste à faire valider par l'utilisateur (lui demander de lancer l'app et de cocher) :
- [ ] Tous ses jeux sont détectés (comparer avec chaque launcher).
- [ ] Chaque store lance correctement un de ses jeux.
- [ ] Le temps de jeu s'incrémente après une partie.
- [ ] Les jaquettes sont correctes (corriger celles qui ne le sont pas via la modale).
- [ ] Aucun ralentissement, aucune fenêtre console.
