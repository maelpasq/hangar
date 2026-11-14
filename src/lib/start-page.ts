// Onglet où Hangar s'ouvre : demandé dans la configuration de départ, modifiable dans les Paramètres.
import type { IconName } from './components/Icon.svelte';
import { library } from './stores/library.svelte';
import { ui } from './stores/ui.svelte';
import type { StartPage } from './types';

const FIXED: { value: StartPage; label: string; icon: IconName }[] = [
  { value: 'home', label: 'Accueil', icon: 'home' },
  { value: 'library', label: 'Bibliothèque', icon: 'grid' },
  { value: 'favorites', label: 'Favoris', icon: 'star' },
  { value: 'web', label: 'Jeux web', icon: 'globe' }
];

/** Onglets proposés : Jeux web seulement si l'onglet est activé, puis les collections. */
export function startPages(webGames: boolean): { value: StartPage; label: string; icon: IconName }[] {
  return [
    ...FIXED.filter((p) => p.value !== 'web' || webGames),
    ...library.state.collections.map((c) => ({ value: `collection:${c.id}` as const, label: c.name, icon: 'layers' as const }))
  ];
}

/** Ouvre l'onglet de départ (Accueil si pas encore choisi, ou s'il n'existe plus : Jeux web désactivé, collection supprimée). */
export function openStartPage(): void {
  const { startPage, webGames } = library.state.prefs;
  const col = startPage?.startsWith('collection:') ? startPage.slice('collection:'.length) : null;
  if (startPage === 'library') ui.libraryAll();
  else if (startPage === 'favorites') ui.favorites();
  else if (startPage === 'web' && webGames) ui.webGames();
  else if (col && library.state.collections.some((c) => c.id === col)) ui.collectionView(col);
  else return;
  // Premier écran : rien à retrouver avec Retour.
  ui.history = [];
}
