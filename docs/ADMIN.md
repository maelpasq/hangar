# Dashboard d'administration

Outil web réservé à l'administrateur de Hangar : chiffres du compte Hangar, recherche et fiche des
comptes, badges, journal des actions. Il ne fait pas partie de l'app : aucune règle réseau de l'app
ne change.

- Code : `admin/` (Svelte, mêmes tokens et icônes que l'app), API dans `server/src/admin/`.
- Adresses : `https://hangar-admin.pamalstudio.fr` (prod) et `https://hangar-admin-test.pamalstudio.fr`
  (Hangar Test), servies par le Worker du compte (`server/wrangler.toml`), chacune sur sa base.
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
3. Migration `server/drizzle/0004_admin_log.sql` à appliquer sur la base (`npm run db:migrate`, voir server/README.md).
4. `npm run deploy:test` ou `npm run deploy:prod` dans `server/` (compile `admin/` d'abord).

## Écrans

| Écran | Contenu |
|---|---|
| Accueil | comptes (+ nouveaux sur 7 jours), actifs sur 7 jours, amis activés (en ligne), signalements, inscriptions par jour sur 30 jours, badges donnés |
| Comptes | recherche par pseudo, e-mail, code ami ou identifiant (50 au plus, récents d'abord) |
| Fiche | identité, badges (donner / retirer), amis, bibliothèque synchronisée, postes, signalements reçus, journal du compte |
| Journal | toutes les actions du dashboard (qui, quoi, quel compte, quand) |

Les messages privés restent chiffrés : seule la copie gardée au moment d'un signalement est visible.

## API (`/api/*` sur l'adresse du dashboard)

| Route | Rôle |
|---|---|
| `GET /api/me` | e-mail de l'administrateur, badges qu'il peut donner |
| `GET /api/stats` | chiffres de l'accueil |
| `GET /api/users?q=` | recherche |
| `GET /api/users/:id` (+ `/avatar`) | fiche d'un compte |
| `PUT /api/users/:id/badges` | `{ badge, on }`, noté au journal (`badge.donner`, `badge.retirer`) |
| `GET /api/log?before=` | journal, 50 lignes par page |

## Suite prévue

2. Signalements de bug gardés en base (statuts, capture dans R2, embed Discord mis à jour).
3. Statut des signalements de comptes, bannissement social ou total (release de l'app nécessaire).
4. Badges créés depuis le dashboard (`badge_defs`, icônes embarquées dans l'app, compatibilité des anciennes versions).
