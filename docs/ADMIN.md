# Dashboard d'administration

Outil web réservé à l'administrateur de Hangar : chiffres du compte Hangar, recherche et fiche des
comptes, badges, journal des actions. Il ne fait pas partie de l'app : aucune règle réseau de l'app
ne change.

- Code : `admin/` (Svelte, mêmes tokens et icônes que l'app), API dans `server/src/admin/`.
- Adresses : `https://hangar-admin.pamalstudio.fr` (prod) et `https://hangar-admin-test.pamalstudio.fr`
  (Hangar Test), servies par le Worker du compte (`server/wrangler.toml`), chacune sur sa base.
- Bascule Test | Prod en bas de la barre latérale : ouvre l'autre adresse (chaque dashboard ne lit que sa base).
- Essai local : `npm run admin:dev` (http://localhost:1430, données de démo, aucun réseau).

## Accès

Deux verrous :

1. **Cloudflare Access** devant l'adresse : la connexion se fait chez Cloudflare avant même d'atteindre
   le Worker.
2. **Le Worker** vérifie le jeton qu'Access ajoute à chaque requête (`Cf-Access-Jwt-Assertion`) :
   signature (clés publiques de l'équipe, `https://<équipe>.cloudflareaccess.com/cdn-cgi/access/certs`,
   lues par le Worker et gardées une heure), audience, émetteur, expiration, et l'adresse doit être
   `ADMIN_EMAIL`. Sans `ACCESS_TEAM`, `ACCESS_AUD` ou `ADMIN_EMAIL`, personne n'entre. Les écritures
   exigent en plus l'origine du dashboard.

Le dashboard ne répond que sur `ADMIN_HOST` ; l'API de l'app n'y répond pas, et inversement.

## Mise en ligne (une fois par environnement)

1. Cloudflare Zero Trust > Access > Applications > « Self-hosted » : domaine `hangar-admin.pamalstudio.fr`
   (ou `hangar-admin-test`), politique « Allow » limitée à l'adresse de l'administrateur. Noter
   l'« Application Audience (AUD) Tag » et le nom d'équipe (Settings > Custom Pages : `<équipe>.cloudflareaccess.com`).
2. Secrets du Worker : `npx wrangler secret put ACCESS_TEAM --env <prod|test>` (`https://<équipe>.cloudflareaccess.com`)
   et `ACCESS_AUD` (l'étiquette AUD). `ADMIN_EMAIL` existe déjà.
3. Migrations `server/drizzle/0004_admin_log.sql`, `0005_bugs.sql` et `0006_sanctions.sql` à appliquer sur la base (`npm run db:migrate`, voir server/README.md).
4. `npm run deploy:test` ou `npm run deploy:prod` dans `server/` (compile `admin/` d'abord).

## Écrans

| Écran | Contenu |
|---|---|
| Accueil | bugs ouverts, comptes (+ nouveaux sur 7 jours), actifs sur 7 jours, amis activés (en ligne), signalements, inscriptions par jour sur 30 jours, badges donnés |
| Bugs | signalements du bouton insecte : filtre par statut (ouverts, nouveau, confirmé, en cours, corrigé, rejeté, doublon, tous) avec leur nombre, recherche par numéro ou mots ; fiche avec description, capture, suivi (statut, version de correction, doublon, note interne) et historique |
| Signalements | comptes et messages signalés depuis l'app : filtre ouvert, traité, rejeté, tous ; compte visé (avec ses sanctions en cours), auteur, motif, extrait du message ; marquer traité, rejeter, rouvrir |
| Comptes | recherche par pseudo, e-mail, code ami ou identifiant (50 au plus, récents d'abord), sanction en cours |
| Badges | badges automatiques de l'app en lecture seule (règle, paliers) ; badges donnés à la main, dans leur ordre d'affichage dans l'app : créer (nom, description, emblème, couleur), modifier, monter / descendre, désactiver (masqué partout, sans être retiré), supprimer (seulement s'il n'est donné à personne, jamais les 4 d'origine), donner ou retirer à plusieurs comptes d'un coup (identifiant, code ami ou e-mail, 200 au plus) |
| Fiche | identité, badges (donner / retirer), amis, bibliothèque synchronisée, postes, sanctions (en cours, nouvelle, anciennes), signalements reçus, journal du compte |
| Journal | toutes les actions du dashboard (qui, quoi, quel compte, quand) |

Les messages privés restent chiffrés : seule la copie gardée au moment d'un signalement est visible.

## Sanctions

| Sanction | Effet |
|---|---|
| Amis coupés (`social`) | amis désactivés (hors ligne, introuvable), impossibles à réactiver ; le reste du compte marche |
| Compte suspendu (`total`) | l'API ne répond plus que `GET /me` (et l'avatar), la déconnexion, la gestion des postes, l'export et la suppression ; amis coupés aussi |

Durée : 1, 3, 7, 30 ou 90 jours, ou définitive. Le motif est montré à la personne dans Hangar (Paramètres > Compte, écran Amis). Une suspension totale suit l'adresse e-mail (empreinte gardée même si le compte est supprimé) : un nouveau compte à la même adresse la reprend, et la lever libère les deux. À la levée, les amis restent désactivés : la personne les réactive elle-même.

## API (`/api/*` sur l'adresse du dashboard)

| Route | Rôle |
|---|---|
| `GET /api/me` | e-mail de l'administrateur, badges (définitions et nombre de comptes) |
| `GET /api/stats` | chiffres de l'accueil |
| `GET /api/users?q=` | recherche |
| `GET /api/users/:id` (+ `/avatar`) | fiche d'un compte |
| `PUT /api/users/:id/badges` | `{ badge, on }`, noté au journal (`badge.donner`, `badge.retirer`) |
| `GET /api/badges` | badges, dans l'ordre, avec leur nombre de comptes |
| `POST /api/badges` | `{ name, description, icon, color }` : nouveau badge (journal : `badge.creer`) |
| `PUT /api/badges/:id` | `{ name?, description?, icon?, color?, active? }` (journal : `badge.modifier`) |
| `PUT /api/badges/order` | `{ ids }` : nouvel ordre (journal : `badge.ordre`) |
| `DELETE /api/badges/:id` | badge donné à personne, pas un des 4 d'origine (journal : `badge.supprimer`) |
| `POST /api/badges/:id/users` | `{ users, on }` : donne ou retire à plusieurs comptes (journal : un `badge.donner` ou `badge.retirer` par compte changé) |
| `GET /api/bugs?statut=&q=&before=` | bugs (50 par page) et leur nombre par statut |
| `GET /api/bugs/:id` (+ `/capture`) | fiche d'un bug et son historique |
| `PUT /api/bugs/:id` | `{ status, fixedIn, duplicateOf, note }`, noté au journal (`bug.statut`, `bug.note`) ; un changement de statut repeint le message Discord |
| `GET /api/reports?statut=&before=` | signalements (50 par page) et leur nombre par statut |
| `PUT /api/reports/:id` | `{ status }` : `ouvert`, `traite`, `rejete` (journal : `signalement.statut`) |
| `POST /api/users/:id/sanctions` | `{ kind, reason, days }` (`days` null : définitive), journal : `sanction.donner` |
| `DELETE /api/sanctions/:id` | lève une sanction en cours (journal : `sanction.lever`) |
| `GET /api/log?before=` | journal, 50 lignes par page |

## Badges

Les badges donnés à la main vivent dans `badge_defs` (migration 0007, qui y range les 4 d'origine : `certifie`, `equipe`, `testeur`, `chasseur`). Emblème au choix parmi ceux embarqués dans l'app (`GIVEN_ICONS` de `src/lib/util/badges.ts`, `BADGE_ICONS` de `server/src/badges.ts`, mêmes listes) : en ajouter un demande une version de l'app. Couleur : `#rrggbb` ou `accent`, une par badge (désactivés compris : sinon 409 `couleur`).

Compatibilité : le profil (`GET /social/users/:id`) garde `badges`, limité aux 4 d'origine, pour les versions d'avant la phase 4, et ajoute `badgeDefs` (nom, emblème, couleur de chaque badge actif). Une version qui ne connaît pas un emblème montre l'étoile. L'administrateur reçoit aussi `allBadges` pour le menu de badges de l'app.

## Suite prévue

Rien pour l'instant : les 4 phases sont faites.
