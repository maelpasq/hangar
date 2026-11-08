# Hangar - instructions pour Claude Code

Hangar est un launcher de jeux pour Windows 10/11 et macOS : il détecte automatiquement tous les jeux installés (Steam, Epic, GOG, Ubisoft Connect, EA app, Battle.net, Riot, Xbox / Microsoft Store, dossiers locaux, ajouts manuels), les affiche avec leurs vraies jaquettes et les lance via leur launcher, ou directement via l'exécutable quand il n'y a pas de launcher.

## Documents (à consulter, pas à lire en entier)

Ne lis pas ces docs d'office. Quand la tâche en a besoin, cherche le titre de la section utile (`rg -n '^#' docs/X.md`) et lis seulement cette section :

- `docs/SPEC.md` : ce que fait l'app, écran par écran, critères d'acceptation.
- `docs/DESIGN.md` : design system et composants. **La maquette validée par l'utilisateur fait foi.**
- `docs/ARCHITECTURE.md` : stack, modèle de données, commandes Tauri.
- `docs/RELEASES.md` : procédure de publication (début du fichier) et historique des versions. À lire seulement pour publier.
- `docs/DECISIONS.md` : choix passés, à chercher par mot-clé, ajouter en fin de fichier sans le relire.
- `docs/PLAN.md` : historique de la construction initiale, à ignorer.

Maquette : `design/reference/maquette-hangar.dc.html` (70 Ko, ne jamais la lire en entier, chercher la valeur voulue avec `rg`). C'est un template de l'outil de design de Claude (`<x-dc>`, `<sc-for>`, `<sc-if>`, `{{ ... }}`), pas du code à copier : référence exacte des couleurs, tailles, espacements, keyframes, textes. Les URL `/_blob/...` ne marchent pas hors de l'outil (images : DESIGN.md, section Jaquettes).

## Économie de tokens

- Chercher avant de lire (`rg`, Grep), puis lire seulement les lignes utiles (offset/limit). Ne jamais lire les lockfiles, `site/index.html` en entier, les images de `design/` ou `docs/images/`.
- Vérifier avec `npm run verify` (sortie courte) plutôt que les commandes une par une.
- Captures d'écran seulement pour un changement visuel, et à échelle réduite.
- Pas d'agents ni de relecture de fichiers déjà lus ou juste modifiés. Réponses courtes.

## Règles non négociables

- **Langue** : toute l'interface et tous les messages sont en français. Les commentaires du code peuvent être en français.
- **Jamais de tiret cadratin** (le caractère U+2014) nulle part : code, UI, commentaires, docs, messages de commit. Utilise un tiret simple `-`. Vérifie avec `rg -n '\x{2014}' --glob '!node_modules' --glob '!target' .` (doit ne rien afficher) avant chaque commit.
- **Windows et macOS** : cibles `x86_64-pc-windows-msvc` et `universal-apple-darwin`. Tout code spécifique à Windows est sous `#[cfg(windows)]`. Le code macOS passe de préférence par `cfg!(target_os = "macos")` (compilé et testé aussi sous Windows) ; le CI (`build.yml`) compile, teste et passe clippy sur les deux systèmes.
- **Aucune fenêtre console** ne doit s'ouvrir : chaque `Command` (PowerShell, etc.) utilise `CREATE_NO_WINDOW` (0x08000000).
- **Pas de réseau inutile** : seules les sources d'images des jeux sont appelées, depuis le backend uniquement : CDN et recherche Steam (`*.steamstatic.com`, `store.steampowered.com/api/storesearch`), images Epic (`*.epicgames.com`), GOG (`api.gog.com`, `gamesdb.gog.com`, `*.gog-statics.com`), Microsoft Store (`displaycatalog.mp.microsoft.com`, `store-images.s-microsoft.com`) et SteamGridDB (`*.steamgriddb.com`, seulement si l'utilisateur a saisi sa clé). Les comptes que l'utilisateur connecte lui-même (Paramètres > Launchers) : `api.steampowered.com`, `auth.gog.com`, `embed.gog.com` et trois services Epic (`account-public-service-prod03`, `library-service.live.use1a`, `catalog-public-service-prod06` sur `.ol.epicgames.com` / `.on.epicgames.com`), liste fermée dans `src-tauri/src/accounts/mod.rs`. Pour les mises à jour des jeux : `launcher-public-service-prod06.ol.epicgames.com` (versions Epic, avec le compte Epic connecté) et `content-system.gog.com` (versions publiques des jeux GOG installés), au plus toutes les 6 h. Les jeux de l'onglet Jeux web (`src/lib/web-games.json`), seulement quand l'utilisateur en lance un, dans leur propre fenêtre. Hangar MC (écran Minecraft, `src-tauri/src/minecraft.rs`) : seulement les serveurs de Mojang (`piston-meta.mojang.com`, `launchermeta.mojang.com`, `piston-data.mojang.com`, `libraries.minecraft.net`, `resources.download.minecraft.net`) de Fabric (`meta.fabricmc.net`, `maven.fabricmc.net`) et de Legacy Fabric pour les versions d'avant la 1.14 (`meta.legacyfabric.net`, `maven.legacyfabric.net`, `repo.legacyfabric.net`), quand l'utilisateur ouvre l'écran ou installe une version, plus les affiches des versions (`launchercontent.mojang.com`, notes de version du launcher officiel, et `www.minecraft.net`, affiches des mises à jour) ; le code refuse toute autre adresse. Son compte Microsoft (connecté par l'utilisateur) : `login.microsoftonline.com`, `user.auth.xboxlive.com`, `xsts.auth.xboxlive.com`, `api.minecraftservices.com` (liste fermée de `accounts/mod.rs`). Discord Rich Presence passe par l'IPC locale de l'app Discord (pas de réseau côté Hangar). Plus la mise à jour de Hangar : `latest.json` et les installeurs des releases GitHub (`github.com`, `objects.githubusercontent.com`). Pas de télémétrie. Les polices sont embarquées dans l'app (pas de Google Fonts au runtime).
- **Robustesse de la détection** : un store absent, une clé de registre manquante ou un fichier corrompu ne doivent jamais faire planter le scan. Chaque détecteur renvoie une liste vide en cas d'erreur et journalise la raison.
- **Ne jamais toucher à la Hangar installée de l'utilisateur** (`%LOCALAPPDATA%\Hangar`, ses données `studio.pamal.hangar`, ses comptes dans le coffre « Hangar »). C'est l'app qu'il télécharge et utilise. Pour tester dans la vraie app : `npm run dev`, qui tourne dans un environnement séparé (`src-tauri/tauri.test.conf.json` : identité `studio.pamal.hangar.test`, fenêtre « Hangar Test », coffre « Hangar Test », sans mise à jour automatique). Les deux apps tournent en même temps : ne jamais fermer, relancer ni modifier l'app installée pour un test. **Claude gère tout l'environnement de test** : il le lance quand il faut tester, le laisse ouvert tant que l'utilisateur essaie, puis l'arrête (processus `target\debug\hangar.exe`, Vite, `tauri dev`) et lance `npm run test-env:clean` quand l'utilisateur a fini ou que le travail est terminé. L'utilisateur n'a aucune commande à taper.
- **Le dépôt GitHub est public** : rien de personnel dans ce qui est commité ou poussé (chemins locaux avec le nom d'utilisateur, adresse e-mail, clés, jetons, journaux, captures avec des données privées). Vérifier le diff avant chaque push.
- **Ne jamais supprimer de fichiers de l'utilisateur.** « Masquer » cache un jeu dans Hangar, rien de plus. Seule exception : « Désinstaller », après confirmation dans Hangar, supprime le dossier du jeu connu de son launcher et ses manifestes (`src-tauri/src/manage.rs`, avec ses garde-fous).
- **Accessibilité** : vrais `<button>`, `<input>` avec `<label>`, `aria-label` sur les boutons-icônes, focus visible, navigation clavier, respect de `prefers-reduced-motion`.

## Commandes

```bash
npm install            # dépendances frontend + CLI Tauri
npm run dev            # lance l'app dans l'environnement de test séparé (Hangar Test)
npm run test-env:clean # supprime l'environnement de test (données, comptes, démarrage auto)
npm run build          # exe + installeur NSIS dans src-tauri/target/release
npm run mod            # compile le mod Hangar MC pour chaque version (mod/<version>/ + cœur mod/common, JAVA_HOME = JDK 25) vers src-tauri/resources/mods
npm run verify         # check + tests + cargo test + clippy + tirets cadratins, sortie courte
npm run check          # svelte-check + tsc
npm run test           # tests frontend (vitest)
cd src-tauri && cargo test && cargo clippy -- -D warnings
```

Hors de Windows, `npm run dev:web` lance le frontend seul dans un navigateur avec des données de démo (mock des commandes Tauri, voir ARCHITECTURE.md). Utilise-le pour itérer sur l'UI.

## Façon de travailler

- À la fin de chaque changement : `npm run verify`, puis un commit avec un message clair en français.
- Après un changement visuel, compare l'UI à la maquette (`npm run dev:web` + capture). Les écarts visibles sont des bugs.
- La détection des stores est dans `src-tauri/src/scanner/` (un fichier par store) : améliore-la, ne repars pas de zéro.
- Si une information manque dans les docs, choisis l'option la plus simple qui respecte la maquette, note ton choix dans `docs/DECISIONS.md` et continue.

## Publier une version

Seulement sur demande (ou mot-clé « PUSH RELEASE ») : lis la procédure en tête de `docs/RELEASES.md` (jusqu'à « ## Historique », plus la dernière entrée pour le ton). Version toujours `patch`. **Chaque version ajoute son entrée en haut de l'historique, avant `npm version`.**
