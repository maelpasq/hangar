# Compte Hangar (facultatif) - plan

Statut : plan validé dans ses grandes lignes. Phase 0 (socle local, sans réseau) faite. Phase 1 (serveur) en ligne depuis le 15 nov. 2026 : `https://hangar-api.pamalstudio.fr` (prod) et `https://hangar-api-test.pamalstudio.fr` (test), code dans `server/`. Phase 2 (connexion dans l'app) faite : `src-tauri/src/cloud/`, `src/lib/stores/cloud.svelte.ts`. Phase 3 (synchro) faite : `src/lib/util/cloud-sync.ts`. Phase 4 (temps de jeu cumulé) faite : même fichier, fin. Phase 5 (profil) faite : `server/src/profile.ts`, Paramètres > Compte > Profil. Phase 6 (cadre) écrite : jaquettes en fichier local, export, suppression, comptes inactifs (`server/src/lifecycle.ts`), politique de confidentialité (`site/confidentialite.html`) ; le serveur de test et de prod doit recevoir la migration `0001` puis être redéployé. Phase 7 (amis, profil et chat dans l'app) écrite le 16 nov. 2026 : `server/src/social.ts` et `live.ts` (Durable Object), `src-tauri/src/cloud/social.rs`, `src/lib/stores/social.svelte.ts`, pages Amis et Profil ; le serveur doit recevoir les migrations `0001` et `0002` et être redéployé (il lui faut la liaison Durable Object `LIVE`). Ce document est la référence pendant la construction ; les choix tranchés en cours de route vont aussi dans `DECISIONS.md`.

## 1. Objectif et principes

Les options de personnalisation se multiplient : elles doivent pouvoir suivre la personne d'un poste à l'autre.

- **Mode anonyme = Hangar d'aujourd'hui** : 100 % local, aucun appel réseau en plus. C'est le mode par défaut et il reste complet.
- **Le compte est un ajout** : connexion depuis la barre latérale (voir ci-dessous), dans Paramètres > Compte, et une étape « Passer » dans l'assistant de démarrage.
- **Barre latérale** (`Sidebar.svelte`), juste sous le bouton « Ajouter un jeu » :
  - sans compte connecté : bouton « Se connecter » (icône utilisateur), qui lance la connexion ;
  - avec un compte : avatar et pseudo (initiale sur fond d'accent tant qu'il n'y a pas d'avatar), avec une pastille d'état de synchro discrète (à jour, en cours, hors ligne) ; un clic ouvre Paramètres > Compte ;
  - barre réduite (`rail`) : l'icône ou l'avatar seul, avec `aria-label` et `title` (« Se connecter » ou « Compte de <pseudo> »).
- **Se déconnecter garde tout sur le poste** : on repasse en anonyme avec les données telles quelles.
- Le compte apporte :
  1. synchro multi-PC (Windows, macOS, Linux) ;
  2. sauvegarde (réinstaller ou changer de PC sans rien perdre) ;
  3. temps de jeu cumulé sur tous les postes ;
  4. profil (pseudo, avatar), puis plus tard le social (amis, vitrine).

## 2. Choix techniques

| Sujet | Choix |
|---|---|
| Base de données | **Turso** (libSQL) |
| API | **Cloudflare Worker** devant Turso (Turso n'a pas d'authentification ; son jeton ne doit jamais être dans l'app, le dépôt est public) |
| Authentification | **Better Auth** dans le Worker, tables dans Turso via Drizzle |
| Connexion | Code par e-mail (sans mot de passe), Discord, Google |
| Envoi des e-mails | Resend (ou équivalent) |
| Avatars (phase 5) | Cloudflare R2 |
| Session côté app | Jeton dans le coffre du système, entrée `compte-hangar` (coffre « Hangar » ou « Hangar Test ») |

Le code du Worker vit dans le dépôt (`server/`), ses secrets (jeton Turso, clés OAuth, clé Resend) dans les secrets Cloudflare et GitHub, jamais dans un fichier commité.

## 3. Données : synchronisées ou locales

Base : `PersistedState` (`src/lib/types.ts`). Les identifiants `steam:`, `epic:`, `gog:`, etc. sont les mêmes partout ; `local:` et `manual:` contiennent un chemin et ne le sont pas (voir section 4).

**Synchronisé**
- `favorites`, `hidden`, `renames`, `collections`
- `customCovers` : `steam:<id>`, `none`, et les jaquettes en fichier local (phase 6) : l'image va dans R2 (`PUT /covers/<empreinte SHA-256>`, 4 Mo au plus), l'élément vaut `file:<empreinte>` et les autres postes la téléchargent dans leur dossier des jaquettes
- `accent`, `theme`, `sort`
- préférences « de goût » : `autoCovers`, `showUninstalled`, `webGames`, `discordPresence`, `startPage`
- `sessions` et `totals` (section 6), `webPlayed`, `firstSeen`
- les jeux locaux et manuels, sous forme portable (section 4)
- la clé SteamGridDB, chiffrée (voir ci-dessous)

**Reste sur le poste**
- `localFolders`, `steamIdCache`, `disabledStores`, `onboarded`, `lastVersion`
- jaquettes en fichier local de plus de 4 Mo
- préférences liées à la machine : `startWithWindows`, `padAtLogin`, `padButton`, `closeAction`, `globalShortcut`, `minimizeOnLaunch`

**Clé SteamGridDB** (choix de l'utilisateur : synchronisée, pour ne pas la ressaisir sur chaque PC)
- Sur le poste, elle reste dans le coffre du système et ne passe toujours pas par le frontend : c'est le backend Rust qui l'envoie et la reçoit.
- Côté serveur, elle est chiffrée (AES-GCM) avec une clé de chiffrement rangée dans les secrets du Worker, jamais dans Turso : une fuite de la base seule ne la révèle pas.
- Route dédiée, hors de la synchro générale : elle n'apparaît ni dans `/sync`, ni dans l'export, ni dans le profil.
- Sur un nouveau poste connecté sans clé dans son coffre, Hangar la récupère et l'y range. Saisir, changer ou supprimer la clé sur un poste met à jour le compte ; se déconnecter la laisse dans le coffre du poste.

## 4. Jeux locaux et manuels sur un autre PC

Pour chaque jeu `local:` ou `manual:`, le compte garde une **fiche portable** :

- nom affiché ;
- signature : nom de l'exécutable (`celeste.exe`) et nom du dossier du jeu (`celeste`), en minuscules ;
- appid Steam et id GOG s'ils sont connus ;
- lien d'installation (section 5) ;
- ses personnalisations : favori, renommage, jaquette, collections, temps de jeu.

Sur un autre poste :

- **Le scan trouve le jeu**, même ailleurs (autre dossier, autre disque) : si l'exécutable et le dossier correspondent à une fiche, le jeu y est rattaché et récupère ses personnalisations.
- **Le jeu est introuvable** : carte en gris dans la bibliothèque, comme les jeux non installés des launchers (`notInstalled`), avec un badge « Sur un autre PC ». Affichée même si « jeux non installés » est désactivé ? À trancher (section 12).
  - Bouton principal : « Installer depuis <site> » si un lien existe, sinon « Choisir l'exécutable ».
  - Menu du jeu : « J'ai déjà ce jeu : choisir l'exécutable » (rattache à la main) et « Masquer sur ce PC » (le jeu reste sur le compte et les autres postes).

## 5. Lien d'installation trouvé automatiquement

Cherché **sur le poste où le jeu est installé**, au moment du scan, puis synchronisé. Ordre des sources :

1. **Registre Windows** (sans réseau) : clés de désinstallation déjà lues par `scanner/installed.rs`, champs `URLInfoAbout`, puis `URLUpdateInfo`, puis `HelpLink`.
2. **Raccourcis Internet** (sans réseau) : fichiers `.url` dans le dossier du jeu ou son dossier du menu Démarrer.
3. **Page Steam** : appid déjà trouvé pour les jaquettes (`storesearch`), donc aucun appel en plus.
4. **Page GOG** : `api.gog.com/products/<id>` (déjà utilisé), champ de lien vers la page produit.

Les sources 1 et 2 n'existent que sous Windows ; ailleurs on commence à Steam. Aucune nouvelle adresse réseau.

Garde-fous :
- seuls les liens `https://` sont gardés ;
- ouverture dans le navigateur de la personne, jamais dans Hangar ;
- le domaine est affiché sur le bouton ;
- le lien est visible et modifiable dans la fiche du jeu, sans être obligatoire.

Le lien sert aussi en mode anonyme (fiche du jeu), il est donc construit dès la phase 0.

## 6. Synchro

- **Granularité** : un élément = une ligne (un favori, un renommage, une collection, une préférence...). Chaque ligne porte `updatedAt` et `deviceId`, et une suppression est une marque (`deleted`), pas un effacement.
- **Conflits** : la modification la plus récente gagne, ligne par ligne.
- **Sessions de jeu** : ajout seulement (identifiant unique + `deviceId`), jamais modifiées ; les totaux sont recalculés en additionnant tous les postes, avec le détail par poste.
- **Rythme** : récupération au démarrage puis toutes les 15 minutes ; envoi groupé quelques secondes après un changement.
- **Hors ligne** : file d'attente des changements locaux, envoyée au retour du réseau. L'app ne dépend jamais du serveur pour fonctionner.
- **Première connexion** avec des données des deux côtés : choix « Fusionner » (par défaut) ou « Utiliser le compte ».
- **Postes** : chaque installation a un `deviceId` et un nom (nom du PC, modifiable) ; liste des postes dans Paramètres > Compte.

## 7. Connexion

- Le navigateur de la personne s'ouvre sur la page de connexion de l'API.
- Le retour vers Hangar passe par une adresse locale `http://127.0.0.1:<port>` ouverte le temps de la connexion, avec PKCE. C'est plus fiable qu'un lien `hangar://`, surtout pour l'AppImage.
- Le jeton de session va dans le coffre du système.
- Côté Rust : un module `src-tauri/src/cloud/` (client HTTP, jeton, synchro), séparé de `accounts/` qui gère les comptes des launchers.

## 8. Serveur (API)

Routes prévues :
- `/auth/*` : Better Auth (code e-mail, Discord, Google)
- `GET /me` : compte, profil, liste des postes
- `GET /sync?since=<curseur>` : changements depuis le curseur
- `POST /sync` : envoi groupé de changements
- `POST /sessions` : sessions de jeu
- `GET`, `PUT`, `DELETE /secrets/steamgriddb` : clé SteamGridDB, chiffrée au repos
- `GET /export` : toutes les données (JSON)
- `DELETE /me` : suppression du compte et de toutes ses données

Routes ajoutées en l'écrivant : `PUT` et `GET /covers/:hash` (jaquettes en fichier local, phase 6), `GET /login` (page de connexion), `GET /desktop/finish` et `POST /desktop/token` (retour vers l'app, section 7), `POST /logout`, `PUT` et `DELETE /devices/:id` (renommer un poste, le déconnecter à distance), `GET /sessions?since=<curseur>`, `PUT /me` (pseudo), `GET`, `PUT`, `DELETE /me/avatar`. La page publique `GET /u/:id` a existé puis a été retirée (16 nov. 2026, voir DECISIONS.md).

Routes du social (phase 7), sous `/social/` : `GET`, `PUT /me` (activation, code ami, trouvable par pseudo, visibilités), `PUT /showcase` (vitrine et bibliothèque), `PUT`, `DELETE /banner`, `GET /users/:id` (profil vu dans l'app) et `/users/:id/avatar`, `/users/:id/banner`, `GET /search?q=`, `GET /friends`, `POST`, `DELETE /friends/:id` (demande, acceptation, refus, retrait), `POST`, `DELETE /blocks/:id`, `PUT /presence`, `GET`, `POST /activity`, `GET /conversations`, `GET`, `POST /messages/:id`, `POST /messages/:id/read`, `POST /reports`, `GET /live` (WebSocket).

Tables (en plus de celles de Better Auth) : `profiles` (compte, compteur qui sert de curseur, date du rappel d'inactivité), `covers` (jaquettes envoyées : empreinte, type, taille), `devices` (poste, nom, empreinte de son jeton), `login_codes`, `entries` (user, key, value, updatedAt, deviceId, deleted, seq), `game_sessions`, `secrets` (user, nom, valeur chiffrée, nonce, updatedAt). Phase 7 : `social` (réglages, code ami, présence, vitrine), `friends` (liens vus de chaque côté : `friend`, `out`, `in`, `blocked`), `activity` (30 jours), `messages` (chiffrés, clé hors de la base), `reports`.

## 9. Vie privée, RGPD, règles du projet

- Politique de confidentialité sur le site (`site/confidentialite.html`, https://hangar.pamalstudio.fr/confidentialite.html) : données stockées, durée, hébergeurs, droits. Lien dans Paramètres > Compte et en pied de page du site.
- **Durées** (`server/src/lifecycle.ts`, tâche planifiée quotidienne du Worker) : compte sans aucune connexion d'un poste pendant 2 ans supprimé, après un e-mail de rappel 30 jours avant (une connexion entre-temps remet tout à zéro) ; traces de connexion (session du navigateur avec IP, codes, limite de débit) effacées un jour après leur fin ; jaquettes qu'aucun élément ne désigne plus effacées après un jour de grâce.
- Base Turso en région UE.
- Export et suppression du compte depuis l'app.
- Aucune télémétrie : le serveur ne reçoit que ce qui est synchronisé.
- **Hangar Test** : une base Turso et un Worker séparés, avec une adresse d'API différente, choisie au build comme le coffre et l'identité.
- Mettre à jour la liste réseau de `CLAUDE.md` (domaine de l'API, page de connexion) et `ARCHITECTURE.md`.

## 10. Phases

0. **Socle local, sans réseau**
   - séparer dans `PersistedState` la partie synchronisable de la partie locale, avec `updatedAt` par élément et un `deviceId` ;
   - migration `version: 1` vers `2` ;
   - signature portable des jeux locaux et manuels ;
   - lien d'installation automatique (section 5), visible dans la fiche du jeu.
1. **Serveur** : Worker, Better Auth, Turso, en version prod et test ; routes de la section 8.
2. **Connexion dans l'app** : entrée « Se connecter » / compte sous « Ajouter un jeu » dans la barre latérale, Paramètres > Compte, étape de l'assistant, retour par `127.0.0.1`, coffre. L'entrée de la barre latérale n'apparaît qu'à partir de cette phase (pas de bouton qui ne mène nulle part).
3. **Synchro** : récupération, envoi, file hors ligne, fusion à la première connexion, indicateur d'état ; rattachement des jeux locaux et cartes en gris « Sur un autre PC ».
4. **Temps de jeu cumulé** : historique et statistiques tous postes, détail par poste.
5. **Profil** : pseudo, avatar (R2). Le social vient après. (Une visibilité publique avec page web a existé, retirée le 16 nov. 2026.)
6. **Cadre et publication** : politique de confidentialité, export et suppression, docs et liste réseau, version. Ajouté : jaquettes en fichier local synchronisées, suppression des comptes inactifs, ménage quotidien. La version se publie avec le reste du compte (dev vers main), sur demande.
7. **Social, dans l'app** : tout se passe dans Hangar, sans page web de profil.
   - **Profil dans l'app** : sa propre page (avatar, pseudo, bannière, temps de jeu total, jeux les plus joués, collections mises en avant, activité récente) et celle des autres, ouvertes sans navigateur.
   - **Amis** : recherche par pseudo ou par code ami, demande, acceptation, refus, blocage ; liste des amis avec leur statut (en ligne, en jeu sur tel jeu, hors ligne) et leur jeu en cours.
   - **Page Amis** dans la barre latérale : liste, demandes reçues et envoyées, activité des amis (jeux lancés, nouveaux jeux), jeux en commun.
   - **Chat** : conversations privées entre amis, en temps réel (WebSocket, Durable Objects côté Cloudflare), historique, non-lus, notifications dans l'app et dans la zone de notification, inviter un ami sur un jeu.
   - **Confidentialité** : chaque information partagée a son réglage (statut, jeu en cours, temps de jeu, bibliothèque), pour tout le monde, les amis seulement ou personne ; signaler un message ou un compte ; chiffrement au repos des messages ; export et suppression comprennent amis et messages. Politique de confidentialité mise à jour.
   - **Réseau** : connexion temps réel à l'API du compte seulement quand l'utilisateur est connecté et a activé les amis ; liste réseau de `CLAUDE.md` mise à jour.

## 11. À faire par le développeur (hors code) - fait le 15 nov. 2026

- Créer les comptes Turso, Cloudflare et Resend.
- Créer les applications OAuth Discord et Google.
- Choisir le domaine de l'API.
- Enregistrer les secrets dans Cloudflare et GitHub.

## 12. Questions ouvertes

- ~~Les jeux « Sur un autre PC » s'affichent-ils quand « jeux non installés » est désactivé ?~~ Non : ils suivent la même règle que les jeux non installés des launchers (DECISIONS.md).
- ~~Les jaquettes en fichiers locaux sont-elles envoyées sur le compte (R2) ?~~ Oui, depuis la phase 6 (section 3).
- ~~Le temps de jeu passé avant la création du compte est-il envoyé à la première connexion ?~~ Oui, rattaché au poste : totaux et sessions non envoyées partent à la première synchro, et de nouveau vers un autre compte après une déconnexion.
- ~~Durée de conservation d'un compte inactif.~~ 2 ans sans connexion, rappel par e-mail 30 jours avant (section 9).
