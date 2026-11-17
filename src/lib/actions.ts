// Actions qui touchent à la fois la bibliothèque et l'interface.

import { hideElsewhere } from './ghosts';
import { api } from './api';
import { accounts } from './stores/accounts.svelte';
import { art } from './art.svelte';
import { cloud } from './stores/cloud.svelte';
import { social } from './stores/social.svelte';
import { STORES } from './stores-meta';
import { library } from './stores/library.svelte';
import { updater } from './stores/update.svelte';
import { runner } from './stores/runner.svelte';
import { ui } from './stores/ui.svelte';
import { plural } from './util/format';

export function hideGame(id: string): void {
  const g = library.get(id);
  if (!g) return;
  // Jeu du compte absent d'ici : masqué sur ce PC seulement.
  if (g.elsewhere) return hideElsewhere(id);
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

/** Désinstalle : Hangar supprime lui-même les jeux Steam et Epic (avec garde-fous, manage.rs),
 * sinon le désinstalleur du jeu ou son launcher. */
export async function confirmUninstall(id: string): Promise<void> {
  const g = library.get(id);
  if (!g || g.notInstalled) return;
  ui.toast(`Désinstallation de ${library.name(g)}…`, { gameId: id });
  try {
    ui.toast(await api.uninstallGame(id), { gameId: id });
    // État noté avant le rescan : sinon il est déjà final et le suivi ne s'arrête jamais.
    runner.watchInstall(id);
    await rescan();
    runner.settleInstall(id);
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
    if (g.updatePending && g.store === 'steam') runner.follow(id, 'update');
    else if (g.updatePending) runner.watchInstall(id);
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
  announceUpdates(before);
}

let refreshing = false;

/**
 * Bouton Actualiser de la barre du haut : tout ce qui peut l'être dans l'app. Scan complet avec
 * synchro forcée des comptes de launchers et des versions des jeux (Epic, GOG), compte Hangar
 * (état, postes, synchro, temps de jeu), amis (listes, messages, activité, temps réel), mise à
 * jour de Hangar, jaquettes introuvables, et données des écrans ouverts (page de jeu, profil).
 * Le toast du nombre de jeux porte une rangée d'infobulles, une par élément rafraîchi, ajoutées
 * au fil de l'eau ; il reste affiché jusqu'à la dernière.
 */
export async function refreshAll(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  // Infobulles arrivées avant le toast (fin du scan), puis ajoutées directement à celui-ci.
  const early: string[] = [];
  let toastId: number | null = null;
  const chip = (text: string | null) => {
    if (!text) return;
    if (toastId === null) early.push(text);
    else ui.chip(toastId, text);
  };
  try {
    lastUpdateCheck = Date.now();
    const before = new Set(library.updates.map((g) => g.id));
    ui.refreshes++;
    if (ui.screen === 'game') chip('Page du jeu');
    else if (ui.screen === 'profile') chip('Profil');

    const syncedBefore = cloud.lastSync;
    const parts: Promise<unknown>[] = [
      accounts.refresh().then(() => {
        const names = accounts.list.filter((a) => a.connected).map((a) => STORES[a.store].label);
        chip(names.length ? `Comptes : ${names.join(', ')}` : null);
      }),
      // Compte Hangar : état (postes, retour du réseau) puis synchro, puis les amis.
      cloud
        .refresh()
        .then(() => cloud.sync())
        .then(() => {
          chip(cloud.status.connected && cloud.lastSync > syncedBefore ? 'Compte Hangar synchronisé' : null);
          return social.reloadAll();
        })
        .then(() => chip(social.enabled ? 'Amis et messages' : null)),
      updater
        .check(true, false)
        .then(() =>
          chip(
            updater.phase === 'uptodate'
              ? 'Hangar à jour'
              : updater.phase === 'available'
                ? `Hangar ${updater.version} disponible`
                : null
          )
        )
    ];

    // Un scan déjà en cours est suivi d'un scan forcé, que l'on attend.
    const n = await rescan(false, true);
    const updates = library.updates.length;
    chip(updates ? `${plural(updates, 'mise à jour', 'mises à jour')} de jeux` : 'Jeux à jour');
    toastId = ui.toast(n === null ? 'Actualisation terminée' : `${plural(n, 'jeu', 'jeux')} dans ta bibliothèque`, {
      chips: early,
      hold: true
    });
    announceUpdates(before);

    parts.push(
      art.retryMissing().then((r) => {
        if (!r?.tried) return;
        chip(r.found ? plural(r.found, 'jaquette trouvée', 'jaquettes trouvées') : 'Jaquettes manquantes recherchées');
      })
    );
    // Le toast reste jusqu'à la dernière infobulle (20 s au plus si un service ne répond pas).
    await Promise.race([Promise.allSettled(parts), new Promise((r) => setTimeout(r, 20_000))]);
  } finally {
    refreshing = false;
    if (toastId !== null) ui.release(toastId, 4000);
  }
}

/** Annonce les jeux dont la mise à jour est apparue depuis `before`. */
function announceUpdates(before: Set<string>): void {
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

/** Relance le scan ; `announce` affiche le nombre de jeux à la fin, `force` resynchronise les
 *  comptes sans attendre les 6 h. Rend le nombre de jeux (null : échec). */
export async function rescan(announce = false, force = false): Promise<number | null> {
  try {
    const n = await library.scan(force);
    // Ce que chaque compte apporte est calculé pendant le scan.
    void accounts.refresh();
    void runner.resumeDownloads();
    if (announce) ui.toast(`${plural(n, 'jeu', 'jeux')} dans ta bibliothèque`);
    return n;
  } catch (e) {
    ui.toast(`Le scan a échoué : ${String(e)}`, { error: true });
    return null;
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
