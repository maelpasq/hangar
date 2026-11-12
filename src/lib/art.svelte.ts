// Jaquettes, bannières et icônes : chaîne de repli et cache mémoire.
// Jeux Steam : CDN Steam (api.image). Sinon, ou en repli : api.findArtwork, qui cherche
// côté backend dans le store d'origine, sur Steam puis sur SteamGridDB.

import { api } from './api';
import { library } from './stores/library.svelte';
import type { Artwork, Game } from './types';

export interface CoverResult {
  src: string;
  /** Image paysage (header.jpg) : centrée sur un fond flou d'elle-même. */
  landscape: boolean;
}

const SHARED = 'https://shared.steamstatic.com/store_item_assets/steam/apps';
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

export function portraitUrls(id: number): string[] {
  return [
    `${SHARED}/${id}/library_600x900_2x.jpg`,
    `${SHARED}/${id}/library_600x900.jpg`,
    `${CDN}/${id}/library_600x900_2x.jpg`
  ];
}

export function headerUrls(id: number): string[] {
  return [`${SHARED}/${id}/header.jpg`, `${CDN}/${id}/header.jpg`];
}

export function heroUrls(id: number): string[] {
  return [`${SHARED}/${id}/library_hero.jpg`, `${CDN}/${id}/library_hero.jpg`];
}

async function firstImage(urls: string[]): Promise<string | null> {
  for (const u of urls) {
    try {
      const src = await api.image(u);
      if (src) return src;
    } catch {
      // image suivante
    }
  }
  return null;
}

/** Résout la jaquette Steam d'un appid (portrait, sinon paysage). */
export async function steamCover(id: number): Promise<CoverResult | null> {
  const p = await firstImage(portraitUrls(id));
  if (p) return { src: p, landscape: false };
  const h = await firstImage(headerUrls(id));
  return h ? { src: h, landscape: true } : null;
}

class Art {
  covers = $state<Record<string, CoverResult | null>>({});
  heroes = $state<Record<string, string | null>>({});
  icons = $state<Record<string, string | null>>({});
  private pending = new Set<string>();
  /** Recherche multi-sources du backend, une seule par jeu. */
  private auto = new Map<string, Promise<Artwork>>();
  private refreshNext = new Set<string>();

  /** ID Steam effectif d'un jeu (jaquette choisie, natif, ou connu). */
  steamId(g: Game): number | null {
    const custom = library.state.customCovers[g.id];
    if (custom?.startsWith('steam:')) return Number(custom.slice(6)) || null;
    if (g.steamAppId) return g.steamAppId;
    const c = library.state.steamIdCache[g.id];
    return c && c > 0 ? c : null;
  }

  private autoOn(g: Game): boolean {
    return library.state.prefs.autoCovers && !library.state.customCovers[g.id];
  }

  /** Peut avoir une bannière (pour le carrousel). */
  mayHaveHero(g: Game): boolean {
    return !!this.steamId(g) || this.autoOn(g);
  }

  /** Clé de cache de la jaquette, ou null pour une jaquette générée. */
  coverKey(g: Game): string | null {
    const custom = library.state.customCovers[g.id];
    if (custom === 'none') return null;
    if (custom && !custom.startsWith('steam:')) return `file:${custom}`;
    const id = this.steamId(g);
    if (id) return `steam:${id}|${g.id}`;
    return this.autoOn(g) ? `auto:${g.id}` : null;
  }

  private findAuto(g: Game): Promise<Artwork> {
    const key = library.state.prefs.steamGridDb;
    const memo = `${g.id}|${key ? 'k' : ''}`;
    let p = this.auto.get(memo);
    if (!p) {
      const refresh = this.refreshNext.delete(g.id);
      p = api.findArtwork(g.id, refresh).catch(() => ({ cover: null, hero: null, source: '' }));
      this.auto.set(memo, p);
    }
    return p;
  }

  /** undefined = en cours, null = jaquette générée. */
  cover(g: Game): CoverResult | null | undefined {
    const key = this.coverKey(g);
    if (!key) return null;
    if (key in this.covers) return this.covers[key];
    this.load(`c|${key}`, async () => {
      let r: CoverResult | null = null;
      if (key.startsWith('file:')) r = { src: api.localSrc(key.slice(5)), landscape: false };
      else if (key.startsWith('steam:')) {
        r = await steamCover(Number(key.slice(6).split('|')[0]));
        // Pas de jaquette sur le CDN Steam : autres sources (SteamGridDB...).
        if (!r && this.autoOn(g)) r = (await this.findAuto(g)).cover;
      } else r = (await this.findAuto(g)).cover;
      this.covers[key] = r;
    });
    return undefined;
  }

  /** Bannière ; undefined = en cours, null = aucune. */
  hero(g: Game): string | null | undefined {
    const id = this.steamId(g);
    if (!id && !this.autoOn(g)) return null;
    const key = `${id ?? 'auto'}|${g.id}|${library.state.prefs.steamGridDb ? 'k' : ''}`;
    if (key in this.heroes) return this.heroes[key];
    this.load(`h|${key}`, async () => {
      let h = id ? await firstImage(heroUrls(id)) : null;
      if (!h && this.autoOn(g)) h = (await this.findAuto(g)).hero;
      this.heroes[key] = h;
    });
    return undefined;
  }

  /** Icône 256 px de l'exe (ou logo Xbox) pour la jaquette générée. */
  icon(g: Game): string | null | undefined {
    const path = g.logo || g.exePath;
    if (!path) return null;
    if (path in this.icons) return this.icons[path];
    this.load(`i|${path}`, async () => {
      this.icons[path] = await api.exeIcon(path).catch(() => null);
    });
    return undefined;
  }

  /** Une image en cache s'est avérée illisible : on passe à la jaquette générée. */
  fail(key: string): void {
    this.covers[key] = null;
  }

  /** Oublie les résultats automatiques (clé SteamGridDB modifiée, réglage réactivé). */
  reset(): void {
    this.auto.clear();
    for (const k of Object.keys(this.covers)) if (!k.startsWith('file:')) delete this.covers[k];
    for (const k of Object.keys(this.heroes)) delete this.heroes[k];
    for (const k of [...this.pending]) if (!k.startsWith('i|')) this.pending.delete(k);
  }

  /** Relance la recherche automatique d'un jeu en ignorant le cache du backend. */
  refresh(g: Game): void {
    this.refreshNext.add(g.id);
    for (const m of [...this.auto.keys()]) if (m.startsWith(`${g.id}|`)) this.auto.delete(m);
    for (const k of Object.keys(this.covers)) if (k.endsWith(`|${g.id}`) || k === `auto:${g.id}`) delete this.covers[k];
    for (const k of Object.keys(this.heroes)) if (k.includes(`|${g.id}|`)) delete this.heroes[k];
    for (const k of [...this.pending]) if (k.includes(g.id)) this.pending.delete(k);
  }

  private load(key: string, fn: () => Promise<void>): void {
    if (this.pending.has(key)) return;
    this.pending.add(key);
    queueMicrotask(() => {
      fn().catch((e) => console.warn('image', key, e));
    });
  }
}

export const art = new Art();

/** Action : appelle `cb` quand l'élément devient (presque) visible. */
export function visible(node: HTMLElement, cb: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    cb();
    return {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        cb();
        io.disconnect();
      }
    },
    { rootMargin: '400px' }
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}
