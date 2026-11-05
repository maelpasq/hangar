# Hangar - décisions

Choix faits quand la documentation ne tranchait pas. Le plus simple qui respecte la maquette.

## Interface (frontend)

- **Icônes** : pas de dépendance `lucide-svelte`. Le composant `Icon.svelte` reprend les chemins SVG exacts de la maquette (trait 1,8, bouts arrondis, style Lucide) et ajoute dans le même style les quelques icônes absentes de la maquette (oeil, corbeille, croix, envoi, alerte, profil).
- **Pastille profil** : aucune source fiable pour le nom de l'utilisateur, la pastille affiche une icône de profil au lieu d'une initiale.
- **Chronomètre** : « mm:ss », puis « h:mm:ss » au-delà d'une heure de jeu.
- **Temps de jeu** : « N h » arrondi ; « N min » sous une heure ; « 0 h » pour un jeu jamais lancé. Dernière session « Jamais » si aucun lancement.
- **Jaquettes** : chaîne `library_600x900_2x` (shared) puis `library_600x900` (shared) puis `library_600x900_2x` (cdn.cloudflare), puis `header.jpg` en mode paysage, puis jaquette générée. Les jaquettes ne sont demandées qu'à l'approche de l'écran (IntersectionObserver, marge 400 px).
- **Carrousel** : un jeu n'y entre qu'une fois les bannières des jeux précédents connues, pour que l'ordre ne bouge pas pendant le chargement. Sans aucune bannière disponible, le carrousel est masqué.
- **Les plus joués** : masqué tant qu'aucun temps de jeu n'est enregistré ; une rangée « Ta bibliothèque » le remplace.
- **Bannière de la page de jeu** : fondu en bas par un masque CSS plutôt qu'un dégradé vers une couleur unie, pour ne pas laisser de bord visible sur la lumière d'ambiance.
- **Annuler le lancement** : ferme l'overlay seulement. Le launcher a déjà reçu l'ordre ; si le jeu démarre quand même, son suivi continue normalement.
- **Masquer** : un jeu masqué garde son statut de favori (il réapparaît tel quel avec « Annuler » ou « Afficher »).
- **Clic / double-clic** sur une jaquette : le clic simple attend 220 ms pour laisser passer un éventuel double-clic (lancement).
- **Grille virtualisée** : au-delà de 150 jeux, seules les rangées visibles (plus 2 de marge) sont rendues ; la cascade d'apparition est limitée au premier écran.
- **Raccourcis supplémentaires** : Échap ou Alt Gauche sur la page de jeu reviennent en arrière ; Maj F10 ou la touche Menu ouvrent le menu contextuel d'une jaquette.

## Backend (Rust)

- `state.json` corrompu : renommé en `state.corrompu-<ms>.json` (jamais supprimé), puis Hangar repart d'un état vide. Les migrations de format sont faites côté frontend (`normalizeState`), le backend renvoie le JSON brut.
- Le cache de bibliothèque (`library.json`) et celui des tailles (`sizes.json`) sont dans `%LOCALAPPDATA%\studio.pamal.hangar\cache\`, les icônes d'exe dans `cache\icons\`.
- `import_cover` crée `<hash>-<horodatage>.<ext>` (évite le cache du navigateur) et supprime les anciennes copies faites par Hangar pour ce jeu, jamais l'image d'origine.
- Un 404 (ou toute erreur 4xx, ou une réponse qui n'est pas une image) crée un `.miss` valable 7 jours ; une erreur réseau n'en crée pas. Taille maximale d'une image : 25 Mo.
- Suivi des processus : un jeu sans dossier d'installation est suivi via le dossier de son exe ; un dossier racine (`C:\`) est refusé ; les exe des launchers (Riot, GOG Galaxy, Battle.net...) sont exclus. La session va de la première à la dernière détection du processus.
- `launch_game` ne renvoie jamais d'erreur : les échecs passent par l'événement `launch://failed`.
- Parseur VDF : une ligne qui ouvre un bloc n'est plus prise pour une valeur.
- Riot : `LeagueClient.exe` compte comme League of Legends.
- Xbox : `ExecutableList` de `MicrosoftGame.config` alimente `processNames`.
- « Annuler » pendant un lancement ferme l'overlay mais ne coupe pas le suivi : un launcher déjà sollicité ne peut pas être annulé.

## Identité visuelle

- Le logo de la DA est redessiné en SVG (plutôt que découpé dans l'image) pour rester net à toutes les tailles, de 16 px (favicon) à 1024 px. Seul le texte « Hangar » est extrait de l'image, faute de connaître la police exacte.
- Icône d'app : le logo sur une tuile sombre arrondie, pour rester lisible sur une barre des tâches claire comme sombre.
- La couleur d'accent par défaut de l'interface reste `#7c6cff` (maquette validée) ; le violet du logo est un peu plus saturé.

## Jeux installés hors store

- Nouveau détecteur (`scanner/installed.rs`) : raccourcis `.lnk` du menu Démarrer et du Bureau + clés de désinstallation. Un exe est un jeu si son raccourci est rangé dans un dossier « Jeux » / « Games » (signal fort), si c'est un launcher de jeu connu, si son éditeur est un éditeur de jeux, ou si son dossier porte un marqueur de moteur (Unity, Unreal, Godot, Steamworks, EOS, FMOD, PhysX, anti-triche...).
- Ces jeux vont dans le store « Local », pour ne rien changer à l'interface.
- Exclus : désinstalleurs, exe de Windows et de `WindowsApps`, launchers de stores (même rangés dans « Jeux »), jeux déjà déclarés par un store, et tout exe situé dans le dossier d'un jeu déjà trouvé.
- Le suffixe « Launcher » est retiré du nom affiché (« Hytale Launcher » devient « Hytale », lancé via « Hytale Launcher ») ; l'identifiant suit le dossier stable du jeu pour que le temps de jeu survive aux mises à jour.
- Correction Epic : un `MainGameAppName` vide n'est plus pris pour un DLC (Fortnite et Surviving Mars manquaient).

## Données réelles des stores et images

- Temps de jeu, dernière session : le plus élevé entre la mesure de Hangar et le store (Steam `localconfig.vdf`, GOG Galaxy `galaxy-2.0.db`). Epic, Ubisoft, Riot, Xbox et les jeux hors store ne gardent rien en local : seul Hangar mesure.
- Taille : donnée par le store quand elle existe (Steam `SizeOnDisk`, Epic `InstallSize`, `EstimatedSize` du registre), sinon calcul du dossier. Date « Ajouté » : date d'installation, sinon première détection.
- Genre : API `appdetails` de Steam en français (commande `game_info`, en cache), pour les jeux qui ont un appid Steam.
- Jaquettes et bannières (`find_artwork`) : image native du store (Epic, GOG, Ubisoft via gamesdb, Xbox), puis Steam, puis SteamGridDB si une clé est saisie dans les Paramètres.
- Jaquettes des jeux hors Steam : recherche par nom sur le Microsoft Store (titre exact, type « Game ») entre Steam et SteamGridDB, sans clé (VALORANT, Roblox...). Ce qui n'existe sur aucune source reste en jaquette générée avec l'icône de l'exe, ou passe par SteamGridDB.
- Barre latérale : logo de chaque store (tracés Simple Icons, CC0, dans `src/lib/store-logos.ts`) teinté de sa couleur, à la place du point de la maquette. Local et Ajoutés gardent les icônes dossier et plus.

## macOS et mise à jour intégrée

- Même code pour Windows et macOS. Détection Mac : Steam et Epic dans `~/Library/Application Support`, Riot dans `/Users/Shared` (même format qu'en Windows), apps de `/Applications` (et un niveau de sous-dossiers) dont `LSApplicationCategoryType` est une catégorie Jeux, `goggame-*.info` pour GOG. Ubisoft, EA, Battle.net et Xbox : pas de détection Mac (pas de données locales simples).
- Lancement Mac : un binaire est lancé directement, le reste (URI, `.app`, dossier) passe par `open`. Arrêt d'un jeu : `kill` (SIGTERM).
- Le suivi de processus compare les chemins avec des `\` partout, pour les chemins Mac en `/` aussi.
- Fenêtre Mac : fenêtre native (coins arrondis, ombre) avec les trois boutons natifs en surimpression en haut à gauche (`titleBarStyle: Overlay`, `tauri.macos.conf.json`). Les boutons maison réduire / agrandir / fermer sont masqués sur Mac, et la barre latérale laisse 56 px en haut pour les boutons natifs (bande déplaçable).
- Mise à jour : `tauri-plugin-updater` + releases GitHub (`maelpasq/hangar`). Recherche discrète au démarrage (un toast si une version existe, rien si hors ligne), bouton « Mettre à jour » dans la barre du haut quand une version est disponible, et section Paramètres > Mise à jour pour vérifier à la main.
- Version unique dans `package.json` (`tauri.conf.json` pointe dessus) : `npm version` + `git push --follow-tags` publie. Les artefacts signés ne sont produits qu'en release (`tauri.release.conf.json`), pour que `npm run build` local marche sans la clé privée.
- App Mac non signée par Apple (pas de compte développeur) : premier lancement par clic droit > Ouvrir.


## Signature du code Windows

- Reporté (novembre 2026) : pas de demande SignPath pour l'instant, l'exe reste non signé (avertissement SmartScreen expliqué dans le README). Option retenue le jour venu : SignPath Foundation (gratuit pour l'open source). Microsoft Artifact Signing n'accepte pas les particuliers en France ; un certificat Certum demande de signer depuis le PC à chaque release.
- Gardés : licence MIT (`LICENSE`, copyright pamal Studio) et section Confidentialité du README. Retirés en attendant : la section « Code signing policy » (attribution SignPath, rôles) et son lien dans les releases, à remettre lors de la demande.
- Éditeur de l'app : « pamal Studio » (`bundle.publisher`). L'installeur range désormais son chemin d'installation sous `HKCU\Software\pamal Studio\Hangar` ; l'ancienne clé `Software\pamal\Hangar` reste orpheline, sans effet (même dossier d'installation par défaut).
- Le branchement dans `release.yml` attend l'accord de SignPath (identifiants d'organisation, de projet et de politique de signature, jeton d'API en secret).

## Installeur Windows aux couleurs de Hangar

- `installer/` : une petite app Tauri (`hangar-setup.exe`, fenêtre sans cadre 860 x 520) qui reprend la DA (vagues violettes, logo, Geist, accent `#7c6cff`) et un mur de jaquettes générées qui défile avec les puces des stores. Trois écrans : accueil (Installer / Mettre à jour, emplacement modifiable), progression, terminé (Lancer Hangar). Une erreur propose Réessayer.
- Elle embarque l'installeur NSIS de Tauri (`include_bytes!`, trouvé par `build.rs` dans `src-tauri/target/release/bundle/nsis/`) et l'exécute en silencieux (`/S /D=<dossier>`, `CREATE_NO_WINDOW`). Raccourcis, désinstalleur, registre et fermeture de Hangar s'il tourne restent gérés par NSIS : rien n'est réécrit.
- NSIS silencieux ne donne pas d'avancement : la barre avance vers 90 %, puis termine à la fin réelle (1,8 s minimum à l'écran).
- L'updater intégré continue d'utiliser le NSIS (`latest.json` inchangé). La release ajoute `Hangar-Setup.exe` (nom stable, lien direct possible).
- Sans WebView2 (rare sur Windows 10), la fenêtre ne peut pas s'ouvrir : l'installeur NSIS classique prend le relais, il sait installer WebView2.
- Les données WebView2 de l'installeur vont dans `%TEMP%`, pour ne rien laisser dans AppData.
- Désinstallation : celle de NSIS, inchangée.
- Thème clair / sombre / appareil : le bouton de la barre du haut (à la place de l'engrenage) fait défiler les trois modes, aussi réglables dans Paramètres > Apparence. Les couleurs passent par des tokens (`--ink`, `--glass`, `--popover`, `--strong`) redéfinis sous `[data-theme='light']`. Les zones posées sur une image (hero, overlay de lancement) portent `.on-dark` et gardent les couleurs sombres. Thème par défaut : sombre (la maquette).
- Pastille de profil retirée de la barre du haut (aucun compte dans Hangar). Couleur d'accent libre via un `<input type="color">` natif à côté des 5 pastilles.

## Jeux possédés non installés

- Sources locales uniquement (aucun appel réseau nouveau) : Steam `librarycache` + `localconfig.vdf` filtrés par `appinfo.vdf`, Epic `catcache.bin`, GOG Galaxy `galaxy-2.0.db`, Riot (jeux gratuits du client). Détail dans SPEC.md, section 2.
- Steam ne garde pas la liste des licences en clair (`licensecache` est chiffré). Le cache d'images de la bibliothèque couvre les jeux que le client a affichés au moins une fois. Une liste exhaustive demanderait l'API Web Steam (clé et nouvel hôte réseau) : non retenu pour l'instant.
- Ubisoft Connect (`cache\*.vdat` chiffrés), EA app, Battle.net et Xbox (compte en ligne) : pas de jeux non installés.
- Un jeu non installé garde l'id de sa version installée (`steam:<appid>`, `epic:<appName>`, `gog:<id>`, `riot:<produit>`) : le scan retire le doublon et garde la version installée, favoris et renommages suivent.
- `Game.notInstalled` (défaut `false`, compatible avec l'ancien cache). Commande `install_game` séparée de `launch_game` : pas de suivi de processus ni de lancement compté.
- Après une installation demandée, Hangar rescanne quand sa fenêtre reprend le focus (au plus toutes les 30 s), jusqu'à voir le jeu installé.

## Comptes des launchers

- Connexion facultative de Steam, GOG et Epic (Paramètres > Comptes des launchers) pour la liste complète des jeux possédés. Les jeux trouvés s'ajoutent au scan (même id = même jeu, l'installé gagne) et vont dans « À installer ».
- Sécurité, puisque le code est public :
  - Clés et jetons de rafraîchissement dans le coffre du système (crate `keyring` : Gestionnaire d'identification Windows, Trousseau macOS). Jamais dans `state.json`, `accounts.json`, les logs ni le frontend. `accounts.json` ne garde que la liste des jeux, le pseudo et la date de synchro.
  - Client HTTP dédié : HTTPS, liste fermée d'hôtes, aucune redirection suivie (un jeton ne part jamais ailleurs), messages d'erreur sans URL. Journaux de débogage de `ureq` et `rustls` coupés (ils contiennent les URL, donc la clé Steam).
  - Connexion GOG / Epic dans une fenêtre Tauri séparée, sans aucune permission (la capability ne vise que `main`), en navigation privée, limitée au HTTPS. Le code d'autorisation est intercepté à la navigation côté Rust. Pour Epic, la page de retour affiche le code en JSON : un script vérifie l'origine puis navigue vers `https://hangar.invalid/epic?code=...`, adresse réservée que Rust intercepte et annule. La page n'a jamais d'accès IPC.
  - Les identifiants venus des API (namespace, catalogItemId, appName, codes) sont validés (alphanumérique, `-`, `_`) avant d'entrer dans une URL ou une URI de launcher.
  - Liens d'aide via `open_link` et une liste fermée, pas d'ouverture d'URL libre depuis le frontend.
- GOG et Epic n'ont pas d'API publique pour les apps tierces : Hangar utilise les identifiants publics des clients GOG Galaxy et Epic Games Launcher, comme Heroic, Legendary et lgogdownloader. Ce ne sont pas des secrets de Hangar, mais c'est hors des conditions de ces services et ça peut cesser de marcher. Steam passe par l'API officielle avec la clé de l'utilisateur (Hangar n'embarque pas de clé).
- La déconnexion efface le jeton local, sans révocation côté service.
- Non retenus : Ubisoft et EA (API non officielles, mot de passe à faire transiter), Battle.net (aucune API de jeux possédés), Xbox (il faudrait enregistrer une app Hangar chez Microsoft, à faire par le mainteneur ; l'API ne liste que les jeux lancés).
