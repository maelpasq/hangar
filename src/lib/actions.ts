// Actions qui touchent à la fois la bibliothèque et l'interface.

import { api } from './api';
import { library } from './stores/library.svelte';
import { runner } from './stores/runner.svelte';
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

/** Bouton « Afficher le launcher » des toasts : ses fenêtres sont cachées pendant les actions. */
export const showLauncher = {
  label: 'Afficher le launcher',
  run: () => {
    api
      .showLaunchers()
      .then((shown) => shown || ui.toast('Aucune fenêtre de launcher à afficher'))
      .catch(() => {});
  }
};

/** Demande confirmation dans Hangar avant de désinstaller. */
export function uninstallGame(id: string): void {
  const g = library.get(id);
  if (g && !g.notInstalled) ui.modal = { kind: 'uninstall', gameId: id };
}

/** Désinstalle par le désinstalleur du jeu, sinon par son launcher (Hangar ne supprime rien lui-même). */
export async function confirmUninstall(id: string): Promise<void> {
  const g = library.get(id);
  if (!g || g.notInstalled) return;
  try {
    ui.toast(await api.uninstallGame(id), { gameId: id });
    runner.watchInstall(id);
  } catch (e) {
    ui.toast(String(e), { error: true, gameId: id });
  }
}

/** Réveille le launcher du jeu, invisible, qui télécharge la mise à jour ; le rescan au retour dira si c'est fait. */
export async function updateGame(id: string): Promise<void> {
  const g = library.get(id);
  if (!g || g.notInstalled) return;
  try {
    ui.toast(await api.updateGame(id), { gameId: id, action: showLauncher });
    if (g.updatePending) runner.watchInstall(id);
  } catch (e) {
    ui.toast(String(e).replace(/^Error:\s*/, ''), { error: true, gameId: id });
  }
}

/** Écart minimal entre deux vérifications automatiques des mises à jour. */
const UPDATE_CHECK_MS = 5 * 60_000;
let lastUpdateCheck = Date.now();

/** Vérification automatique (minuterie, retour sur la fenêtre) : rescan discret, puis annonce
 *  des jeux dont la mise à jour vient d'apparaître. Jamais pendant une partie. */
export async function checkGameUpdates(): Promise<void> {
  if (library.scanning || runner.current || Date.now() - lastUpdateCheck < UPDATE_CHECK_MS) return;
  lastUpdateCheck = Date.now();
  const before = new Set(library.updates.map((g) => g.id));
  await rescan();
  const fresh = library.updates.filter((g) => !before.has(g.id));
  if (fresh.length === 1) {
    const g = fresh[0];
    ui.toast(`Mise à jour disponible pour ${library.name(g)}`, {
      gameId: g.id,
      action: { label: 'Mettre à jour', run: () => updateGame(g.id) }
    });
  } else if (fresh.length > 1) {
    ui.toast(`${plural(fresh.length, 'jeu a', 'jeux ont')} une mise à jour`, {
      action: { label: 'Voir', run: () => ui.updatesList() }
    });
  }
}

/** Relance le scan ; `announce` affiche le nombre de jeux à la fin. */
export async function rescan(announce = false): Promise<void> {
  try {
    const n = await library.scan();
    if (announce) ui.toast(`${plural(n, 'jeu', 'jeux')} dans ta bibliothèque`);
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
