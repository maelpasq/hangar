// Jeux du compte Hangar introuvables sur ce PC (cartes en gris « Sur un autre PC ») :
// l'installer depuis son site, ou montrer où il est déjà (docs/COMPTE.md, section 4).

import { api } from './api';
import { library } from './stores/library.svelte';
import { ui } from './stores/ui.svelte';
import { manualGameFrom } from './util/games';

/** Bouton principal « Installer » : choix entre le site officiel du jeu et son exécutable local. */
export function playElsewhere(id: string): void {
  ui.menu = null;
  if (library.get(id)?.elsewhere) ui.modal = { kind: 'installChoice', gameId: id };
}

/** « J'ai déjà ce jeu » : l'exécutable choisi est rattaché au jeu du compte. */
export async function attachElsewhere(id: string): Promise<void> {
  ui.menu = null;
  const g = library.get(id);
  if (!g?.elsewhere) return;
  const path = await api.pickExe().catch(() => null);
  if (!path) return;
  const name = library.name(g);
  const game = manualGameFrom(path, g.name);
  library.attachGhost(id, game);
  if (ui.screen === 'game' && ui.gameId === id) ui.open(game.id);
  ui.toast(`${name} est maintenant sur ce PC`, { gameId: game.id });
}

/** Masque le jeu sur ce PC seulement : il reste sur le compte et les autres postes. */
export function hideElsewhere(id: string): void {
  const g = library.get(id);
  if (!g?.elsewhere) return;
  library.hideHere(id);
  if (ui.screen === 'game' && ui.gameId === id) ui.back();
  ui.toast(`${library.name(g)} masqué sur ce PC`, { action: { label: 'Annuler', run: () => library.unhide(id) } });
}
