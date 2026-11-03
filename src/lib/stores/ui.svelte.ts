// État de l'interface : écran courant, recherche, modales, menu contextuel, toasts.

import type { StoreId } from '../types';

export type Screen = 'home' | 'library' | 'game' | 'settings';

export type Modal =
  | { kind: 'add' }
  | { kind: 'rename'; gameId: string }
  | { kind: 'cover'; gameId: string }
  | { kind: 'stop'; gameId: string };

export interface Toast {
  id: number;
  text: string;
  error?: boolean;
  /** Miniature (jeu concerné). */
  gameId?: string;
  action?: { label: string; run: () => void };
  leaving?: boolean;
}

interface Place {
  screen: Screen;
  favOnly: boolean;
  store: StoreId | 'all';
  gameId: string | null;
}

class Ui {
  screen = $state<Screen>('home');
  favOnly = $state(false);
  store = $state<StoreId | 'all'>('all');
  gameId = $state<string | null>(null);
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
    return { screen: this.screen, favOnly: this.favOnly, store: this.store, gameId: this.gameId };
  }

  private go(p: Partial<Place> & { screen: Screen }, push = true): void {
    if (push && this.screen === 'game') this.history = [...this.history.slice(-20), this.place()];
    else if (push) this.history = [this.place()];
    this.screen = p.screen;
    this.favOnly = p.favOnly ?? false;
    this.store = p.store ?? 'all';
    this.gameId = p.gameId ?? this.gameId;
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

  storeFilter(store: StoreId): void {
    this.go({ screen: 'library', store });
  }

  settings(): void {
    this.go({ screen: 'settings' });
  }

  open(gameId: string): void {
    this.query = '';
    this.searchOpen = false;
    if (this.screen === 'game' && this.gameId === gameId) return;
    this.go({ screen: 'game', gameId, favOnly: this.favOnly, store: this.store });
  }

  back(): void {
    const prev = this.history.at(-1);
    this.history = this.history.slice(0, -1);
    if (!prev) return this.go({ screen: 'home' }, false);
    this.go(prev, false);
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
