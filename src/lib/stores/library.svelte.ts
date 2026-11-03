// Bibliothèque : jeux détectés + état persistant (favoris, temps de jeu, réglages...).

import { api } from '../api';
import { STORE_ORDER } from '../stores-meta';
import type { Game, PersistedState, Session, StoreId, Totals } from '../types';
import { dedupe } from '../util/games';
import { defaultState, normalizeState, SESSION_DAYS } from '../util/state';

const EMPTY_TOTALS: Totals = { playMs: 0, launches: 0, lastPlayed: 0 };

class Library {
  /** Jeux détectés par le dernier scan (hors ajouts manuels). */
  scanned = $state<Game[]>([]);
  state = $state<PersistedState>(defaultState());
  scanning = $state(false);
  /** Vrai dès que la bibliothèque (cache ou scan) est affichable. */
  ready = $state(false);

  /** Tous les jeux connus, masqués compris. */
  all = $derived(dedupe([...this.scanned, ...this.state.manualGames]));
  byId = $derived(new Map(this.all.map((g) => [g.id, g])));
  /** Jeux affichés : ni masqués, ni d'un store désactivé. */
  visible = $derived(
    this.all.filter((g) => !this.state.hidden.includes(g.id) && !this.state.disabledStores.includes(g.store))
  );
  /** Nombre de jeux par store (tous, pour les Paramètres). */
  countsAll = $derived(countBy(this.all.filter((g) => !this.state.hidden.includes(g.id))));
  /** Nombre de jeux visibles par store (barre latérale, puces). */
  counts = $derived(countBy(this.visible));
  favorites = $derived(this.visible.filter((g) => this.state.favorites.includes(g.id)));
  maxPlayMs = $derived(Math.max(1, ...this.visible.map((g) => this.totals(g.id).playMs)));

  genres = $state<Record<string, string | null>>({});
  private genreAsked = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private libTimer: ReturnType<typeof setTimeout> | undefined;

  name(g: Game): string {
    return this.state.renames[g.id] || g.name;
  }

  get(id: string | null | undefined): Game | undefined {
    return id ? this.byId.get(id) : undefined;
  }

  isFav(id: string): boolean {
    return this.state.favorites.includes(id);
  }

  /**
   * Temps de jeu, lancements et dernière session : le plus élevé entre ce que Hangar a
   * mesuré et ce que le store sait (Steam, GOG Galaxy). Les nouvelles sessions s'ajoutent
   * à cette valeur, ce qui reste juste puisque le store les comptera aussi.
   */
  totals(id: string): Totals {
    const own = this.state.totals[id] ?? EMPTY_TOTALS;
    const g = this.byId.get(id);
    if (!g || (!g.storePlayMs && !g.storeLastPlayed)) return own;
    return {
      playMs: Math.max(own.playMs, g.storePlayMs ?? 0),
      launches: own.launches,
      lastPlayed: Math.max(own.lastPlayed, g.storeLastPlayed ?? 0)
    };
  }

  /** Date d'ajout : installation connue, sinon première détection par Hangar. */
  addedAt(g: Game): number | undefined {
    return g.installedAt || this.state.firstSeen[g.id] || undefined;
  }

  /** Genre : donné par le scan, sinon cherché une fois sur Steam (game_info). */
  genre(g: Game): string | null {
    if (g.genre) return g.genre;
    if (g.id in this.genres) return this.genres[g.id];
    if (!this.genreAsked.has(g.id)) {
      this.genreAsked.add(g.id);
      queueMicrotask(() => {
        api
          .gameInfo(g.id)
          .then((r) => (this.genres[g.id] = r.genre || null))
          .catch(() => (this.genres[g.id] = null));
      });
    }
    return null;
  }

  /** Enregistre l'état (regroupe les écritures rapprochées). */
  save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      api.saveState($state.snapshot(this.state)).catch((e) => console.error('save_state', e));
    }, 250);
  }

  async load(): Promise<void> {
    try {
      this.state = normalizeState(await api.loadState());
    } catch (e) {
      console.error('load_state', e);
    }
    try {
      const cached = await api.loadLibrary();
      if (cached.length) {
        this.scanned = cached;
        this.ready = true;
      }
    } catch (e) {
      console.error('load_library', e);
    }
  }

  /** Scan complet en arrière-plan ; la liste est remplacée sans clignotement. */
  async scan(): Promise<number> {
    if (this.scanning) return this.visible.length;
    this.scanning = true;
    try {
      const games = await api.scanGames($state.snapshot(this.state.localFolders));
      // Les jeux Xbox arrivent plus tard (scan://partial) : on garde ceux du cache en attendant.
      const xbox = this.scanned.filter((g) => g.store === 'xbox');
      this.scanned = dedupe([...games, ...xbox]);
      this.markSeen();
      this.ready = true;
      this.persistLibrary();
      return this.visible.length;
    } finally {
      this.scanning = false;
    }
  }

  /** Résultat tardif d'un détecteur lent : remplace les jeux de ce store. */
  mergePartial(games: Game[]): void {
    const stores = new Set(games.map((g) => g.store));
    if (!stores.size) stores.add('xbox');
    this.scanned = dedupe([...this.scanned.filter((g) => !stores.has(g.store)), ...games]);
    this.markSeen();
    this.persistLibrary();
  }

  private persistLibrary(): void {
    clearTimeout(this.libTimer);
    this.libTimer = setTimeout(() => api.saveLibrary($state.snapshot(this.scanned)).catch(() => {}), 500);
  }

  private markSeen(): void {
    const now = Date.now();
    let changed = false;
    for (const g of this.all) {
      if (!this.state.firstSeen[g.id]) {
        this.state.firstSeen[g.id] = now;
        changed = true;
      }
    }
    if (changed) this.save();
  }

  toggleFav(id: string): void {
    const f = this.state.favorites;
    this.state.favorites = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    this.save();
  }

  rename(id: string, name: string): void {
    const g = this.get(id);
    const clean = name.trim();
    if (!clean || (g && clean === g.name)) delete this.state.renames[id];
    else this.state.renames[id] = clean;
    this.save();
  }

  hide(id: string): void {
    if (!this.state.hidden.includes(id)) this.state.hidden = [...this.state.hidden, id];
    this.save();
  }

  unhide(id: string): void {
    this.state.hidden = this.state.hidden.filter((x) => x !== id);
    this.save();
  }

  setStoreEnabled(store: StoreId, on: boolean): void {
    const d = this.state.disabledStores.filter((s) => s !== store);
    this.state.disabledStores = on ? d : [...d, store];
    this.save();
  }

  addManual(g: Game): void {
    this.state.manualGames = [...this.state.manualGames.filter((x) => x.id !== g.id), g];
    this.state.hidden = this.state.hidden.filter((x) => x !== g.id);
    this.state.firstSeen[g.id] ??= Date.now();
    this.save();
  }

  removeManual(id: string): void {
    this.state.manualGames = this.state.manualGames.filter((x) => x.id !== id);
    this.state.favorites = this.state.favorites.filter((x) => x !== id);
    this.save();
  }

  setCustomCover(id: string, value: string | null): void {
    if (value === null) delete this.state.customCovers[id];
    else this.state.customCovers[id] = value;
    this.save();
  }

  recordLaunch(id: string): void {
    const t = { ...this.totals(id) };
    t.launches += 1;
    t.lastPlayed = Date.now();
    this.state.totals[id] = t;
    this.save();
  }

  recordSession(s: Session): void {
    const ms = Math.max(0, s.end - s.start);
    const t = { ...this.totals(s.gameId) };
    t.playMs += ms;
    t.lastPlayed = Math.max(t.lastPlayed, s.end);
    this.state.totals[s.gameId] = t;
    const min = Date.now() - SESSION_DAYS * 86_400_000;
    this.state.sessions = [...this.state.sessions.filter((x) => x.end >= min), s];
    this.save();
  }
}

function countBy(games: Game[]): Partial<Record<StoreId, number>> {
  const out: Partial<Record<StoreId, number>> = {};
  for (const g of games) out[g.store] = (out[g.store] ?? 0) + 1;
  return out;
}

/** Stores présents dans un décompte, dans l'ordre d'affichage. */
export function presentStores(counts: Partial<Record<StoreId, number>>): StoreId[] {
  return STORE_ORDER.filter((s) => (counts[s] ?? 0) > 0);
}

export const library = new Library();
