# Contribuer à Hangar

Merci de vouloir aider. Hangar est un launcher de jeux pour Windows 10/11 et macOS, fait avec [Tauri 2](https://tauri.app) (Rust) et [Svelte 5](https://svelte.dev).

## Signaler un bug ou proposer une idée

Ouvre une [issue](https://github.com/maelpasq/hangar/issues/new/choose) avec le modèle « Bug » ou « Idée ». Une faille de sécurité ne va pas dans une issue : voir [SECURITY.md](SECURITY.md).

Ne colle jamais de clé d'API, de jeton ou de journal qui contient des informations personnelles.

## Préparer l'environnement

Les prérequis et les commandes sont dans le [README](README.md#pour-les-développeurs). En résumé :

```bash
npm install
npm run dev       # l'app, avec rechargement à chaud
npm run dev:web   # l'interface seule dans un navigateur, avec des jeux de démo
```

## Règles du projet

- **Français** partout dans l'interface, les messages et la documentation.
- **Pas de tiret cadratin** (le caractère U+2014) : un tiret simple `-` à la place.
- **Windows et macOS** : le code propre à Windows est sous `#[cfg(windows)]` ; le reste passe de préférence par `cfg!(target_os = "macos")`, pour être compilé et testé sur les deux systèmes.
- **Aucune fenêtre console** : chaque commande lancée par Hangar utilise `CREATE_NO_WINDOW`.
- **Pas de réseau inutile, pas de télémétrie** : un nouveau service contacté doit être justifié et ajouté à la liste fermée.
- **Ne jamais supprimer de fichier de l'utilisateur** : « Masquer » et « Désinstaller » passent par Hangar ou par le launcher du jeu, sans rien effacer.
- **Accessibilité** : vrais boutons, champs avec leur libellé, navigation au clavier, `prefers-reduced-motion` respecté.

Les choix d'architecture et leurs raisons sont dans [`docs/`](docs) (`ARCHITECTURE.md`, `DESIGN.md`, `DECISIONS.md`).

## Avant de proposer une pull request

```bash
npm run check
npm run test
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

Le CI relance ces vérifications sur Windows et macOS. Une pull request par sujet, avec un message de commit clair en français.

Les versions sont publiées par le mainteneur (procédure dans [`docs/RELEASES.md`](docs/RELEASES.md)).
