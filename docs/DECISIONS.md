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

## Launcher désinstallé

- Les données d'un launcher restent sur le disque après sa désinstallation (surtout sous macOS : mettre l'app à la corbeille garde `~/Library/Application Support/Steam`). Hangar exige donc le client lui-même avant de lire ces données : `steam.exe` ou `Steam.app`, `Epic Games Launcher.app` (macOS), GOG Galaxy (registre ou `GOG Galaxy.app`), exécutable du Riot Client. Sinon le launcher est « Non trouvé » et ses jeux n'apparaissent pas.

## Jeux web

- Onglet « Jeux web » : catalogue fixe des jeux navigateur connus (.io et classiques), dans `src/lib/web-games.json`, lu aussi par Rust (`include_str!`). Le frontend n'envoie qu'un identifiant à `open_web_game`, jamais une URL.
- Chaque jeu s'ouvre dans sa propre fenêtre Tauri (`web-<id>`), sans accès IPC (la capability ne vise que `main`), limitée au HTTPS. Pas d'iframe : la plupart de ces sites l'interdisent (`X-Frame-Options`). Pas de navigation privée, pour garder la progression et les réglages des jeux.
- Réseau : le jeu n'est contacté que quand l'utilisateur clique dessus. Les jaquettes sont embarquées (`src/assets/web-games/<id>.webp`, 640 x 400) : récupérées une fois sur le site officiel de chaque jeu (`og:image`, à défaut l'icône de l'appli web, posée sur un fond flou d'elle-même). Pas d'image valable : jaquette générée (dégradé + nom).
- Cookies et progression : les fenêtres de jeu partagent le profil WebView2 de Hangar (pas de navigation privée), donc les sites gardent connexion et sauvegardes entre deux lancements.
- Récents : `webPlayed` (id -> date du dernier lancement) dans `state.json`. Les jeux joués passent en tête, le reste suit l'ordre du catalogue.
- Activation : `prefs.webGames` vaut `null` tant que la question n'a pas été posée. Au démarrage, une fenêtre la pose : « Activer les jeux web ? » à la première ouverture (aucun `state.json`), « Les jeux web arrivent dans Hangar » avec un badge Nouveau pour ceux qui avaient déjà l'app. Pas de case dans l'installeur NSIS : la même question dans l'app couvre installation neuve, mise à jour et macOS. Fermer sans répondre reporte la question au lancement suivant. Réglable ensuite dans Paramètres > Général ; désactivé, l'onglet disparaît.

## Zone de notification, raccourci global, Discord

- Icône dans la zone de notification (barre des menus sous macOS), toujours présente : « Ouvrir Hangar », les 5 derniers jeux lancés, « Quitter Hangar ». Le frontend envoie la liste (`set_tray_recents`) ; Rust ne garde que les jeux connus. Un jeu choisi repasse par le frontend (`tray://launch`), donc par le même chemin que depuis la bibliothèque (overlay, suivi, temps de jeu).
- Fermer la fenêtre la cache (réglage « Garder Hangar dans la zone de notification », activé par défaut) ; « Quitter Hangar » dans le menu de l'icône ferme vraiment l'app. macOS : un clic sur l'icône du Dock rouvre la fenêtre.
- Raccourci global fixe Ctrl+Alt+H (⌃⌥H sous macOS, Cmd+Alt+H y masque déjà les autres apps) : affiche Hangar, ou le cache s'il est déjà devant. Plugin `tauri-plugin-global-shortcut`, utilisé seulement côté Rust (aucune permission JS). Raccourci pris par un autre programme : le réglage le signale.
- Discord Rich Presence : protocole IPC local de Discord (tube `\.\pipe\discord-ipc-N`, socket `discord-ipc-N` sous macOS), écrit à la main (une trame = op, taille, JSON) plutôt qu'avec une dépendance. Aucun appel réseau de Hangar : c'est l'app Discord qui publie. Désactivé par défaut (visible des amis). Il faut un identifiant d'application Discord (`presence::CLIENT_ID`), créé par le mainteneur sur le portail développeur Discord (renseigné le 6 novembre 2026) ; vide, le réglage est caché.
- Image de la présence Discord : l'adresse web d'origine de la jaquette affichée dans Hangar (gardée dans le cache des jaquettes), sinon le portrait Steam ; pour un jeu web, son fichier de `src/assets/web-games` sur le dépôt GitHub public (branche `main`). Discord télécharge l'image lui-même : Hangar n'appelle aucun site de plus. Aucune image en ligne (icône d'exe, jaquette générée) : logo Hangar. Une jaquette choisie à la main dans Hangar n'est pas reprise : Discord montre la jaquette automatique.

## Mode manette

- Écran plein écran par-dessus l'app (`ui.big`), pas un écran de navigation : on en sort pour retrouver l'endroit où on était.
- API Gamepad du navigateur (WebView2 et WKWebView), disposition « standard » : croix ou stick gauche (zone morte 0,5), A, B, X, Y, LB, RB, Start. Répétition à 380 ms puis toutes les 110 ms. Le dernier écouteur abonné reçoit les actions : le mode manette passe devant l'app, qui n'écoute que Start.
- Lecture seulement quand une manette est branchée (boucle `requestAnimationFrame` arrêtée sinon) et quand la fenêtre a le focus.

## Collections, filtres, désinstallation

- Collections dans `state.json` (`collections: { id, name, games[] }`), nettoyées au chargement (doublons, noms vides, 60 caractères). Les filtres de genre et de temps de jeu ne sont pas mémorisés.
- Désinstaller ouvre le launcher, jamais un désinstalleur lancé par Hangar : Steam `steam://uninstall/<id>`, GOG Galaxy la page du jeu, Epic le launcher (pas d'URI de désinstallation connue), les autres jeux Windows Paramètres > Applications installées (`ms-settings:appsfeatures`), macOS le dossier de l'app.
- Mises à jour des jeux, par store :
  - Steam, sur le disque : `StateFlags` du manifeste (2 requise, 256 / 512 / 1024 en cours, en pause, démarrée) ; reste à télécharger = `BytesToDownload - BytesDownloaded`.
  - Epic : sur le disque, un manifeste dans `Manifests\Pending` = mise à jour en cours. Avec le compte Epic connecté, la synchro (toutes les 6 h) lit aussi la dernière version de chaque jeu (`launcher-public-service-prod06`, `assets/Windows?label=Live`, comme Legendary / Heroic) et la compare à `AppVersionString`.
  - GOG : `buildId` du registre comparé à la liste publique des versions (`content-system.gog.com/products/<id>/os/windows/builds`, génération 2 puis 1), toutes les 6 h, sans compte, résultat dans `updates.json`. Une version locale absente de la liste ne compte pas comme une mise à jour (pas de faux positif).
  - Ubisoft, EA, Battle.net, Riot et Microsoft Store : rien à lire, ni en local ni par une API ouverte ; leurs launchers mettent à jour au lancement (ou tout seuls pour le Store). « Mettre à jour » ouvre le bon écran : téléchargements de Steam (`steam://open/downloads`), page du jeu dans GOG Galaxy, Epic, mises à jour du Microsoft Store (`ms-windows-store://downloadsandupdates`) ; pour les autres, un message explique que le launcher met le jeu à jour au lancement. Onglet « Mises à jour » dans la barre latérale et menu « Mises à jour » (icône avec pastille) en haut à droite, affichés seulement quand au moins un jeu attend ; le rescan au retour sur Hangar retire le jeu une fois à jour. Le bouton de mise à jour de Hangar lui-même devient « Mettre à jour Hangar » pour ne pas le confondre.
- Vérification automatique : rescan discret toutes les 10 min (même fenêtre cachée) et au retour sur la fenêtre, au plus toutes les 5 min, jamais pendant une partie. Une mise à jour qui apparaît s'annonce par une notification avec « Mettre à jour ». Steam ne marque un jeu qu'après avoir vérifié lui-même (client lancé) ; Epic et GOG suivent leur rythme de 6 h.
- Simulation pour l'environnement de test : `HANGAR_SIMULATE_UPDATES=1 npm run dev` marque trois jeux Steam / Epic / GOG / Xbox installés comme ayant une mise à jour (2,4 Go, 850 Mo, 120 Mo). Sans effet hors de l'identité `.test`, et rien n'est écrit dans les fichiers des launchers.
- Listes déroulantes : composant `Dropdown.svelte` (bouton `combobox` + `listbox`, `aria-activedescendant`) à la place de `<select>`, dont la liste native s'ouvrait en blanc sous Windows.

## Audit de sécurité (novembre 2026)

- Commandes qui reçoivent un chemin du frontend (`open_folder`, `exe_icon`, `folder_size`) : refusées si le chemin n'appartient à aucun jeu connu. Évite la lecture d'images ailleurs sur le disque et les chemins réseau `\serveur\...` (Windows y enverrait l'identité de l'utilisateur).
- Images : redirections HTTP suivies à la main, chacune vérifiée contre la liste des hôtes autorisés ; la clé SteamGridDB ne part qu'avec la première requête.
- Fenêtres des jeux web : pop-ups et téléchargements bloqués. Fenêtres de connexion : téléchargements bloqués (pop-ups laissées, certaines connexions en ont besoin ; elles n'ont aucun accès à Hangar).
- CSP : `object-src`, `frame-src`, `base-uri` et `form-action` à `'none'`.
- Riot : les noms de dossier lus dans `Metadata` (passés en arguments au Riot Client) limités à `[a-z0-9_-]`.
- CI : actions GitHub épinglées par commit (elles voient la clé de signature des mises à jour), `npm ci` (lockfile respecté), `persist-credentials: false`, `build.yml` en lecture seule.
- Dépendances : `cargo audit` sans vulnérabilité (avertissements « non maintenu » sur des crates Linux seulement) ; `npm audit` : rien dans ce qui est livré, 2 alertes faibles dans les outils de développement.

## Durée des builds et des releases

- Mesure (release 1.2.0) : macOS 22 min, presque tout dans la compilation Rust (deux architectures, sans cache, Mac Intel) ; Windows 11 min (app 6,5 min, installeur Hangar 4 min).
- Cache Rust (`Swatinem/rust-cache`, clé partagée `release`) : `build.yml` l'enregistre sur `main`, `release.yml` le relit (un tag peut lire le cache de la branche par défaut). Pour qu'il serve tel quel, `build.yml` compile macOS en universel comme la release. Seul le code de Hangar est recompilé à une release. Cache npm de `setup-node` en plus.
- Profil release : LTO `thin` au lieu de `fat` + `codegen-units = 1`. Mesuré en local sur le code de la 1.2.1 : recompiler Hangar passe de 79 s à 20 s ; l'exe passe de 7,3 à 8,2 Mo. `opt-level = "s"`, `strip` et `panic = "abort"` restent (petit téléchargement).
- `build.yml` : un nouveau push annule le build en cours sur la même branche.
- Numéro de version : toujours `patch` (+0.0.1), règle de l'utilisateur, voir `docs/RELEASES.md`.
- macOS : la création du `.dmg` échoue parfois sur les Mac de GitHub (`hdiutil: couldn't eject - Resource busy`, Spotlight ou XProtect gardent l'image ouverte). `release.yml` coupe Spotlight et XProtect avant l'empaquetage et refait un essai sur macOS si le premier échoue (l'app est déjà compilée, seul l'empaquetage est refait). `build.yml` ne crée pas de `.dmg`.
- Notes de chaque release GitHub : la section de sa version dans `docs/RELEASES.md`, puis la ligne de téléchargement.
- Éditeur « pamal Studio » partout : `bundle.publisher` et `copyright` (app, installeur Hangar), licence, et « Société » de l'installeur NSIS, que le modèle de Tauri ne remplit pas (ajoutée par `src-tauri/windows/hooks.nsh`). Les commits de ce dépôt sont signés « pamal Studio » avec l'adresse anonyme GitHub (configuration Git locale), aucun nom de personne.

## Site de téléchargement

- `site/index.html` : une seule page statique, sans framework ni build, dans la DA de l'installeur Hangar (lumière violette, grain, logo, bouton accent). Publiée sur GitHub Pages par `.github/workflows/site.yml`, qui y recopie au déploiement les captures (`docs/images/`), la police et le logo de l'installeur et le favicon : une seule source pour ces fichiers.
- Bouton principal selon le système du visiteur (Windows par défaut). Windows : lien fixe `releases/latest/download/Hangar-Setup.exe`. macOS : le nom du `.dmg` contient la version, la page le lit dans la dernière release via l'API publique de GitHub ; sans réponse, le lien mène à la page de la dernière release.
- Pas de logos d'OS ni de stores (règle de la DA) : icônes neutres et points de couleur.
- Refonte de novembre 2026, selon les principes d'interface d'Apple : barre du haut translucide (le filet n'apparaît qu'au défilement), fonctions en mosaïque (la taille des tuiles fait la hiérarchie), aperçu en contrôle segmenté, typo avec approche et interligne propres à chaque taille. Mouvement : ressort sans rebond (`linear()`, repli en `cubic-bezier`), retour visuel à l'appui des boutons, capture du héros qui se redresse avec le défilement (CSS `animation-timeline`, rien sans support). Plus aucune animation en boucle (les vagues qui dérivaient et l'étoile qui scintillait sont fixes). Respecte `prefers-reduced-motion` (fondus courts), `prefers-reduced-transparency` (barre pleine) et `prefers-contrast: more`. Site sombre uniquement, comme la DA et les captures.

## Première ouverture

- Installation neuve (aucun état enregistré) : assistant en quatre étapes fixes (launchers, jeux locaux, couleur et thème, jeux web), points de progression cliquables, « Suivant », « Tout passer » et « Tout activer ». Chaque choix s'applique tout de suite. « Tout passer » ou fermer garde les choix déjà faits et laisse les jeux web désactivés. « Tout activer » active tous les launchers, les jeux locaux et les jeux web, sans toucher à la couleur.
- Montré une fois à tout le monde, installation neuve comme mise à jour (champ `onboarded` de l'état, absent chez les anciennes versions). Qui avait déjà Hangar y retrouve ses propres réglages : « Tout passer » ne change rien chez lui. Qui n'avait jamais eu la question des jeux web voit « Nouveau » à leur étape, ce qui remplace l'ancienne pop-up des jeux web (supprimée). Relançable : Paramètres > Général > « Configuration de départ ».

## Launchers invisibles

- Les launchers restent nécessaires (DRM de Steam, Epic, Ubisoft, EA, Battle.net, Riot) : Hangar les garde invisibles au lieu de s'en passer. Pendant un lancement ou une mise à jour, `src-tauri/src/veil.rs` cache (`SW_HIDE`) chaque fenêtre visible d'un processus de launcher (liste du tracker) ; ils restent dans la zone de notification. Le voile s'arrête 10 s après la détection du jeu, ou au bout de 95 s.
- Jeu jamais détecté (le launcher attend une connexion, un contrat...) : les fenêtres cachées sont réaffichées. Le toast « lancé » et celui des mises à jour ont un bouton « Afficher le launcher » pour les ramener plus tôt.
- Liens `steam://` ouverts par `steam.exe -silent -- "lien"` : Steam démarre dans la zone de notification sans sa fenêtre principale.
- Mises à jour : le lien de mise à jour réveille le launcher, caché par le voile, qui télécharge en arrière-plan.
- Pas de voile pour l'installation ni la désinstallation par un launcher : leurs fenêtres demandent une confirmation (dossier, suppression). Hangar les fait donc lui-même quand c'est possible (`src-tauri/src/manage.rs`, Windows) :
  - Installation Steam : manifeste `appmanifest_<id>.acf` (`StateFlags` 1026, dossier tiré de `appinfo.vdf`) écrit dans la bibliothèque qui a le plus de place, puis Steam redémarré avec `-silent` (il ne relit les manifestes qu'au démarrage) ; refusé pendant une partie Steam (`RunningAppID`). Progression lue dans le manifeste (`BytesDownloaded` / `BytesToDownload`) toutes les 2 s. Un manifeste sans le bit 4 (installé) n'est pas un jeu installé pour le scanner.
  - Désinstallation Steam : Steam fermé (`-shutdown`), suppression de `steamapps/common/<installdir>` et du manifeste, Steam relancé en silencieux s'il tournait.
  - Désinstallation Epic : launcher fermé, suppression du dossier `InstallLocation` du `.item` (refusée pour une racine, un dossier système ou le dossier personnel), du `.item` et de l'entrée de `LauncherInstalled.dat`.
  - GOG : désinstalleur officiel `unins000.exe /VERYSILENT`.
- Dossier d'installation : avant d'installer, Hangar demande où (fenêtre « Installer X ») parmi les dossiers du launcher, celui par défaut en tête, avec la place libre de chaque disque (et « trop peu de place » quand la taille du jeu est connue). Steam : ses bibliothèques (`libraryfolders.vdf`), la plus libre par défaut. Epic : `DefaultAppInstallLocation` de `GameUserSettings.ini` (section `[Launcher]`), les dossiers qui contiennent déjà des jeux Epic et `Program Files\Epic Games`. Le backend n'accepte qu'un dossier de cette liste, recalculée (un disque débranché disparaît). Steam télécharge dans la bibliothèque choisie ; pour Epic, Hangar écrit le dossier comme emplacement par défaut (Epic fermé avant, il réécrit ses réglages en quittant), puis ouvre sa fenêtre d'installation, déjà réglée. GOG Galaxy et Riot n'ont pas de réglage fiable : leur propre fenêtre demande le dossier. Mode manette : pas de fenêtre, le dossier par défaut.
- Garde-fous : Epic n'est jamais fermé pendant un téléchargement (manifeste dans `Pending` ou installation incomplète) : la désinstallation est refusée et le dossier est laissé au choix dans la fenêtre d'Epic. Un seul redémarrage de Steam à la fois. Téléchargement Steam resté à 0 % après 5 min : toast (Steam déconnecté, hors ligne ou file d'attente). « Installer » sur un jeu Steam dont le téléchargement tourne déjà reprend simplement sa progression.
- Restent dans leur launcher : l'installation Epic (fenêtre de confirmation, dossier déjà choisi), GOG, Riot et Xbox (il faudrait réécrire leur téléchargeur) et la désinstallation des jeux Ubisoft, EA, Battle.net et Riot. macOS garde l'ancien comportement.

## Linux (CachyOS)

- Paquet : **AppImage** seul (`tauri.linux.conf.json`), construit sur Ubuntu 22.04 (glibc ancienne) pour tourner sur les distributions récentes dont CachyOS / Arch. Le bouton « Mettre à jour » marche avec l'AppImage (`latest.json` reçoit `linux-x86_64` par `tauri-action`). Pas de .deb / .rpm / PKGBUILD.
- Ouverture des liens, dossiers et launchers par `xdg-open` (au lieu de `open` sous macOS) ; un exécutable est lancé directement.
- Steam : `~/.local/share/Steam`, `~/.steam/steam` puis Flatpak (`~/.var/app/com.valvesoftware.Steam/...`), client reconnu par `steam.sh`. Les jeux Proton sont des jeux Steam comme les autres (lancés par `steam://`).
- Pas de détection Epic, GOG Galaxy, Ubisoft, EA, Battle.net, Riot ni Xbox sous Linux (pas de launcher officiel). Heroic, Lutris et Bottles ne sont pas encore lus.
- Comptes : coffre Secret Service (KWallet ou GNOME Keyring) via `keyring` (`sync-secret-service`).
- Installation et désinstallation pilotées par Hangar (Steam, Epic) restent réservées à Windows ; sous Linux, « Désinstaller » ouvre Steam ou le dossier du jeu.

## Flou et animations rapides sur tous les systèmes

- Images floutées (jaquettes en paysage, lumière d'ambiance, bannière sans visuel, écran de lancement, mode manette) : plus de `filter: blur()`. `BlurImage.svelte` réduit l'image par moitiés dans une toile de quelques pixels, une fois par image (cache partagé), et le navigateur l'agrandit en lissant. La toile n'est jamais relue : pas de souci d'origine.
- Halo de l'écran de lancement : dégradé radial au lieu d'un fond flouté.
- Flou d'arrière-plan du bouton favori seulement quand il se voit ; retiré du badge de la jaquette générée (posé sur un dégradé, il ne changeait rien).
- Animations limitées à `transform` et `opacity` : barres de progression en `scaleX`, pastille « en jeu » en disque qui grandit, reflet de chargement qui glisse, ombre colorée du survol des jaquettes préparée d'avance (fondu d'opacité).
- Plus de règles propres à Linux pour le flou : le même rendu partout.
- Linux, jeux locaux : binaires ELF, scripts `.sh`, AppImage et `.exe` (lancés par Wine) dans les dossiers de jeux ; raccourcis `.desktop` de la catégorie Game (lancés par `gio launch`), sans les jeux Steam ni les launchers.
- Linux, « À installer » : puce « Compatibles Linux ». Un jeu compte s'il a une version Linux native (Steam `common.oslist`, GOG `worksOn.Linux`) ou s'il est Vérifié / Jouable sur Steam Deck (`steam_deck_compatibility.category` 3 ou 2 dans `appinfo.vdf`, donc via Proton). Epic, Riot et les autres : jamais compatibles. Pas de ProtonDB (réseau non autorisé).
- Coins arrondis de la fenêtre : macOS (fenêtre native) et Windows 11 (fenêtre sans bordure avec ombre) les arrondissent eux-mêmes. Linux : fenêtre transparente (`tauri.linux.conf.json`) et `clip-path: inset(0 round 10px)` sur `body` (classe `rounded`), retiré quand la fenêtre est agrandie ou en mode manette. Windows 10 reste à angles droits (le système n'arrondit pas).
- Linux, coins arrondis : `body` aussi sans fond (`.app` porte le fond). Sinon WebKit reporte le fond de `body` sur toute la fenêtre, hors de la découpe `clip-path`, et les coins restent opaques (vérifié avec le moteur WebKit de Playwright ; Chromium, lui, ne le fait pas).

## Linux : pas de flou d'arrière-plan (2026-11-09)

Le retrait des `backdrop-filter` sous Linux (classe `linux`, `base.css`) avait été annulé par « Flou et animations rapides sur tous les systèmes » avant toute release : aucune version Linux publiée ne l'avait. Rétabli. Les images floutées restent en toile (`BlurImage`), le même rendu partout ; seuls les flous d'arrière-plan, recalculés à chaque image par WebKitGTK, sont retirés sous Linux.

## Signaler un bug depuis Hangar (2026-11-09)

Bouton insecte dans la barre du haut : petite fenêtre (titre, description et capture facultatives). L'envoi part du backend (`report.rs`) vers un webhook Discord privé du développeur, avec la version de Hangar et le système. L'adresse du webhook n'est pas dans le dépôt : elle est lue au build (`HANGAR_BUG_WEBHOOK`, secret GitHub de `release.yml`) ; sans elle, l'envoi est refusé avec un message. Elle reste extractible de l'app : en cas d'abus, on la régénère dans Discord. Le formulaire GitHub (trop long pour un joueur) reste pour qui le veut.

## Progression des téléchargements Steam (2026-11-09)

Steam n'écrit son manifeste (`appmanifest_<id>.acf`) qu'au départ, en pause et à la fin, et préalloue les fichiers à leur taille finale : ni `BytesDownloaded` ni la taille des dossiers n'avancent pendant un téléchargement. Hangar compte donc les octets écrits sur le disque par le processus Steam depuis le début du suivi, ajoutés à `BytesStaged`, sur `BytesToStage` (99 % au plus avant la fin). La pause garde les mêmes `StateFlags` et la valeur `Updating` du registre n'est pas fiable : elle se lit dans `logs/content_log.txt` (dernière ligne « state changed » du jeu, « Suspended »). Steam ne laisse pas une autre app mettre en pause, reprendre ou annuler : le bouton « Afficher dans Steam » ouvre sa page des téléchargements. Les téléchargements en cours sont repris au démarrage de Hangar et au retour sur sa fenêtre.

## Correctifs de dépendances sans version corrigée (9 nov. 2026)

glib 0.18 (imposé par Tauri 2) et deepmerge 4.3.1 n'ont pas de version corrigée publiée pour RUSTSEC-2024-0429 et GHSA-gcqx-w48m-w2h4. Plutôt que d'ignorer les alertes, une copie corrigée est dans `patches/` (`[patch.crates-io]` et `overrides` npm), voir `patches/README.md`. À retirer dès qu'une version corrigée existe en amont.

## Version Linux en pause (9 nov. 2026)

La version Linux avait trop de bugs : elle est désactivée en attendant d'être refaite. La release suivante publie encore l'AppImage, pour que les installations existantes la reçoivent par mise à jour : sous Linux, Hangar n'affiche plus que `src/lib/screens/LinuxBlocked.svelte` (`?linux` pour le voir avec `npm run dev:web`), et le backend s'arrête là (`main.rs`, `cfg!(target_os = "linux")`) : pas de scan, pas d'icône, fermer quitte, démarrage avec le système retiré. L'écran garde la recherche de mise à jour : `release.yml` continue de construire l'AppImage pour que `latest.json` ait toujours une entrée Linux, et la future version Linux arrivera chez eux d'elle-même. Le site et le README ne proposent plus Linux. Le CI compile et teste toujours Linux. Pour réactiver : retirer ces deux blocages et rétablir la carte Linux du site et la section du README.
