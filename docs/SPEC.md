# Hangar - spécification fonctionnelle

## 1. Objectif

Une seule app pour retrouver et lancer tous les jeux installés sur le PC, quel que soit le store, avec une interface moderne, épurée et rapide. L'utilisateur ne configure rien : au premier démarrage, la bibliothèque est déjà remplie.

## 2. Sources de jeux et lancement

| Source | Détection | Lancement |
|---|---|---|
| Steam | Registre `HKCU\Software\Valve\Steam\SteamPath` puis `steamapps\libraryfolders.vdf` et `appmanifest_*.acf` de chaque bibliothèque | `steam://rungameid/<appid>` |
| Epic Games | `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests\*.item` (JSON). Ignorer les installations incomplètes, les DLC (`MainGameAppName` différent de `AppName`) et les non-jeux (`AppCategories` sans `games`) | `com.epicgames.launcher://apps/<ns>%3A<catalogItemId>%3A<appName>?action=launch&silent=true` |
| GOG | Registre `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\*` (ignorer `dependsOn` = DLC) | GOG Galaxy si installé : `GalaxyClient.exe /command=runGame /gameId=<id> /path="<path>"`, sinon l'exe du jeu |
| Ubisoft Connect | Registre `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\<id>\InstallDir`, nom via la clé de désinstallation `Uplay Install <id>` | `uplay://launch/<id>/0` |
| EA app | Clés de désinstallation (HKLM 32/64 bits + HKCU) dont le dossier contient `__Installer\installerdata.xml` ou dont l'éditeur est Electronic Arts | Exe principal du jeu (il ouvre l'EA app lui-même) |
| Battle.net | Clés de désinstallation dont `UninstallString` contient `Battle.net` et `--uid=` ; table uid vers code produit | `Battle.net.exe --exec="launch <CODE>"`, sinon `battlenet://<CODE>` |
| Riot Games | `%PROGRAMDATA%\Riot Games\RiotClientInstalls.json` (`rc_default`) et `Metadata\<produit>.<patchline>\*.product_settings.yaml` | `RiotClientServices.exe --launch-product=<p> --launch-patchline=<pl>` |
| Xbox / Microsoft Store | PowerShell `Get-AppxPackage`, ne garder que les paquets qui contiennent `MicrosoftGame.config` | `shell:AppsFolder\<PackageFamilyName>!<AppId>` |
| Dossiers locaux | Dossiers choisis par l'utilisateur : un jeu par sous-dossier, exe choisi par heuristique (voir ARCHITECTURE.md) avec **priorité au launcher du jeu s'il existe** | L'exe trouvé |
| Ajout manuel | L'utilisateur choisit un `.exe`, `.lnk`, `.url` ou `.bat`, un nom et des arguments | Tel quel |

### Jeux possédés non installés

Les jeux du compte qui ne sont pas installés ont leur onglet à part, « À installer » dans la barre latérale (avec le nombre de jeux, puces par store, tri). La Bibliothèque, les stores de la barre latérale et l'accueil ne montrent que les jeux installés ; la recherche et les Favoris montrent les deux (jaquette atténuée, « Non installé »). Le bouton devient « Installer ». Steam et Epic (Windows) : Hangar demande d'abord dans quel dossier du launcher installer, avec la place libre de chaque disque. Jeux Steam (Windows) : Hangar prépare le téléchargement et redémarre Steam en arrière-plan, sans fenêtre ; le bouton affiche « Installation 42 % » puis un toast « prêt » avec « Jouer ». Autres stores : l'installation s'ouvre dans le launcher, sans suivi de partie. Au retour sur Hangar (au plus une fois toutes les 30 s), un scan les fait passer en « installé » dès que le launcher a fini. Option Paramètres > Comportement « Afficher les jeux non installés » (activée par défaut) : coupée, l'onglet disparaît.

| Source | Liste des jeux du compte (fichiers locaux, aucun réseau) | Installation |
|---|---|---|
| Steam | Apps de `appcache\librarycache` (images de bibliothèque mises en cache par le client) et apps avec un temps de jeu dans `localconfig.vdf`, filtrées par `appcache\appinfo.vdf` (type `game`) | `steam://install/<appid>` |
| Epic Games | `catcache.bin` (catalogue local du launcher) : catégorie `games`, hors DLC (`mainGameItem`), plateforme du système | `com.epicgames.launcher://apps/<ns>%3A<catalogItemId>%3A<appName>?action=install` |
| GOG | Base de GOG Galaxy `galaxy-2.0.db` : titres des `releaseKey` `gog_<id>` de `LibraryReleases`, hors DLC (`ReleaseProperties.isDlc`) | `goggalaxy://openGameView/<id>` |
| Riot Games | Si le Riot Client est installé : League of Legends, VALORANT, Legends of Runeterra, 2XKO (gratuits) | `RiotClientServices.exe --launch-product=<p> --launch-patchline=live` |
| Ubisoft, EA, Battle.net, Xbox | Pas de liste locale lisible (cache chiffré ou compte en ligne) : seuls les jeux installés | - |

Règles communes :

- Un même dossier d'installation détecté par deux sources n'apparaît qu'une fois (priorité : Steam, Epic, GOG, Ubisoft, EA, Battle.net, Riot, Xbox, local, manuel).
- Ignorer les outils et redistribuables Steam (Steamworks Common Redistributables, Proton, Steam Linux Runtime, SDK, serveurs dédiés, bandes-son).
- Le scan complet doit prendre moins de 3 secondes sur un PC avec 100 jeux (hors PowerShell Xbox, qui tourne en parallèle et met à jour la liste quand il répond).
- Au démarrage, la dernière bibliothèque connue s'affiche instantanément (cache), puis un scan s'exécute en arrière-plan et met à jour la liste sans clignotement.

## 3. Écrans

La maquette validée contient 5 écrans. Le détail visuel est dans DESIGN.md.

### 3.1 Structure commune

- **Fenêtre sans bordure Windows** (barre de titre personnalisée) : zone de déplacement, boutons Réduire / Agrandir / Fermer à droite, double-clic pour agrandir.
- **Barre latérale** (248 px) : logo Hangar, section « Bibliothèque » (Accueil, Bibliothèque avec compteur, Favoris avec compteur, Paramètres), section « Stores » (un point de couleur, le nom et le compteur de chaque store qui a au moins un jeu ; clic = bibliothèque filtrée sur ce store), carte « En jeu » quand un jeu tourne, bouton « Ajouter un jeu » en pointillés.
- **Barre du haut** : bouton Retour (sur la page de jeu uniquement), champ de recherche centré « Rechercher parmi N jeux » avec le raccourci `Ctrl K`, bouton Actualiser (relance le scan, icône qui tourne pendant le scan), bouton Paramètres, pastille profil, contrôles de fenêtre.
- **Lumière d'ambiance** : l'image du jeu mis en avant, très floutée (120 px), à 20 % d'opacité derrière toute l'interface. Elle change avec le carrousel et sur la page de jeu.

### 3.2 Recherche (partout)

- `Ctrl K` ou `/` met le focus dans la recherche. Taper une lettre n'importe où (hors champ texte) commence aussi une recherche.
- Un panneau déroulant sous le champ affiche « N résultats » et jusqu'à 6 jeux (jaquette, nom, point du store, store et temps de jeu, bouton « Ouvrir »). Recherche insensible à la casse et aux accents, sur le nom affiché (renommé ou non).
- Flèches haut/bas pour naviguer dans les résultats, Entrée ouvre la page du jeu, `Ctrl Entrée` lance directement le jeu, Échap vide et ferme.
- Aucun résultat : « Aucun jeu ne correspond. »

### 3.3 Accueil

1. **Carrousel** (440 px de haut) : jusqu'à 8 jeux mis en avant, choisis ainsi : derniers lancés d'abord, puis favoris, puis les plus joués ; uniquement des jeux qui ont une image de bannière. Pour chaque jeu : pastille « Store · Reprendre » (joué il y a 2 jours ou moins) ou « Store · À redécouvrir », titre en très grand, ligne « genre · N h de jeu · dernière session ... », boutons **Jouer**, **Voir la fiche**, **favori**. Défilement automatique toutes les 6,5 s, en pause quand la souris est sur le carrousel, quand la fenêtre n'a pas le focus ou pendant une recherche. Miniatures cliquables en bas à droite, la miniature active a une barre de progression qui se remplit en 6,5 s.
2. **Reprendre** : rangée horizontale des 9 derniers jeux lancés (jaquette, nom, « Aujourd'hui / Hier / Il y a N jours »).
3. **Favoris** : rangée des jeux épinglés, sous-titre « N jeux épinglés ». Masquée s'il n'y a aucun favori.
4. **Les plus joués** : grille de 6 lignes (miniature, nom, heures, barre de progression relative au jeu le plus joué), lien « Toute la bibliothèque ».

Premier lancement (aucun historique) : le carrousel montre les jeux avec bannière par ordre alphabétique, la rangée « Reprendre » est masquée.

### 3.4 Bibliothèque / Favoris

- Titre « Bibliothèque », « Favoris » ou le nom du store filtré ; sous-titre « N jeux · N heures de jeu au total ».
- Tri segmenté : Récents, A-Z, Temps de jeu. Le choix est mémorisé.
- Puces de filtre : « Tous » puis chaque store présent avec son compteur.
- Grille de jaquettes 2:3 (min 172 px de large), nom, « Store · N h ».
- Survol d'une jaquette : elle se soulève, anneau lumineux couleur d'accent, bouton blanc « Lancer » qui glisse en bas, étoile favori en haut à droite.
- Clic sur la jaquette : page du jeu. Bouton « Lancer » ou double-clic : lance le jeu. Clic droit : menu contextuel (Jouer, Ajouter/Retirer des favoris, Collections, Renommer, Changer la jaquette, Ouvrir le dossier, Désinstaller, Masquer).
- Filtres à droite des puces : genre (genres connus des jeux affichés) et temps de jeu (Jamais joué, Moins de 10 h, 10 h et plus). Non mémorisés.
- **Collections** : listes faites par l'utilisateur. Clic droit > Collections : cases à cocher et création d'une collection. Elles apparaissent dans la barre latérale (section « Collections ») ; leur page permet de les renommer et de les supprimer (avec « Annuler » dans le toast). Supprimer une collection ne touche pas aux jeux.
- **Désinstaller** : confirmation dans Hangar (refusée pendant une partie), puis, sans fenêtre de launcher : Steam et Epic (Windows) : Hangar ferme le launcher, supprime le dossier du jeu et ses manifestes, et relance Steam en arrière-plan s'il tournait ; GOG : désinstalleur officiel `unins000.exe /VERYSILENT`. Sinon désinstallation dans le launcher du jeu (GOG Galaxy : la page du jeu ; autres jeux Windows : Paramètres > Applications installées ; macOS : le dossier de l'app, à mettre à la corbeille). Un rescan met ensuite la bibliothèque à jour.
- État vide : bibliothèque vide (avec bouton « Ajouter un jeu »), favoris vides (« Clique sur l'étoile d'une jaquette... »), filtre sans résultat.

### 3.5 Page de jeu

- Bannière pleine largeur (420 px) qui passe sous la barre du haut, avec un lent zoom (Ken Burns). Sans bannière : la jaquette floutée.
- Jaquette (230 px) qui chevauche la bannière, apparition avec un léger rebond puis flottement.
- Pastille « Store · genre », titre, bouton **Jouer** (ou état « En cours · mm:ss » + bouton « Arrêter » quand le jeu tourne), bouton favori, texte « Se lance via <launcher> ».
- **Activité** : 4 tuiles (Temps de jeu, Dernière session, Lancements, Taille sur le disque) et un histogramme des 14 derniers jours (heures par jour, barre du jour en couleur d'accent).
- **Informations** : Emplacement, Lanceur, Ajouté le (date de première détection). Actions : Ouvrir le dossier, Renommer, Changer la jaquette, Masquer de la bibliothèque.
- **Aussi dans ta bibliothèque** : jeux du même store ou du même genre.

### 3.5 bis Mode manette

- Ouvert par « Mode manette » (barre latérale, Paramètres > Général) ou le bouton Start d'une manette. Plein écran par-dessus l'app.
- Onglets Récents, Favoris, Tous les jeux, À installer (LB / RB). Grandes jaquettes, la jaquette choisie grossit avec un anneau d'accent ; bannière floutée du jeu en fond ; nom, temps de jeu et dernière session en haut.
- A : jouer (ou installer), Y : favori, X : fiche du jeu, B ou Start : quitter. Croix ou stick gauche pour se déplacer, avec répétition. Au clavier : flèches, Entrée, Échap, Page préc. / suiv.

### 3.6 Lancement d'un jeu

1. Clic sur Jouer : overlay plein écran avec la bannière floutée, la jaquette qui apparaît puis flotte, un halo pulsant couleur d'accent, le nom du jeu, un spinner, une barre de progression et 3 étapes : « Ouverture de <launcher> », « Démarrage du jeu », « Bon jeu ! ». Bouton « Annuler ».
2. L'overlay se ferme quand le processus du jeu est détecté, ou après 4 s au maximum (certains launchers ouvrent d'abord leur propre fenêtre).
3. Si le réglage « Réduire Hangar au lancement » est actif, la fenêtre se réduit à ce moment.
4. Pendant que le jeu tourne : carte « En jeu · mm:ss » dans la barre latérale (point vert pulsant), état « En cours » sur la page du jeu.
5. À la fermeture du jeu : la session est enregistrée (début, fin, durée), Hangar revient au premier plan si la fenêtre avait été réduite.
6. Échec du lancement (exe introuvable, launcher absent) : l'overlay se ferme et un toast rouge explique le problème en une phrase.

« Arrêter » demande une confirmation, puis termine proprement le processus du jeu.

### 3.7 Paramètres

Navigation par section à gauche (Général, Apparence, Launchers, Bibliothèque, Jaquettes ; en haut, en ligne, si la fenêtre est étroite), une section à la fois à droite. Chaque section est faite de groupes (cartes) dont les lignes suivent le même modèle : icône facultative, libellé et aide, puis le réglage à droite. La section Launchers (« Launchers et comptes ») réunit sur une même ligne par store : jeux trouvés, tag, bouton « Relier » / « Déconnecter » du compte (Steam : le champ de clé se déplie sous la ligne) et interrupteur ; son badge donne le nombre de comptes connectés.

- **Stores détectés** : un interrupteur par store (point de couleur, nom, « N jeux »). Désactiver un store retire ses jeux de l'interface sans rien supprimer.
- **Dossiers de jeux locaux** : liste des dossiers (chemin en police monospace, « N jeux »), bouton « Retirer » au survol, bouton « Ajouter un dossier » (sélecteur de dossier Windows).
- **Couleur d'accent** : 5 pastilles (Violet `#7c6cff`, Cyan `#22b8f0`, Corail `#f2556b`, Vert `#22c55e`, Ambre `#f59e0b`). Le changement s'applique instantanément partout.
- **Comportement** : « Réduire Hangar au lancement d'un jeu », « Démarrer avec Windows » (plugin autostart), « Jaquettes automatiques » (recherche Steam pour les jeux hors Steam).
- **Tags des stores** : dans « Stores détectés », chaque launcher porte « Connecté » (compte relié), « Détecté » (launcher ou jeux trouvés sur l'appareil) ou « Non trouvé ».
- **Launchers et comptes** (comptes facultatifs) : pour récupérer tous les jeux du compte (onglet « À installer ») même ceux que les fichiers locaux ne montrent pas.
  - Steam : l'utilisateur colle sa clé d'API Web personnelle (bouton « Créer ma clé » vers steamcommunity.com/dev/apikey). Le compte est celui de `loginusers.vdf`. API officielle `GetOwnedGames` : jeux et temps de jeu.
  - GOG et Epic : « Se connecter » ouvre la page de connexion officielle dans une fenêtre à part ; Hangar récupère un jeton, jamais le mot de passe.
  - Chaque compte connecté affiche le pseudo, le nombre de jeux, la date de synchro ou l'erreur, et « Déconnecter » (efface le jeton). Synchro à la connexion puis au plus toutes les 6 h, en arrière-plan.
  - Ubisoft Connect, EA app, Battle.net, Xbox : pas de connexion (pas d'API sûre pour une app tierce, ou mot de passe à faire transiter).
- **Jeux masqués** : liste avec bouton « Afficher ».
- **Jeux ajoutés à la main** : liste avec bouton « Retirer ».

### 3.8 Fenêtres modales

Même style que la maquette (fond `#14161d`, rayon 20 px, flou derrière) :

- **Ajouter un jeu** : choisir l'exécutable (Parcourir), nom (prérempli depuis le nom du fichier), arguments facultatifs ; lien « ou ajouter un dossier entier ».
- **Renommer** : champ prérempli, « Réinitialiser » revient au nom d'origine.
- **Changer la jaquette** : recherche par nom ou ID Steam avec aperçu des 5 premiers résultats sous forme de jaquettes cliquables, option « Choisir une image sur le PC », option « Pas de jaquette » (jaquette générée).

### 3.9 Toasts

En bas au centre, 3,2 s (5 s pour une erreur), style verre dépoli. Exemples : « Satisfactory lancé », « Elden Ring masqué · Annuler », « 36 jeux dans ta bibliothèque ».

## 4. Données conservées

Fichier `%APPDATA%\studio.pamal.hangar\state.json`, écrit de manière atomique (fichier temporaire puis renommage), avec un champ `version` pour les migrations. Contenu : favoris, jeux masqués, noms personnalisés, jaquettes choisies, cache de résolution Steam, dossiers locaux, jeux manuels, stores désactivés, accent, tri, réglages, date de première détection de chaque jeu, historique des sessions (90 derniers jours) et totaux (temps de jeu cumulé, nombre de lancements).

Le temps de jeu affiché est celui mesuré par Hangar. Pour les jeux Steam, si `localconfig.vdf` de l'utilisateur Steam connecté donne un `Playtime` plus élevé, afficher ce dernier (bonus, facultatif).

## 5. Critères d'acceptation globaux

- Premier démarrage sur un PC avec Steam + Epic + Riot : la bibliothèque complète s'affiche sans aucune action, jaquettes comprises (sauf jeux introuvables sur Steam, qui ont une jaquette générée).
- Chaque bouton Jouer lance réellement le jeu via le bon launcher.
- Les 5 écrans correspondent visuellement à la maquette (couleurs, tailles, espacements, animations).
- 60 i/s sur la grille de 100 jaquettes ; démarrage à froid en moins d'1 s jusqu'au premier affichage.
- Aucune fenêtre console visible, aucun crash si un store est absent.
- Exe portable + installeur NSIS (installation par utilisateur, sans droits admin).
