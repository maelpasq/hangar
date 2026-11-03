# Message à envoyer à Claude Code

Ouvre un terminal dans ce dossier, lance `claude`, puis colle le message ci-dessous.

---

Tu reprends le projet Hangar, un launcher de jeux pour Windows en Tauri 2.

Commence par lire `CLAUDE.md`, puis `docs/SPEC.md`, `docs/DESIGN.md`, `docs/ARCHITECTURE.md` et `docs/PLAN.md`. La maquette validée est dans `design/reference/maquette-hangar.dc.html` : c'est la référence visuelle exacte (couleurs, tailles, espacements, animations, textes).

Le dossier contient déjà une version 1 qui fonctionne : la détection des jeux de tous les stores dans `src-tauri/src/scanner.rs`, le lancement et une interface simple en HTML/JS. Ton travail est de construire l'application complète décrite dans les docs, en suivant `docs/PLAN.md` étape par étape :

- Garde et améliore la logique de détection existante, ne la réécris pas de zéro.
- Remplace l'interface par l'app Svelte 5 + TypeScript fidèle à la maquette.
- Ajoute le suivi des parties, le cache des images, la gestion (ajouter, renommer, masquer, jaquettes) et les paramètres.

À la fin de chaque étape, lance les vérifications listées dans CLAUDE.md, coche les cases dans PLAN.md et fais un commit. Si une information manque, choisis l'option la plus simple qui respecte la maquette, note-la dans `docs/DECISIONS.md` et continue sans t'arrêter.

Commence par l'étape 0, puis enchaîne.
