# Hangar - instructions pour Claude Code

Hangar est un launcher de jeux pour Windows 10/11 : il détecte automatiquement tous les jeux installés (Steam, Epic, GOG, Ubisoft Connect, EA app, Battle.net, Riot, Xbox / Microsoft Store, dossiers locaux, ajouts manuels), les affiche avec leurs vraies jaquettes et les lance via leur launcher, ou directement via l'exécutable quand il n'y a pas de launcher.

## Documents à lire avant de coder

Lis-les dans cet ordre, au début de chaque session :

1. `docs/SPEC.md` : ce que fait l'app, écran par écran, avec les critères d'acceptation.
2. `docs/DESIGN.md` : le design system (couleurs, typo, rayons, animations) et chaque composant. **La maquette validée par l'utilisateur fait foi.**
3. `docs/ARCHITECTURE.md` : stack, découpage frontend/backend, modèle de données, commandes Tauri.
4. `docs/PLAN.md` : les étapes à suivre dans l'ordre, avec ce qu'il faut vérifier à chacune.

La source de la maquette est dans `design/reference/maquette-hangar.dc.html`. C'est un composant de l'outil de design de Claude, pas du code à copier tel quel : le balisage `<x-dc>`, `<sc-for>`, `<sc-if>` et `{{ ... }}` est un langage de template. Sers-t'en comme référence exacte des valeurs (couleurs, tailles, espacements, keyframes, textes). Les URL `/_blob/...` ne fonctionnent pas hors de l'outil : dans l'app, les images viennent du CDN Steam (voir DESIGN.md, section Jaquettes).

## Règles non négociables

- **Langue** : toute l'interface et tous les messages sont en français. Les commentaires du code peuvent être en français.
- **Jamais de tiret cadratin** (le caractère U+2014) nulle part : code, UI, commentaires, docs, messages de commit. Utilise un tiret simple `-`. Vérifie avec `rg -n '\x{2014}' --glob '!node_modules' --glob '!target' .` (doit ne rien afficher) avant chaque commit.
- **Windows d'abord** : la cible est `x86_64-pc-windows-msvc`. Tout code spécifique à Windows est sous `#[cfg(windows)]`, avec un équivalent vide ou simulé ailleurs pour que `cargo check` passe aussi sous Linux/macOS.
- **Aucune fenêtre console** ne doit s'ouvrir : chaque `Command` (PowerShell, etc.) utilise `CREATE_NO_WINDOW` (0x08000000).
- **Pas de réseau inutile** : seuls le CDN Steam (`*.steamstatic.com`) et l'API de recherche Steam (`store.steampowered.com/api/storesearch`) sont appelés. Pas de télémétrie. Les polices sont embarquées dans l'app (pas de Google Fonts au runtime).
- **Robustesse de la détection** : un store absent, une clé de registre manquante ou un fichier corrompu ne doivent jamais faire planter le scan. Chaque détecteur renvoie une liste vide en cas d'erreur et journalise la raison.
- **Ne jamais supprimer de fichiers de l'utilisateur.** « Masquer » cache un jeu dans Hangar, rien de plus.
- **Accessibilité** : vrais `<button>`, `<input>` avec `<label>`, `aria-label` sur les boutons-icônes, focus visible, navigation clavier, respect de `prefers-reduced-motion`.

## Commandes

```bash
npm install            # dépendances frontend + CLI Tauri
npm run dev            # lance l'app en mode développement (Windows)
npm run build          # exe + installeur NSIS dans src-tauri/target/release
npm run check          # svelte-check + tsc
npm run test           # tests frontend (vitest)
cd src-tauri && cargo test && cargo clippy -- -D warnings
```

Hors de Windows, `npm run dev:web` lance le frontend seul dans un navigateur avec des données de démo (mock des commandes Tauri, voir ARCHITECTURE.md). Utilise-le pour itérer sur l'UI.

## Façon de travailler

- Suis `docs/PLAN.md` étape par étape. À la fin de chaque étape : `npm run check`, `npm run test`, `cargo test`, `cargo clippy`, puis un commit avec un message clair en français.
- Compare régulièrement ton UI à la maquette (`npm run dev:web` + capture d'écran avec Playwright si disponible). Les écarts visibles sont des bugs.
- Le dossier `src-tauri/src/scanner.rs` contient déjà une détection fonctionnelle de tous les stores (version 1 de l'app). Réutilise-la et améliore-la, ne repars pas de zéro.
- Le dossier `src/` actuel (HTML/CSS/JS vanilla) est la version 1 de l'interface. Il est remplacé par l'app Svelte décrite dans ARCHITECTURE.md. Garde-le dans `legacy/` jusqu'à ce que la nouvelle UI soit à parité, puis supprime-le.
- Si une information manque dans les docs, choisis l'option la plus simple qui respecte la maquette, note ton choix dans `docs/DECISIONS.md` et continue.
