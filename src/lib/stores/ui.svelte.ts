// État de l'interface : écran courant, recherche, modales, menu contextuel, toasts.

import { api } from '../api';
import type { DesktopInfo, InstallTarget, StoreId } from '../types';

export type Screen = 'home' | 'library' | 'game' | 'web' | 'settings';

export type Modal =
  | { kind: 'add' }
  | { kind: 'rename'; gameId: string }
  | { kind: 'installLink'; gameId: string }
  /** Jeu d'un autre PC : l'installer depuis son site officiel ou choisir son exécutable. */
  | { kind: 'installChoice'; gameId: string }
  | { kind: 'cover'; gameId: string }
  | { kind: 'stop'; gameId: string }
  | { kind: 'uninstall'; gameId: string }
  | { kind: 'installDir'; gameId: string; targets: InstallTarget[] }
  | { kind: 'onboarding' }
  | { kind: 'startPage' }
  | { kind: 'padSetup' }
  /** Fenêtre fermée : garder Hangar en arrière-plan ou quitter. */
  | { kind: 'closeAsk' }
  /** Compte Hangar, première synchro : fusionner ou utiliser le compte. */
  | { kind: 'cloudMerge'; resolve: (choice: 'merge' | 'account') => void }
  | { kind: 'cloudDelete' }
  /** Amis : signaler un compte (ou un de ses messages), l'inviter sur un jeu, retirer ou bloquer. */
  | { kind: 'socialReport'; userId: string; name: string; messageId?: string }
  | { kind: 'socialInvite'; userId: string; name: string }
  | { kind: 'socialConfirm'; action: 'remove' | 'block'; userId: string; name: string }
  | { kind: 'profileGames' }
  /** Notes de version : après une mise à jour (`since` : dernière version vue), ou depuis les Paramètres. */
  | { kind: 'whatsNew'; version: string; since: string | null; manual?: boolean }
  | { kind: 'bug' }
  | { kind: 'mcSoon' }
  | { kind: 'collections'; gameId: string }
  /** Nouvelle collection (sans id) ou ajout de jeux à une collection. */
  | { kind: 'collectionEdit'; collectionId?: string };

export interface Toast {
  id: number;
  text: string;
  error?: boolean;
  /** Miniature (jeu concerné). */
  gameId?: string;
  action?: { label: string; run: () => void };
  leaving?: boolean;
}

/** Écrans du social (docs/COMPTE.md, phase 7) : page Amis, profil d'un compte. */
export type SocialScreen = 'friends' | 'profile';

interface Place {
  screen: Screen | SocialScreen;
  favOnly: boolean;
  /** Onglet « À installer » : jeux possédés non installés. */
  toInstall: boolean;
  /** Onglet « Mises à jour » : jeux installés avec une mise à jour en attente. */
  updates: boolean;
  /** Collection affichée (id), ou null. */
  collection: string | null;
  store: StoreId | 'all';
  gameId: string | null;
  /** Profil affiché (écran `profile`). */
  profileId: string | null;
}

class Ui {
  screen = $state<Screen | SocialScreen>('home');
  favOnly = $state(false);
  toInstall = $state(false);
  updates = $state(false);
  collection = $state<string | null>(null);
  store = $state<StoreId | 'all'>('all');
  /** Mode manette : interface plein écran par-dessus l'app. */
  big = $state(false);
  /** Ferme le mode manette. `restore` : s'il avait été ouvert par le bouton Xbox depuis une autre
   * app, Hangar retourne là où il était (caché, réduit) au lieu de rester en fenêtre par-dessus. */
  closeBig(restore: boolean): void {
    this.big = false;
    api.padBack(restore).catch(() => {});
  }
  /** Ce que le bureau permet (Discord, raccourci), donné par le backend. */
  desktop = $state<DesktopInfo | null>(null);
  gameId = $state<string | null>(null);
  profileId = $state<string | null>(null);
  /** Pile de navigation pour le bouton Retour. */
  history = $state<Place[]>([]);
  /** Incrémenté à chaque navigation pour rejouer l'animation d'entrée. */
  navKey = $state(0);

  query = $state('');
  searchOpen = $state(false);

  modal = $state<Modal | null>(null);
  menu = $state<{ gameId: string; x: number; y: number } | null>(null);
  toasts = $state<Toast[]>([]);

  windowFocused = $state(true);
  /** Page de jeu défilée : la barre du haut (transparente sur la bannière) prend un fond. */
  pageScrolled = $state(false);
  /** Image de la lumière d'ambiance. */
  ambient = $state<string | null>(null);

  private toastSeq = 0;

  private place(): Place {
    return {
      screen: this.screen,
      favOnly: this.favOnly,
      toInstall: this.toInstall,
      updates: this.updates,
      collection: this.collection,
      store: this.store,
      gameId: this.gameId,
      profileId: this.profileId
    };
  }

  private go(p: Partial<Place> & { screen: Screen | SocialScreen }, push = true): void {
    if (push && (this.screen === 'game' || this.screen === 'profile')) this.history = [...this.history.slice(-20), this.place()];
    else if (push) this.history = [this.place()];
    this.screen = p.screen;
    this.favOnly = p.favOnly ?? false;
    this.toInstall = p.toInstall ?? false;
    this.updates = p.updates ?? false;
    this.collection = p.collection ?? null;
    this.store = p.store ?? 'all';
    this.gameId = p.gameId ?? this.gameId;
    this.profileId = p.profileId ?? this.profileId;
    this.menu = null;
    this.pageScrolled = false;
    this.navKey++;
  }

  home(): void {
    this.go({ screen: 'home' });
  }

  libraryAll(): void {
    this.go({ screen: 'library' });
  }

  favorites(): void {
    this.go({ screen: 'library', favOnly: true });
  }

  toInstallList(): void {
    this.go({ screen: 'library', toInstall: true });
  }

  updatesList(): void {
    this.go({ screen: 'library', updates: true });
  }

  collectionView(id: string): void {
    this.go({ screen: 'library', collection: id });
  }

  storeFilter(store: StoreId): void {
    this.go({ screen: 'library', store });
  }

  /** Section des Paramètres à ouvrir (lue puis remise à null par l'écran Paramètres). */
  settingsSection = $state<string | null>(null);

  settings(section?: string): void {
    this.settingsSection = section ?? null;
    this.go({ screen: 'settings' });
  }

  webGames(): void {
    this.go({ screen: 'web' });
  }

  open(gameId: string): void {
    this.query = '';
    this.searchOpen = false;
    if (this.screen === 'game' && this.gameId === gameId) return;
    this.go({
      screen: 'game',
      gameId,
      favOnly: this.favOnly,
      toInstall: this.toInstall,
      updates: this.updates,
      collection: this.collection,
      store: this.store
    });
  }

  back(): void {
    const prev = this.history.at(-1);
    this.history = this.history.slice(0, -1);
    if (!prev) return this.go({ screen: 'home' }, false);
    this.go(prev, false);
  }

  /** Page Amis (liste, demandes, activité, conversations). */
  friends(): void {
    if (this.screen === 'friends') return;
    this.go({ screen: 'friends' });
  }

  /** Profil d'un compte Hangar (le sien ou celui d'un autre), dans l'app. */
  profile(id: string): void {
    if (this.screen === 'profile' && this.profileId === id) return;
    this.go({ screen: 'profile', profileId: id });
  }

  toast(text: string, opts: Omit<Toast, 'id' | 'text'> = {}): void {
    const id = ++this.toastSeq;
    this.toasts = [...this.toasts.slice(-2), { id, text, ...opts }];
    const ms = opts.error || opts.action ? 5000 : 3200;
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    const t = this.toasts.find((x) => x.id === id);
    if (!t || t.leaving) return;
    this.toasts = this.toasts.map((x) => (x.id === id ? { ...x, leaving: true } : x));
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== id);
    }, 250);
  }
}

export const ui = new Ui();
