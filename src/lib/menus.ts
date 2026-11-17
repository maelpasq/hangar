// Menus contextuels (clic droit, touche Menu ou Maj+F10) : l'attachement qui les ouvre et les
// listes d'actions de chaque élément (jeu, joueur, collection, store...).

import type { Attachment } from 'svelte/attachments';
import { hideGame, openFolder, refreshAll, uninstallGame, updateGame } from './actions';
import { attachElsewhere, hideElsewhere } from './ghosts';
import { STORES } from './stores-meta';
import { library } from './stores/library.svelte';
import { runner } from './stores/runner.svelte';
import { social } from './stores/social.svelte';
import { ui, type MenuItem, type MenuTarget } from './stores/ui.svelte';
import type { Relation, StoreId } from './types';

/**
 * `{@attach contextMenu(() => cible)}` : ouvre le menu de la cible au clic droit, ou au clavier
 * (touche Menu, Maj+F10) sur l'élément qui a le focus. Une cible nulle laisse le clic passer.
 */
export function contextMenu(target: () => MenuTarget | null | undefined): Attachment<HTMLElement> {
  return (node) => {
    const open = (e: Event, x: number, y: number) => {
      const t = target();
      if (!t || ui.modal) return;
      e.preventDefault();
      // Le menu de l'élément le plus proche gagne (un joueur dans une ligne d'activité...).
      e.stopPropagation();
      ui.menu = { ...t, x, y };
    };
    const oncontextmenu = (e: MouseEvent) => {
      // Texte sélectionné dans l'élément : le menu du système, pour le copier.
      const sel = window.getSelection();
      if (sel?.toString().trim() && sel.anchorNode && node.contains(sel.anchorNode)) return e.stopPropagation();
      // Venu du clavier (touche Menu) : déjà ouvert par `onkeydown`, à la place de l'élément.
      if (e.button !== 2) return e.preventDefault();
      open(e, e.clientX, e.clientY);
    };
    const onkeydown = (e: KeyboardEvent) => {
      if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
      const r = node.getBoundingClientRect();
      open(e, r.left + Math.min(r.width / 2, 120), r.top + r.height / 2);
    };
    node.addEventListener('contextmenu', oncontextmenu);
    node.addEventListener('keydown', onkeydown);
    return () => {
      node.removeEventListener('contextmenu', oncontextmenu);
      node.removeEventListener('keydown', onkeydown);
    };
  };
}

/** Copie un texte et le confirme par un toast. */
export async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ui.toast(done);
  } catch {
    ui.toast('Copie impossible.', { error: true });
  }
}

// ─── Jeux ───

export function gameItems(id: string): MenuItem[] {
  const game = library.get(id);
  if (!game) return [];
  const fav = library.isFav(id);
  const onPage = ui.screen === 'game' && ui.gameId === id;
  const name = library.name(game);

  // Liste affichée (collection, favoris) : le retrait de cette liste, en tête du menu.
  const inLibrary = ui.screen === 'library';
  const coll = inLibrary ? library.collection(ui.collection) : undefined;
  const favList = inLibrary && ui.favOnly && fav;
  const list: MenuItem[] = [];
  if (coll?.games.includes(id)) {
    const cid = coll.id;
    list.push({
      label: `Retirer de « ${coll.name} »`,
      icon: 'x',
      run: () => {
        library.toggleInCollection(cid, id);
        ui.toast(`${name} retiré de « ${coll.name} »`, { action: { label: 'Annuler', run: () => library.toggleInCollection(cid, id) } });
      }
    });
  }
  if (favList) {
    list.push({
      label: 'Retirer des favoris',
      icon: 'star',
      run: () => {
        library.toggleFav(id);
        ui.toast(`${name} retiré des favoris`, { action: { label: 'Annuler', run: () => library.toggleFav(id) } });
      }
    });
  }

  const common: MenuItem[] = [
    ...list,
    ...(list.length ? ['sep' as const] : []),
    ...(favList ? [] : [{ label: fav ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: 'star', run: () => library.toggleFav(id) } satisfies MenuItem]),
    { label: 'Collections', icon: 'layers', run: () => (ui.modal = { kind: 'collections', gameId: id }) },
    { label: 'Renommer', icon: 'edit', run: () => (ui.modal = { kind: 'rename', gameId: id }) },
    { label: 'Changer la jaquette', icon: 'image', run: () => (ui.modal = { kind: 'cover', gameId: id }) }
  ];
  const page: MenuItem[] = onPage ? [] : [{ label: 'Voir la fiche', icon: 'grid', run: () => ui.open(id) }];

  // Jeu du compte Hangar introuvable sur ce PC : l'installer, le rattacher, le masquer ici.
  if (game.elsewhere) {
    return [
      { label: 'Installer', icon: 'download', run: () => runner.play(id) },
      { label: "J'ai déjà ce jeu : choisir l'exécutable", icon: 'folder', run: () => attachElsewhere(id) },
      ...page,
      'sep',
      ...common,
      'sep',
      { label: 'Masquer sur ce PC', icon: 'eyeOff', run: () => hideElsewhere(id), danger: true }
    ];
  }

  const running = runner.isRunning(id);
  const first: MenuItem[] = game.notInstalled
    ? [{ label: 'Installer', icon: 'download', run: () => runner.play(id) }]
    : running
      ? [
          { label: 'Revenir au jeu', icon: 'play', run: () => runner.resume(id) },
          { label: 'Arrêter', icon: 'stop', run: () => (ui.modal = { kind: 'stop', gameId: id }) }
        ]
      : [{ label: 'Jouer', icon: 'play', run: () => runner.play(id) }];

  return [
    ...first,
    ...page,
    'sep',
    ...common,
    'sep',
    { label: 'Ouvrir le dossier', icon: 'folder', run: () => openFolder(id), disabled: !game.installDir },
    ...(game.notInstalled
      ? []
      : ([
          { label: game.updatePending ? 'Mettre à jour' : 'Mises à jour', icon: 'refresh', run: () => updateGame(id) },
          { label: 'Désinstaller', icon: 'package', run: () => uninstallGame(id), disabled: running }
        ] satisfies MenuItem[])),
    'sep',
    { label: 'Masquer', icon: 'eyeOff', run: () => hideGame(id), danger: true }
  ];
}

// ─── Joueurs (amis, demandes, recherche, activité, conversation) ───

type Person = { id: string; name: string; relation: Relation };

export function userItems(u: Person, opts: { add?: () => void } = {}): MenuItem[] {
  const copy: MenuItem = { label: 'Copier le pseudo', icon: 'copy', run: () => copyText(u.name, 'Pseudo copié.') };
  if (u.relation === 'self') {
    return [
      { label: 'Voir mon profil', icon: 'user', run: () => ui.profile(u.id) },
      { label: 'Modifier mon profil', icon: 'edit', run: () => ui.settings('account') },
      copy
    ];
  }
  if (u.relation === 'blocked') {
    return [copy, 'sep', { label: 'Débloquer', icon: 'ban', run: () => social.unblock(u) }];
  }
  const report: MenuItem = {
    label: 'Signaler',
    icon: 'flag',
    danger: true,
    run: () => (ui.modal = { kind: 'socialReport', userId: u.id, name: u.name })
  };
  if (u.relation === 'blockedBy') return [copy, 'sep', report];

  const items: MenuItem[] = [];
  if (u.relation === 'friend') {
    items.push(
      { label: 'Envoyer un message', icon: 'chat', run: () => social.openChat(u.id) },
      { label: 'Proposer une partie', icon: 'gamepad', run: () => (ui.modal = { kind: 'socialInvite', userId: u.id, name: u.name }) }
    );
  }
  // L'action attendue d'abord (accepter, ajouter), puis le profil.
  if (u.relation === 'in') {
    items.push(
      { label: 'Accepter la demande', icon: 'check', run: () => (opts.add ? opts.add() : social.addFriend(u)) },
      { label: 'Refuser la demande', icon: 'x', run: () => social.removeFriend(u) }
    );
  } else if (u.relation === 'none') {
    items.push({ label: 'Ajouter en ami', icon: 'userPlus', run: () => (opts.add ? opts.add() : social.addFriend(u)) });
  }
  items.push({ label: 'Voir le profil', icon: 'user', run: () => ui.profile(u.id) });
  if (u.relation === 'out') items.push({ label: 'Annuler la demande', icon: 'x', run: () => social.removeFriend(u) });
  items.push(copy, 'sep');
  if (u.relation === 'friend') {
    items.push({
      label: 'Retirer des amis',
      icon: 'x',
      danger: true,
      run: () => (ui.modal = { kind: 'socialConfirm', action: 'remove', userId: u.id, name: u.name })
    });
  }
  items.push(
    {
      label: 'Bloquer',
      icon: 'ban',
      danger: true,
      run: () => (ui.modal = { kind: 'socialConfirm', action: 'block', userId: u.id, name: u.name })
    },
    report
  );
  return items;
}

/** Menu d'un joueur connu par son seul identifiant (activité, conversation) : relation d'après les listes. */
export function userTarget(id: string | null | undefined, name: string): MenuTarget | null {
  if (!id) return null;
  return {
    label: name,
    items: () => {
      const relation: Relation = id === social.me ? 'self' : (social.user(id)?.relation ?? 'none');
      return userItems({ id, name, relation });
    }
  };
}

// ─── Barre latérale ───

/** Supprime une collection, avec « Annuler » dans le toast. */
export function deleteCollection(id: string): void {
  const c = library.collection(id);
  if (!c) return;
  const snap = { ...c, games: [...c.games] };
  library.deleteCollection(id);
  if (ui.screen === 'library' && ui.collection === id) ui.libraryAll();
  ui.toast(`Collection « ${snap.name} » supprimée`, {
    action: {
      label: 'Annuler',
      run: () => {
        library.state.collections = [...library.state.collections, snap];
        library.save();
      }
    }
  });
}

export function collectionItems(id: string): MenuItem[] {
  return [
    { label: 'Ouvrir', icon: 'layers', run: () => ui.collectionView(id) },
    { label: 'Ajouter des jeux', icon: 'plus', run: () => (ui.modal = { kind: 'collectionEdit', collectionId: id }) },
    {
      label: 'Renommer',
      icon: 'edit',
      run: () => {
        ui.collectionView(id);
        ui.renameCollection = id;
      }
    },
    'sep',
    { label: 'Supprimer', icon: 'trash', danger: true, run: () => deleteCollection(id) }
  ];
}

export function storeItems(s: StoreId): MenuItem[] {
  const own = s === 'local' || s === 'manual';
  return [
    { label: `Voir les jeux ${own ? '' : STORES[s].label}`.trim(), icon: 'grid', run: () => ui.storeFilter(s) },
    { label: 'Actualiser la bibliothèque', icon: 'refresh', run: () => refreshAll() },
    own
      ? { label: 'Dossiers et jeux ajoutés', icon: 'folder', run: () => ui.settings('library') }
      : { label: 'Réglages des launchers', icon: 'sliders', run: () => ui.settings('launchers') }
  ];
}

/** Entrées de navigation de la barre latérale. */
export function navItems(key: string): MenuItem[] | null {
  const add: MenuItem = { label: 'Ajouter un jeu', icon: 'plus', run: () => (ui.modal = { kind: 'add' }) };
  const refresh: MenuItem = { label: 'Actualiser la bibliothèque', icon: 'refresh', run: () => refreshAll() };
  switch (key) {
    case 'library':
      return [{ label: 'Ouvrir', icon: 'grid', run: () => ui.libraryAll() }, add, refresh];
    case 'favorites':
      return [{ label: 'Ouvrir', icon: 'star', run: () => ui.favorites() }];
    case 'toInstall':
      return [{ label: 'Ouvrir', icon: 'download', run: () => ui.toInstallList() }, refresh];
    case 'updates':
      return [
        { label: 'Ouvrir', icon: 'refresh', run: () => ui.updatesList() },
        { label: 'Rechercher des mises à jour', icon: 'refresh', run: () => refreshAll() }
      ];
    case 'settings':
      return [
        { label: 'Ouvrir', icon: 'sliders', run: () => ui.settings() },
        { label: 'Apparence', icon: 'sun', run: () => ui.settings('appearance') },
        { label: 'Launchers', icon: 'gamepad', run: () => ui.settings('launchers') },
        { label: 'Jaquettes', icon: 'image', run: () => ui.settings('covers') }
      ];
    default:
      return null;
  }
}
