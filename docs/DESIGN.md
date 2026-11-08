# Hangar - design system

Référence : `design/reference/maquette-hangar.dc.html` (maquette validée). En cas de doute, la maquette gagne.

Direction : sombre, profond, épuré, « 2026 ». Les jaquettes sont les vraies stars, l'interface s'efface. Verre dépoli discret, mouvements doux et rapides, aucune décoration gratuite.

## 1. Tokens

Déclare-les en variables CSS sur `:root` (fichier `src/lib/styles/tokens.css`).

### Couleurs

| Token | Valeur | Usage |
|---|---|---|
| `--bg` | `#0a0b0f` | Fond de l'app |
| `--bg-deep` | `#07080b` | Derrière la fenêtre |
| `--panel` | `#14161d` | Modales |
| `--sidebar` | `rgba(10,11,15,.55)` + `backdrop-filter: blur(30px)` | Barre latérale |
| `--surface-1` | `rgba(255,255,255,.035)` | Cartes de section |
| `--surface-2` | `rgba(255,255,255,.045)` | Champ de recherche, segmentés |
| `--surface-3` | `rgba(255,255,255,.07)` | Survol |
| `--surface-4` | `rgba(255,255,255,.10)` | Boutons fantômes sur image |
| `--border-1` | `rgba(255,255,255,.05)` | Séparateurs |
| `--border-2` | `rgba(255,255,255,.08)` | Contours de champs |
| `--border-3` | `rgba(255,255,255,.14)` | Contours de boutons sur image |
| `--text` | `#eef0f6` | Texte principal |
| `--text-2` | `#c3c7d4` | Texte secondaire sur image |
| `--text-3` | `#a7acbd` | Texte secondaire |
| `--muted` | `#8b90a3` | Libellés, méta (contraste AA vérifié sur `--bg`) |
| `--accent` | `#7c6cff` (réglable) | Bouton Jouer, focus, anneau de survol, barre du jour |
| `--accent-soft` | `rgba(139,123,255,.14)` | Halo de focus |
| `--success` | `#34d399` / texte `#6ee7b7` | En jeu |
| `--danger` | `#e5484d` / texte `#ff8f94` | Fermer, Masquer, erreurs |
| `--star` | `#fbbf24` | Favori actif |

Accents proposés : `#7c6cff` Violet (défaut), `#22b8f0` Cyan, `#f2556b` Corail, `#22c55e` Vert, `#f59e0b` Ambre. L'ombre du bouton Jouer dérive de l'accent (`color-mix(in srgb, var(--accent) 80%, transparent)`).

### Couleurs des stores (points et puces uniquement, jamais de logos de marque)

| Store | Couleur |
|---|---|
| Steam | `#66c0f4` |
| Epic Games | `#d9d9d9` |
| GOG | `#c084fc` |
| Ubisoft Connect | `#60a5fa` |
| EA app | `#ff6b6b` |
| Battle.net | `#38a3ff` |
| Xbox | `#4ade80` |
| Riot Games | `#ff5c6c` |
| Local | `#f5a524` |
| Ajoutés | `#a78bfa` |

### Typographie

- Police : **Geist** (400, 500, 600, 700, 800), embarquée via `@fontsource-variable/geist`. Repli : `"Segoe UI Variable Display", system-ui, sans-serif`. Chemins Windows : `ui-monospace, Consolas, monospace`.
- Lissage : `-webkit-font-smoothing: antialiased`. Chiffres : `font-variant-numeric: tabular-nums` pour compteurs et durées.

| Rôle | Taille / graisse / interlettrage |
|---|---|
| Titre carrousel | 54 px / 800 / -1.6 px, interligne 1 |
| Titre page de jeu | 52 px / 800 / -1.6 px |
| Titre d'écran (Bibliothèque, Paramètres) | 34 px / 800 / -0.9 px |
| Titre lancement | 30 px / 800 / -0.6 px |
| Titre de section | 21 px / 700 / -0.3 px |
| Titre de carte | 16 px / 650 |
| Corps | 14 px / 400-600 |
| Nom sous jaquette | 13.5-14 px / 600, une ligne avec ellipse |
| Méta | 12-13 px, `--muted` |
| Libellé de section latérale | 11 px / 600 / +1 px, majuscules |

### Rayons

Jaquette 16 px · carrousel 26 px · bouton Jouer 15-16 px · section 20 px · modale 20 px · bouton icône 11 px · champ de recherche 13 px · puce 999 px · miniature carrousel 10 px · miniature recherche 7 px.

### Espacements

Marge du contenu 28 px · gouttière grille 26 px (vertical) × 20 px (horizontal) · rangées 16 px · écart entre sections 30-38 px · padding des cartes 22 px.

## 2. Mise en page (fenêtre 1440 × 900 de référence, min 900 × 600)

- Barre latérale 248 px, padding `18px 12px 16px 24px`, bordure droite `--border-1`.
- Zone principale : barre du haut 64 px, puis écran qui défile (barre de défilement fine, pouce `rgba(255,255,255,.1)`).
- Sous 1000 px de large : la barre latérale se replie en rail de 76 px (icônes et points seuls, info-bulles au survol).

## 3. Composants

### Bouton de navigation latérale
40 px de haut, padding 0 12 px, rayon 11 px, icône 18 px + libellé + compteur aligné à droite. Survol `--surface-3`. Actif : fond `rgba(255,255,255,.08)`, texte blanc, barre verticale de 3 px couleur d'accent à gauche (`left:-12px`, inset vertical 11 px).

### Champ de recherche
Largeur max 560 px, 40 px, rayon 13 px, fond `--surface-2`, bordure `--border-2`, icône loupe, touche `Ctrl K` dans un `kbd`. Focus : bordure accent à 60 %, halo de 4 px `--accent-soft`. Panneau de résultats : `rgba(22,24,32,.92)`, flou 30 px, bordure `--border-3`, ombre `0 30px 70px rgba(0,0,0,.6)`.

### Carte de jeu (jaquette)
- Ratio 2:3, rayon 16 px, fond `#151821`, liseré intérieur `inset 0 0 0 1px rgba(255,255,255,.09)`, ombre `0 10px 30px -14px rgba(0,0,0,.9)`.
- Survol : `translateY(-6px) scale(1.025)`, anneau `0 0 0 2px` accent à 85 % + lueur `0 26px 50px -16px` accent à 60 %, image intérieure `scale(1.06)`. Durée 0,4 s, `cubic-bezier(.2,.8,.2,1)`.
- Voile bas `linear-gradient(0deg, rgba(0,0,0,.7), transparent 55%)` + bouton blanc « Ouvrir » (36 px, rayon 11 px) qui monte de 10 px à 0.
- Étoile favori 30 × 30 px, rayon 9 px, fond `rgba(0,0,0,.5)` flou 10 px, visible au survol ou si actif (étoile pleine `--star`).
- Focus clavier : même rendu que le survol.

### Jaquette générée (jeu sans image)
Dégradé à 160° calculé à partir d'un hash du nom : `hsl(h 75% 50%)` → `hsl(h+45 70% 28%)` à 65 % → `hsl(h+80 60% 12%)`. Nom du jeu en bas à gauche, 19-22 px, 800, interligne 1.05. Optionnel : icône de l'exe dans une pastille de verre en haut à gauche.

### Bouton Jouer
50-52 px, padding `0 28px 0 22px`, rayon 15-16 px, fond accent, texte blanc 650, icône triangle pleine 16 px. Ombre `0 12px 34px -10px` accent + reflet `inset 0 1px 0 rgba(255,255,255,.25)`. Survol : `translateY(-2px)`, `brightness(1.1)`, ombre plus large. Appui : `scale(.97)`.

### Bouton fantôme (sur image)
Fond `rgba(255,255,255,.1)`, flou 20 px, bordure `--border-3`. Survol `rgba(255,255,255,.18)`.

### Puce de filtre
34 px, rayon 999 px, bordure `rgba(255,255,255,.09)`. Active : fond blanc, texte `#0a0b0f`.

### Contrôle segmenté
Conteneur 3 px de padding, rayon 11 px. Segment actif `rgba(255,255,255,.12)`.

### Interrupteur
44 × 26 px, pastille 20 px blanche, actif = fond accent, glissement 0,3 s `cubic-bezier(.2,.8,.2,1)`. Rôle `switch` avec `aria-checked`.

### Pastille de couleur d'accent
34 px ronde. Active : `box-shadow: 0 0 0 3px #0f1117, 0 0 0 5px #fff`.

### Carte « En jeu » (barre latérale)
Fond `rgba(52,211,153,.08)`, bordure `rgba(52,211,153,.25)`, rayon 14 px, miniature 34 × 48 px, libellé « EN JEU · mm:ss » 11 px vert, point pulsant.

### Menu contextuel
Min 220 px, padding 6 px, `rgba(24,26,34,.86)` flou 30 px, bordure `--border-3`, rayon 14 px. Entrées 36 px, icône 16 px. Entrée destructive en `--danger`.

### Toast
Bas centre, `rgba(24,26,34,.9)` flou 24 px, rayon 14 px, miniature 28 px éventuelle. Erreur : bordure `rgba(229,72,77,.5)`.

## 4. Mouvement

Courbe par défaut : `cubic-bezier(.2,.8,.2,1)`. Tous les mouvements sont désactivés ou réduits à un fondu sous `prefers-reduced-motion: reduce`.

| Nom | Définition | Où |
|---|---|---|
| Entrée d'écran | 0,5 s, opacité 0 → 1, `translateY(10px)` → 0 | Chaque changement d'écran |
| Apparition en cascade | 0,55 s, opacité 0, `translateY(16px) scale(.98)` → normal, délai `min(index, 24) × 35 ms` | Jaquettes, lignes « plus joués » |
| Fondu carrousel | images empilées, opacité 0 → 1 en 1,1 s | Carrousel |
| Ken Burns | 9 s (14 s sur la page de jeu), `scale(1.04)` → `scale(1.14) translate(-1.5%,-1%)`, `ease-out` | Image active du carrousel, bannière de jeu |
| Texte carrousel | 0,6 s opacité + 0,7 s `translateY(14px)` → 0, délai 0,15 s | Bloc titre du carrousel |
| Progression miniature | barre blanche 3 px, largeur 0 → 100 % en 6,5 s linéaire | Miniature active |
| Survol jaquette | voir composant | Cartes |
| Apparition jaquette | 0,7 s `cubic-bezier(.2,1.4,.4,1)`, `scale(.7) translateY(30px)` → normal, puis flottement 3,2 s (−8 px) en boucle | Page de jeu, lancement |
| Halo | 2,2 s en boucle, opacité .7 → .45, `scale(1)` → `scale(1.12)` | Lancement |
| Barre de lancement | 0 → 100 % en 3 s `cubic-bezier(.4,0,.2,1)` | Lancement |
| Point « en jeu » | pulsation d'anneau vert 1,6 s | Barre latérale, page de jeu |
| Résultats de recherche | 0,25 s entrée d'écran | Panneau de recherche |
| Toast | 0,35 s montée de 14 px + `scale(.97)` ; sortie 0,25 s | Toasts |
| Modale / menu | 0,16-0,22 s `scale(.96)` → 1 + fondu | Modales, menu contextuel |

## 5. Jaquettes et images

- Jeux Steam : `https://shared.steamstatic.com/store_item_assets/steam/apps/<appid>/library_600x900_2x.jpg`, repli `https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_600x900_2x.jpg`, puis `header.jpg` affiché en mode paysage (image centrée sur un fond flou d'elle-même), puis jaquette générée.
- Bannière : `library_hero.jpg` (mêmes hôtes). Sans bannière : la jaquette floutée.
- Jeux hors Steam (`find_artwork` côté backend) : d'abord l'image native du store (catalogue local Epic, API GOG, catalogue Microsoft Store pour Xbox), puis l'ID Steam trouvé via `store.steampowered.com/api/storesearch/?term=<nom>&l=english&cc=US` (nom normalisé exact, puis préfixe), puis SteamGridDB (jaquettes 600x900 et bannières) si une clé API est saisie dans les Paramètres. Résultats mis en cache. L'utilisateur peut corriger via « Changer la jaquette ».
- Jeux Steam sans jaquette sur le CDN : même repli vers SteamGridDB.
- Jaquette personnalisée : image locale copiée dans `%APPDATA%\studio.pamal.hangar\covers\`.
- Les images distantes sont mises en cache disque par le backend (voir ARCHITECTURE.md) pour un affichage instantané hors ligne.
- Apparition des images : opacité 0 → 1 en 0,4 s une fois chargées, fond `#151821` en attendant (ou un léger shimmer).

## 6. Icônes

Icônes au trait, 18 px, épaisseur 1,8, bouts arrondis (style Lucide). Utiliser `lucide-svelte`. Jamais d'emoji. Pas de logos de stores : un point de couleur + le nom.

## 7. Textes de l'interface (exacts)

Accueil, Bibliothèque, Favoris, Paramètres, Stores, Ajouter un jeu, Rechercher parmi N jeux, Reprendre, Tes dernières sessions, Favoris / N jeux épinglés, Les plus joués, Toute la bibliothèque, Jouer, Voir la fiche, En cours, Arrêter, Se lance via <launcher>, Activité, Temps de jeu, Dernière session, Lancements, Taille, 14 derniers jours, heures par jour, Informations, Emplacement, Lanceur, Ajouté, Ouvrir le dossier, Renommer, Changer la jaquette, Masquer de la bibliothèque, Aussi dans ta bibliothèque, Ouverture de <launcher>…, Démarrage de <jeu>…, Bon jeu !, Annuler, Stores détectés, Dossiers de jeux locaux, Ajouter un dossier, Couleur d'accent, Comportement, Aujourd'hui, Hier, Il y a N jours.

Le tutoiement est utilisé partout.

## 8. Identité visuelle (logo)

Source : la DA fournie par l'utilisateur, `design/brand/da-hangar.webp`.

- Le logo est une arche de hangar en dégradé (lavande `#dcd8e3` en haut, violet `#6e3bf6` en bas à gauche, gris violacé `#6f6683` en bas à droite) avec une étoile à 4 branches violette (`#7440f4` vers `#652cee`). Il est redessiné en vectoriel dans `design/brand/hangar-mark.svg` (référence), et repris dans `src/lib/components/Logo.svelte`.
- `design/brand/hangar-wordmark.png` : le texte « Hangar » extrait de la DA, fond transparent. `design/brand/hangar-logo.png` : logo complet (arche + texte).
- `design/brand/hangar-icon.svg` / `hangar-icon-1024.png` : icône d'application (tuile sombre arrondie avec les lueurs violettes de la DA).
- `npm run brand` régénère l'icône, le favicon (`public/favicon.svg`, `public/favicon-32.png`) et les icônes Tauri (`src-tauri/icons/`, dont `icon.ico` pour l'exe et l'installeur).

## 9. Hangar MC (écran Minecraft) : la DA de Hangar en pixels

L'écran Minecraft et sa popup des versions gardent les couleurs, l'accent, le fond et les jaquettes générées de Hangar, passés en pixel art. Styles partagés : `src/lib/styles/mc.css` (classe `.mc` sur le conteneur).

- Police des titres, boutons, étiquettes et numéros de version : **Pixelify Sans** (`@fontsource-variable/pixelify-sans`, OFL, embarquée). Le corps reste en Geist.
- Pixel de base `--px` : 3 px (4 px dans la bannière, 2 px pour les petites étiquettes).
- Pas d'arrondis : coins crantés d'un pixel (`.px`, `clip-path`). Pas d'ombres floues : relief en biseau (`.px-bevel`, lumière en haut à gauche, ombre en bas à droite) et creux façon case d'inventaire (`.px-slot`).
- Boutons `.btn.px` : biseau, ombre basse de 2 pixels, enfoncés d'un pixel au clic. Le focus passe à l'intérieur (cadre texte + accent), le crantage coupant le contour extérieur.
- Bannière : dégradé `generatedBackground` de la famille de version, trame de 8 px, étoiles carrées qui clignotent par paliers, collines en blocs (`shape-rendering: crispEdges`) dont l'herbe prend la couleur d'accent, logo pixel de 96 px qui flotte par paliers.
- Progression : barre d'expérience en cases (dégradé répété), remplissage par paliers.
- Animations en `steps()`, coupées avec `prefers-reduced-motion`.
- Tuiles des versions (façon Lunar) : affiche officielle de Mojang quand elle existe, sinon jaquette pixel `McCover` (dégradé de la famille, trame, collines, « MINECRAFT » et le nom de la mise à jour, logo pixel), cadre d'accent quand elle est choisie.
- Logo de Hangar MC (barre latérale, bannière, tuiles, fenêtres) : le logo de Hangar (arche et étoile) en pixels 17 x 13, monochrome (`src/lib/components/McLogo.svelte`, couleur du texte). Même dessin que l'accueil du mod (`Home.MARK`).
