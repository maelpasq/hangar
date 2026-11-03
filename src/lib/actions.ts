// Actions qui touchent à la fois la bibliothèque et l'interface.

import { api } from './api';
import { art } from './art.svelte';
import { library } from './stores/library.svelte';
import { ui } from './stores/ui.svelte';
import { plural } from './util/format';

export function hideGame(id: string): void {
  const g = library.get(id);
  if (!g) return;
  library.hide(id);
  if (ui.screen === 'game' && ui.gameId === id) ui.back();
  ui.toast(`${library.name(g)} masqué`, {
    gameId: id,
    action: { label: 'Annuler', run: () => library.unhide(id) }
  });
}

export async function openFolder(id: string): Promise<void> {
  const g = library.get(id);
  if (!g?.installDir) return;
  try {
    await api.openFolder(g.installDir);
  } catch (e) {
    ui.toast(String(e), { error: true, gameId: id });
  }
}

/** Relance le scan ; `announce` affiche le nombre de jeux à la fin. */
export async function rescan(announce = false): Promise<void> {
  try {
    const n = await library.scan();
    if (announce) ui.toast(`${plural(n, 'jeu', 'jeux')} dans ta bibliothèque`);
    art.resolveSteamIds();
  } catch (e) {
    ui.toast(`Le scan a échoué : ${String(e)}`, { error: true });
  }
}

export async function addFolder(): Promise<void> {
  const dir = await api.pickFolder();
  if (!dir) return;
  if (!library.state.localFolders.some((f) => f.toLowerCase() === dir.toLowerCase())) {
    library.state.localFolders = [...library.state.localFolders, dir];
    library.save();
  }
  await rescan(true);
}

export async function removeFolder(dir: string): Promise<void> {
  library.state.localFolders = library.state.localFolders.filter((f) => f !== dir);
  library.save();
  await rescan();
}
