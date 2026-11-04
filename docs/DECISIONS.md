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
