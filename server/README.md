# API du compte Hangar

Worker Cloudflare devant une base Turso (libSQL). Le compte est facultatif : l'app ne parle à ce
serveur que si la personne se connecte. Plan complet : `docs/COMPTE.md`.

Rien de secret n'est dans ce dossier : les jetons et les clés vivent dans les secrets Cloudflare.

## Routes

| Route | Rôle |
|---|---|
| `GET /login?port&challenge&state` | page de connexion, ouverte dans le navigateur par l'app |
| `/auth/*` | Better Auth : code par e-mail, Discord, Google |
| `GET /desktop/finish?port&challenge&state` | connectée : renvoie un code à usage unique à `http://127.0.0.1:<port>` |
| `POST /desktop/token` | `{ code, verifier, deviceId, deviceName }` : rend le jeton du poste |
| `GET /me` | compte (pseudo, version de l'avatar, visibilité) et liste des postes |
| `PUT /me` | `{ name?, public? }` : pseudo (2 à 32 caractères), profil public ou privé |
| `GET`, `PUT`, `DELETE /me/avatar` | avatar (PNG, JPEG ou WebP, 512 Ko au plus), rangé dans R2 |
| `GET /u/:id` | page publique du profil (404 s'il est privé) |
| `POST /logout` | déconnecte ce poste |
| `PUT /devices/:id`, `DELETE /devices/:id` | renommer un poste, le déconnecter à distance |
| `GET /sync?since=<curseur>` | changements depuis le curseur (`more` : il en reste) |
| `POST /sync` | `{ changes: [{ key, value, updatedAt }] }`, `value: null` pour une suppression |
| `GET /sessions?since=<curseur>`, `POST /sessions` | sessions de jeu, ajout seulement |
| `GET`, `PUT`, `DELETE /secrets/steamgriddb` | clé SteamGridDB, chiffrée en base |
| `PUT /covers/:hash`, `GET /covers/:hash` | jaquette en fichier local (PNG, JPEG ou WebP, 4 Mo au plus), nommée par son empreinte SHA-256, rangée dans R2 |
| `GET /export` | toutes les données du compte (JSON) |
| `DELETE /me` | supprime le compte et toutes ses données |

Hors `/login`, `/auth/*`, `/desktop/*` et `/u/*`, tout demande `Authorization: Bearer <jeton du poste>`.

Connexion d'un poste : l'app tire un vérifieur PKCE, ouvre une adresse locale, puis le navigateur
sur `/login`. Après la connexion, le navigateur revient sur l'adresse locale avec un code (valable
2 minutes, une seule fois), que l'app échange avec son vérifieur contre un jeton. Le serveur ne
garde que l'empreinte du jeton.

Ménage quotidien (`src/lifecycle.ts`, déclencheur `crons` de `wrangler.toml`) : traces de connexion
effacées un jour après leur fin, jaquettes plus désignées par aucun élément, comptes sans connexion
depuis 2 ans supprimés après un e-mail de rappel 30 jours avant. Essai local : `npx wrangler dev
--env test --test-scheduled`, puis `curl "http://127.0.0.1:8787/__scheduled"`.

Synchro : un élément par clé (celles de `src/lib/util/sync.ts`), la modification la plus récente
gagne. Le curseur est un compteur par compte, pas une date : deux horloges décalées ne font rien
perdre.

## Développer

```bash
npm install
npm run verify      # types + tests (base libSQL locale, aucun réseau)
npm run db:generate # après un changement de src/schema.ts : écrit la migration dans drizzle/
```

`npm run dev` lance le Worker en local (environnement `test`). Il lui faut une base Turso : ses
secrets vont dans `.dev.vars` (jamais commité), voir la liste ci-dessous. Sans clé Resend, le code
de connexion est écrit dans le journal du Worker.

## Mettre en ligne (à faire une fois par environnement : `prod` et `test`)

Adresses : `https://hangar-api.pamalstudio.fr` (prod) et `https://hangar-api-test.pamalstudio.fr` (test),
domaines personnalisés Cloudflare déclarés dans `wrangler.toml`. En local, `npm run dev` garde
`http://127.0.0.1:8787` en le mettant dans `.dev.vars` (`BASE_URL=http://127.0.0.1:8787`).

Raccourci sans afficher les secrets : `node scripts/secrets.mjs init` crée `.secrets/prod.json` et
`.secrets/test.json` (non commités, `AUTH_SECRET` et `SECRETS_KEY` déjà générés), à remplir à la main ;
puis `check`, `migrate` et `push` avec `prod` ou `test`. Supprimer `.secrets/` ensuite.

1. Turso : créer une base en région UE, noter son adresse (`libsql://...`) et un jeton.
   R2 : créer le bucket des avatars et des jaquettes (`npx wrangler r2 bucket create hangar-avatars` ou `hangar-avatars-test`).
2. Appliquer le schéma : `TURSO_URL=... TURSO_TOKEN=... npm run db:migrate` (à refaire après chaque nouvelle migration de `drizzle/`).
3. Renseigner `BASE_URL` et `MAIL_FROM` dans `wrangler.toml`.
4. Enregistrer les secrets, un par un : `npx wrangler secret put <NOM> --env <prod|test>`.
5. `npm run deploy:test` ou `npm run deploy:prod`.

| Secret | Contenu |
|---|---|
| `TURSO_URL`, `TURSO_TOKEN` | base de l'environnement |
| `AUTH_SECRET` | 32 octets aléatoires (signature des cookies de connexion) |
| `SECRETS_KEY` | 32 octets aléatoires en base64 : chiffre la clé SteamGridDB. La perdre rend ces clés illisibles |
| `RESEND_API_KEY` | envoi des codes par e-mail |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | facultatif : sans eux, pas de bouton Discord |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | facultatif : sans eux, pas de bouton Google |

Adresses de retour à déclarer chez Discord et Google : `<BASE_URL>/auth/callback/discord` et
`<BASE_URL>/auth/callback/google`.

Un secret aléatoire : `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
