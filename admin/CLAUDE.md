# Dashboard admin - instructions pour Claude Code

Règles du dépôt : `../CLAUDE.md` (elles s'appliquent toutes ici). Fonctionnel, API et accès : `../docs/ADMIN.md`.

## Design : non négociable

- **La charte `../docs/ADMIN-DESIGN.md` et la maquette `../design/reference/admin/*.dc.html` font foi.** Avant toute modification visuelle, lire la section utile de la charte (`rg -n '^#' ../docs/ADMIN-DESIGN.md`) et chercher les valeurs exactes de l'écran concerné dans sa maquette avec `rg` (ne jamais lire une maquette en entier).
- **Tokens de l'app uniquement** (`src/lib/styles/tokens.css`) : aucun hex en dur dans un composant, sauf les couleurs de statut (`src/bug-status.ts`) et de badge (un seul module). Fonds teintés en `color-mix(...)`.
- **Composants partagés** : `.card`, `.kpi`, `.btn`, `.primary`, `.search`, `.field`, `.chip`, `.pill`, `.row`, `.seg`, `.tog` vivent une seule fois (`src/style.css` ou un composant Svelte). Ne pas les redéfinir dans une page, ne pas en inventer de nouveaux quand un existant convient.
- **Icônes** : `src/lib/components/Icon.svelte` de l'app, rien d'autre. Jamais d'emoji.
- **Police** : Geist embarquée (`@fontsource-variable/geist`), chiffres tabulaires, mono pour numéros, versions et identifiants.
- **Thème clair** et **largeur < 760 px** doivent rester propres.
- Un écran nouveau sans maquette reprend la coquille, l'en-tête de page et les composants existants à l'identique. Si un vrai nouveau composant est nécessaire, le proposer à l'utilisateur avant de le créer, puis l'ajouter à la charte (section 5).

## Essai

`npm run admin:dev` (http://localhost:1430, données de démo de `src/mock.ts`, aucun réseau). Captures seulement pour un changement visuel, à échelle réduite, à comparer à la maquette.

## Avant de rendre

Suivre la checklist de la section 11 de `../docs/ADMIN-DESIGN.md`, puis `npm run verify` et vérifier l'absence de tiret cadratin.
