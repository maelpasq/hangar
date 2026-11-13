// Bibliothèque : jeux détectés + état persistant (favoris, temps de jeu, réglages...).

import { api } from '../api';
import { STORE_ORDER } from '../stores-meta';
import type { Collection, Game, PersistedState, Session, StoreId, Totals } from '../types';
import { dedupe } from '../util/games';
import { defaultState, normalizeState, SESSION_DAYS } from '../util/state';

const EMPTY_TOTALS: Totals = { playMs: 0, launches: 0, lastPlayed: 0 };

class Library {
  /** Jeux détectés par le dernier scan (hors ajouts manuels). */
  scanned = $state<Game[]>([]);
  state = $state<PersistedState>(defaultState());
  /** Première ouverture de Hangar (aucun état sur le disque). */
  fresh = $state(false);
  /** Message si l'état enregistré n'a pas pu être lu (rien n'est alors enregistré). */
  loadError = $state<string | null>(null);
  scanning = $state(false);
  /** Vrai dès que la bibliothèque (cache ou scan) est affichable. */
  ready = $state(false);

  /** Tous les jeux connus, masqués compris. */
  all = $derived(dedupe([...this.scanned, ...this.state.manualGames]));
  byId = $derived(new Map(this.all.map((g) => [g.id, g])));
  /** Jeux affichés : ni masqués, ni d'un store désactivé, ni non installés si l'option est coupée. */
  visible = $derived(
    this.all.filter(
      (g) =>
        !this.state.hidden.includes(g.id) &&
        !this.state.disabledStores.includes(g.store) &&
        (!g.notInstalled || this.state.prefs.showUninstalled)
    )
  );
  /** Jeux visibles et installés (accueil, bibliothèque, stores). */
  installed = $derived(this.visible.filter((g) => !g.notInstalled));
  /** Jeux possédés non installés (onglet « À installer »). */
  toInstall = $derived(this.visible.filter((g) => g.notInstalled));
  /** Jeux installés avec une mise à jour en attente (onglet « Mises à jour »). */
  updates = $derived(this.installed.filter((g) => g.updatePending));
  /** Nombre de jeux par store (tous, pour les Paramètres). */
  countsAll = $derived(countBy(this.all.filter((g) => !this.state.hidden.includes(g.id))));
  /** Nombre de jeux installés visibles par store (barre latérale). */
  counts = $derived(countBy(this.installed));
  favorites = $derived(this.visible.filter((g) => this.state.favorites.includes(g.id)));
  maxPlayMs = $derived(Math.max(1, ...this.visible.map((g) => this.totals(g.id).playMs)));

  genres = $state<Record<string, string | null>>({});
  private genreAsked = new Set<string>();
  /** Requêtes de genre en attente : 3 à la fois au plus (sinon Steam répond 429). */
  private genreQueue: string[] = [];
  private genreActive = 0;
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
      this.genreQueue.push(g.id);
      queueMicrotask(() => this.pumpGenres());
    }
    return null;
  }

  private pumpGenres(): void {
    while (this.genreActive < 3 && this.genreQueue.length) {
      const id = this.genreQueue.shift()!;
      this.genreActive++;
      api
        .gameInfo(id)
        .then((r) => (this.genres[id] = r.genre || null))
        .catch(() => (this.genres[id] = null))
        .finally(() => {
          this.genreActive--;
          this.pumpGenres();
        });
    }
  }

  /** L'état enregistré a été lu : avant (ou si la lecture a échoué), enregistrer écraserait
   * les vraies données avec l'état par défaut. */
  private loaded = false;

  /** Enregistre l'état (regroupe les écritures rapprochées). */
  save(): void {
    if (!this.loaded) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      api.saveState($state.snapshot(this.state)).catch((e) => console.error('save_state', e));
    }, 250);
  }

  async load(): Promise<void> {
    try {
      const raw = await api.loadState();
      // Pas d'état enregistré : première ouverture après l'installation.
      this.fresh = !raw || typeof raw !== 'object' || !Object.keys(raw).length;
      this.state = normalizeState(raw);
      this.loaded = true;
    } catch (e) {
      // Fichier bloqué par un autre programme : on garde l'état par défaut en mémoire sans
      // jamais l'enregistrer, pour ne pas écraser les vraies données.
      console.error('load_state', e);
      this.loadError = String(e).replace(/^Error:\s*/, '');
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

  private scanJob: Promise<number> | null = null;
  private scanNext: Promise<number> | null = null;

  /**
   * Scan complet en arrière-plan ; la liste est remplacée sans clignotement. Demandé
   * pendant un scan, il en relance un seul après lui, que tous les demandeurs attendent :
   * ils lisent donc une bibliothèque à jour (fin d'installation, dossier ajouté).
   */
  scan(): Promise<number> {
    if (!this.scanJob) {
      this.scanJob = this.runScan().finally(() => (this.scanJob = null));
      return this.scanJob;
    }
    this.scanNext ??= this.scanJob
      .catch(() => {})
      .then(() => {
        this.scanNext = null;
        return this.scan();
      });
    return this.scanNext;
  }

  private async runScan(): Promise<number> {
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
      // Premier scan en échec sans cache : on quitte l'écran de chargement (l'erreur est
      // annoncée par rescan).
      this.ready = true;
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

  collection(id: string | null | undefined): Collection | undefined {
    return id ? this.state.collections.find((c) => c.id === id) : undefined;
  }

  /** Jeux visibles d'une collection. */
  inCollection(id: string): Game[] {
    const c = this.collection(id);
    return c ? this.visible.filter((g) => c.games.includes(g.id)) : [];
  }

  /** Crée une collection (avec un premier jeu éventuel) et renvoie son id. */
  createCollection(name: string, gameId?: string): string | null {
    const clean = name.trim().slice(0, 60);
    if (!clean) return null;
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.state.collections = [...this.state.collections, { id, name: clean, games: gameId ? [gameId] : [] }];
    this.save();
    return id;
  }

  renameCollection(id: string, name: string): void {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    this.state.collections = this.state.collections.map((c) => (c.id === id ? { ...c, name: clean } : c));
    this.save();
  }

  /** Supprime la liste seulement : les jeux restent dans la bibliothèque. */
  deleteCollection(id: string): void {
    this.state.collections = this.state.collections.filter((c) => c.id !== id);
    this.save();
  }

  toggleInCollection(id: string, gameId: string): void {
    this.state.collections = this.state.collections.map((c) =>
      c.id !== id ? c : { ...c, games: c.games.includes(gameId) ? c.games.filter((x) => x !== gameId) : [...c.games, gameId] }
    );
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

  /**
   * Ajoute une session, ou prolonge celle qui a le même jeu et le même début (points
   * d'étape envoyés chaque minute pendant la partie) : seul le temps en plus est compté.
   */
  recordSession(s: Session): void {
    const prev = this.state.sessions.find((x) => x.gameId === s.gameId && x.start === s.start);
    const from = prev ? Math.max(prev.end, s.start) : s.start;
    const ms = Math.max(0, s.end - from);
    const session = prev && prev.end > s.end ? prev : s;
    const t = { ...this.totals(s.gameId) };
    t.playMs += ms;
    t.lastPlayed = Math.max(t.lastPlayed, session.end);
    this.state.totals[s.gameId] = t;
    const min = Date.now() - SESSION_DAYS * 86_400_000;
    this.state.sessions = [...this.state.sessions.filter((x) => x.end >= min && x !== prev), session];
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
