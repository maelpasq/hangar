# Dashboard admin - charte graphique

Charte du dashboard d'administration (`admin/`). Elle complète `docs/DESIGN.md` (le design system de l'app) et `docs/ADMIN.md` (fonctionnel, API, accès). **La maquette validée fait foi** : `design/reference/admin/*.dc.html` (un fichier par écran). Comme pour `maquette-hangar.dc.html`, ce sont des templates de l'outil de design de Claude (`<x-dc>`, `<sc-for>`, `<sc-if>`, `{{ ... }}`) : référence exacte des valeurs, pas du code à copier. Y chercher la valeur voulue avec `rg`, ne jamais les lire en entier.

| Écran | Référence | Page Svelte |
|---|---|---|
| Accueil | `design/reference/admin/Main.dc.html` | `admin/src/pages/Accueil.svelte` |
| Bugs + fiche | `design/reference/admin/Bugs.dc.html` | `Bugs.svelte`, `Bug.svelte` |
| Comptes + fiche | `design/reference/admin/Comptes.dc.html` | `Comptes.svelte`, `Fiche.svelte` |
| Journal | `design/reference/admin/Journal.dc.html` | `Journal.svelte` |

Un écran sans maquette (ex. `Signalements.svelte`) reprend les composants ci-dessous, sans en inventer de nouveaux.

## 1. Principe

Le dashboard est la même famille visuelle que l'app Hangar : sombre, vitré, accent violet, Geist, coins arrondis généreux, mouvements doux. Il n'a pas de jaquettes ni de fond d'ambiance flouté : c'est un outil de lecture et de tri, la densité passe avant le spectacle.

## 2. Tokens : uniquement ceux de l'app

Toutes les couleurs, rayons, polices et courbes viennent de `src/lib/styles/tokens.css` (importé par le dashboard). **Aucun hex en dur dans un composant Svelte**, sauf les couleurs de statut et de badge définies une seule fois (section 3). Correspondance des valeurs de la maquette :

| Maquette | Token | Usage |
|---|---|---|
| `#0a0b0f` | `--bg` | fond de page |
| `rgba(10,11,15,.55)` | `--sidebar` | barre latérale |
| `rgba(255,255,255,.035)` | `--surface-1` | fond des cartes |
| `rgba(255,255,255,.045)` | `--surface-2` | boutons, champs, recherche |
| `rgba(255,255,255,.07)` | `--surface-3` | survol |
| `rgba(255,255,255,.1)` / `.12` | `--surface-4` | état actif (segment, nav) |
| `rgba(255,255,255,.05)` | `--border-1` | séparateurs, bord de la barre latérale, lignes de tableau |
| `rgba(255,255,255,.08)` | `--border-2` | bord des cartes, boutons, champs |
| `rgba(255,255,255,.14)` | `--border-3` | bord au survol |
| `#fff` | `--strong` | titres, chiffres |
| `#eef0f6` | `--text` | texte courant |
| `#d7dae4` | `--text-soft` | texte de bouton, libellés de ligne |
| `#c3c7d4` | `--text-2` | texte secondaire dense |
| `#a7acbd` | `--text-3` | libellés de champ, chips au repos |
| `#9ea3b5` | `--text-nav` | entrées de navigation |
| `#8b90a3` | `--muted` | sous-titres, méta, en-têtes de tableau |
| `#80859a` | `--muted-2` | numéros `#41`, compteurs, axes |
| `#7c6cff` | `--accent` | accent (suit le réglage d'accent) |
| `#a99bff` / `#b3a9ff` / `#cfc7ff` | `--accent-text` | texte et icônes en accent |
| `rgba(124,108,255,.14)` | `--accent-soft` | fond de ligne sélectionnée, puce « Admin » |
| `#34d399` / `#6ee7b7` | `--success` / `--success-text` | en ligne, corrigé, hausse |
| `#e5484d` / `#ff8f94` | `--danger` / `--danger-text` | signalement, retrait, Prod |
| `#fbbf24` | `--star` | environnement Test, chasseur de bugs |
| 20 px | `--r-section` | cartes |
| 11 px | `--r-btn` | boutons, champs, entrées de nav |
| Geist | `--font` | tout le texte |
| `ui-monospace` | `--mono` | numéros, identifiants, versions, codes ami |
| `cubic-bezier(.2,.8,.2,1)` | `--ease` | toutes les transitions |

Le thème clair de l'app (`data-theme="light"`) doit continuer à marcher : c'est la raison de passer par les tokens. Les fonds teintés s'écrivent `color-mix(in srgb, <couleur> 14%, transparent)`, jamais en `rgba` figé.

## 3. Couleurs de statut et de badge

Définies une seule fois : statuts dans `admin/src/bug-status.ts` (déjà en place), badges dans `admin/src/badges.svelte.ts`. La couleur d'un badge est celle choisie dans l'écran Badges (gardée sur le serveur, la même que dans l'app), parmi la palette de ce module ou libre ; deux badges n'ont jamais la même. Une puce = point de couleur + texte clair sur fond teinté à 14-16 %.

| Statut | Couleur | Ouvert |
|---|---|---|
| Nouveau | `var(--accent)` | oui |
| Confirmé | `#f5a524` | oui |
| En cours | `#3b82f6` | oui |
| Corrigé | `var(--success)` | non |
| Rejeté, Doublon | `var(--muted-2)` | non |

| Badge d'origine | Couleur |
|---|---|
| Compte certifié | `var(--accent)` |
| Équipe Hangar | `#8d70ff` |
| Testeur de Hangar | `#22b8a6` |
| Chasseur de bugs | `#3fb950` |

Actions du journal : `bug.statut` accent, `bug.note` bleu `#3b82f6`, `badge.donner` succès, `badge.retirer` danger. Ne jamais distinguer deux états par la teinte seule : la puce porte toujours son libellé.

## 4. Mise en page

- Coquille : barre latérale 236 px + contenu fluide (`grid-template-columns: 236px minmax(0, 1fr)`). Barre latérale : padding `18px 12px 18px 26px`, bord droit `--border-1`.
- Contenu : padding `34px 40px 48px`, colonne avec `gap: 22-24px` entre blocs. Pas de largeur max imposée.
- En-tête de page : `h1` 30 px / 700 / `letter-spacing: -0.6px` / `--strong`, sous-titre 14 px `--muted` dessous (gap 6 px). Actions à droite, alignées en bas, qui passent à la ligne.
- Chiffres clés : `grid-template-columns: repeat(auto-fit, minmax(190px, 1fr))`, gap 14 px.
- Blocs en grille : `repeat(auto-fit, minmax(min(100%, 420px), 1fr))`, gap 14 px. Le graphique d'inscriptions couvre 2 colonnes.
- Liste + fiche (Bugs, Comptes) : deux colonnes flex qui passent l'une sous l'autre, gap 16 px. Bugs : liste `flex: 1 1 400px`, fiche `flex: 1.25 1 460px`. Comptes : liste `flex: 1 1 340px; max-width: 440px`, fiche `flex: 1.6 1 520px`.
- Sous 760 px : la barre latérale passe en bandeau horizontal (logo + nav en ligne, pied masqué), contenu en padding `22px 16px 40px`. Les tableaux défilent horizontalement dans leur carte (`overflow-x: auto`, `min-width: 760px` sur la table).

## 5. Composants

Valeurs exactes dans la maquette (`rg -n 'class="nav' design/reference/admin/Main.dc.html`, etc.). Chaque composant existe une fois, en classe globale dans `admin/src/style.css` ou en composant Svelte, et n'est pas redéfini page par page.

- **Logo + « Admin »** : logo de l'app 30 px, « Hangar » 17 px / 700, puce « Admin » 22 px de haut, rayon 7, fond `--accent-soft`, texte `--accent-text` 11,5 px / 600.
- **Titre de section de barre latérale** : 11 px / 600, majuscules, `letter-spacing: 1px`, `--muted`.
- **Entrée de nav** (`.nav`) : 40 px, padding 0 12 px, rayon `--r-btn`, gap 12, 14 px / 500, `--text-nav`. Survol `--surface-2` + `--text`. Active : `--surface-4` (8 %), texte `--strong`, icône `--accent-text`, barre de 3 px `--accent` à gauche (`left: -14px; top/bottom: 11px`). Compteur à droite 12 px `--muted-2` chiffres tabulaires.
- **Pied de barre latérale** : carte « API en ligne » (point vert pulsé 8 px, 12,5 px / 600 + nom d'hôte en mono 11,5 px), puis puce d'environnement (Test : `--star`, Prod : `--danger-text`) et e-mail admin 12 px `--muted` tronqué.
- **Carte** (`.card`) : `--surface-1`, bord `--border-2`, rayon `--r-section`, padding 18-24 px. Titre de carte `h2`/`h3` 15 px / 600 `--strong`, sous-titre 13 px `--muted`. Lien « Tout voir » à droite, 13 px, couleur accent.
- **Chiffre clé** (`.kpi`) : carte padding `18px 20px`, gap 14 : libellé 13 px / 500 `--text-3` + pastille d'icône 32 px rayon 10 (fond teinté 14 %, icône 16 px de la couleur) ; valeur 32 px / 700 / `letter-spacing: -1px` chiffres tabulaires ; ligne de contexte 12,5 px `--muted` avec la variation en couleur (+37 en `--success-text`). Survol : bord `--border-3`, `translateY(-2px)`. Le chiffre qui demande une action (bugs ouverts) est mis en avant : dégradé accent 22 % vers 5 %, bord accent 35 %, et c'est un lien vers la page.
- **Bouton secondaire** (`.btn`) : 36 px, padding 0 14, rayon `--r-btn`, bord `--border-2`, fond `--surface-2`, 13 px / 500 `--text-soft`, icône 16 px à gauche.
- **Bouton principal** (`.primary`) : 40 px, padding 0 18, dégradé `#8b7bff` vers `#6d5cf5` (à exprimer depuis `--accent`), texte blanc 14 px / 600, ombre `--accent-shadow`. Survol `translateY(-1px)` + `brightness(1.08)`. Un seul par formulaire.
- **Recherche** (`.search`) : 40 px, rayon 12, bord `--border-2`, fond `--surface-2`, icône 17 px `--muted`. Focus : bord accent 60 %, halo `0 0 0 4px` accent 14 %. Toujours un `<label>` (visuellement masqué si besoin).
- **Champ** (`.field`) : 40 px, padding 0 12, mêmes bord, fond et focus que la recherche. `textarea` 88 px, `line-height: 1.5`. Libellé `.lbl` 12 px / 600 `--text-3`, 7 px au-dessus. Champ inactif : `disabled` + opacité 0,45.
- **Chip de filtre** (`.chip`) : 34 px, pilule, bord 9 %, fond 3 %, 13 px `--text-3`, compteur à droite opacité 0,7. Actif : fond blanc, texte `--bg`. Rôle `tablist`/`tab` avec `aria-selected`.
- **Puce** (`.pill`) : 24 px, pilule, padding 0 10, 12 px / 600, point de 7 px. Fond teinté, texte clair de la même couleur.
- **Ligne de liste** (`.row`) : `<button>` ou `<a>`, padding `12px 14px`, rayon 13, gap 14. Numéro mono `--muted-2` à gauche, titre 14 px / 500 tronqué + méta 12 px `--muted` (séparateur `·`), puce de statut à droite. Survol `--surface-2`. Sélectionnée : `--accent-soft` + `inset 0 0 0 1px` accent 35 %.
- **Avatar** : carré arrondi (rayon 12 en liste à 38 px, rayon 22 en fiche à 72 px), initiale blanche, point « en ligne » 11 px `--success` cerclé de la couleur du fond.
- **Segment de statut** (`.seg`) : boutons 34 px, rayon 10, bord `--border-2`, point de couleur 8 px + libellé 13 px. Actif : fond 12 %, bord 20 %, texte `--strong`. `aria-pressed`. Dans un `<fieldset>` avec `<legend>`.
- **Choix d'emblème et de couleur** (écran Badges) : `.seg` tel quel. Emblème : bouton carré de 40 px, emblème de l'app 18 px (`BadgeIcon.svelte`), `aria-label` avec son nom, le choisi dans la couleur du badge. Couleur : point de 8 px + nom de la couleur ; celles des autres badges désactivées (infobulle « Déjà prise : <badge> »), plus un bouton « Libre » avec le sélecteur natif de 20 px en guise de point et la valeur hexadécimale.
- **Interrupteur** (`.tog`) : 44 × 26, pastille 20 px, actif `--accent`. `<button role="switch" aria-checked>` avec `aria-label` « Donner / Retirer le badge X ».
- **Encart signalement** : fond danger 8 %, bord danger 22 %, rayon 14 ; motif en `--danger-text` / 600 ; extrait cité dans un bloc `rgba(0,0,0,.3)` rayon 10 en italique.
- **Bloc de texte lu** (description d'un bug) : fond `rgba(0,0,0,.25)`, bord `--border-1`, rayon 14, 14 px / 1,6, `white-space: pre-line`.
- **Historique** : liste ordonnée, point 9 px de la couleur du statut + halo 4 px, texte 13,5 px `--text-soft`, qui/quand 12 px `--muted`.
- **Tableau** (Journal) : en-têtes 11 px / 600 majuscules `letter-spacing: 1px` `--muted`, cellules padding `14px 16px`, séparateur `--border-1`, survol de ligne 3 %. Pagination : un `.btn` centré « Charger 50 lignes de plus ».
- **Histogramme** : barres rayon `6px 6px 3px 3px`, largeur max 22 px, gap 5, accent à 42 % et le jour courant en accent plein ; survol : barre `--accent-text` + infobulle (fond `--popover`, bord 10 %, 11,5 px). Deux lignes de repère pointillées `--border-1`, trois dates sous l'axe (12 px `--muted-2`). `role="img"` + `aria-label`.
- **Barre de progression** (badges donnés) : 6 px, rayon 6, fond 6 %, remplissage couleur du badge, proportion au plus grand.
- **État vide** : texte centré `--muted`, padding 28-40 px, phrase courte (« Aucun bug pour ce filtre. »).

## 6. Typographie

Geist partout (`@fontsource-variable/geist`, embarquée, pas de Google Fonts). Échelle : 30 (h1) / 24 (nom dans une fiche) / 22 (titre d'un bug) / 15 (titres de carte) / 14 (texte) / 13,5 / 13 / 12,5 / 12 / 11 (sur-titres majuscules). Graisses 400, 500, 600, 700 uniquement. Tous les chiffres en `font-variant-numeric: tabular-nums`. Mono (`--mono`, 12,5 px) pour `#41`, versions, identifiants, codes ami, noms d'hôte.

## 7. Icônes

Celles de l'app : `src/lib/components/Icon.svelte` (trait, 1,8, bouts arrondis), tailles 13 à 18 px selon le contexte (18 nav, 16 boutons et pastilles, 13-14 dans les puces). Une icône manquante s'ajoute à `Icon.svelte` dans le même style, jamais d'emoji ni d'autre bibliothèque.

## 8. Mouvement

Entrée de page : `opacity 0 → 1` + `translateY(10px → 0)` en 0,5 s `--ease`. Survols 0,15-0,2 s. Interrupteur 0,3 s. Point « en ligne » pulsé (keyframe `hgPulse` de l'app). Rien d'autre ne bouge. Tout est coupé sous `prefers-reduced-motion: reduce` (déjà dans `style.css`).

## 9. Textes

Français, ton court et neutre d'outil. Dates relatives courtes (« il y a 7 h », « hier », « 15 nov. 10:24 »). Séparateur de méta : `·`. Flèche de changement de statut : `→`. **Jamais de tiret cadratin** (U+2014). Nombres à la française (`1 284`, `32 %`).

## 10. Accessibilité

Règles de l'app (CLAUDE.md) : vrais `<button>`, `<a href>`, `<input>` + `<label>`, `aria-label` sur les boutons-icônes, focus visible (`--accent-ring`), `aria-current="page"` sur la nav active. Contraste 4,5:1 minimum, y compris les textes 11-12 px : ne jamais descendre sous `--muted-2` pour du texte.

## 11. Vérification avant de rendre un écran

1. Comparer à la maquette de l'écran : espacements, tailles, couleurs, ordre des blocs.
2. `rg -n '#[0-9a-fA-F]{3,8}\b' admin/src` : aucun hex hors `bug-status.ts` et du module des badges.
3. Thème clair : l'écran reste lisible.
4. Largeur 760 px et moins : barre latérale en bandeau, rien ne déborde.
5. Navigation clavier complète, focus visible.
6. `npm run verify`.
