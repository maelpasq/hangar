// Jaquettes, bannières et icônes : chaîne de repli, cache mémoire, résolution des ID Steam.
// Toutes les images distantes passent par api.image (cache disque côté backend).

import { api } from './api';
import { library } from './stores/library.svelte';
import type { Game } from './types';

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
  private resolving = false;

  /** ID Steam effectif d'un jeu (jaquette choisie, natif, ou résolu). */
  steamId(g: Game): number | null {
    const custom = library.state.customCovers[g.id];
    if (custom?.startsWith('steam:')) return Number(custom.slice(6)) || null;
    if (g.steamAppId) return g.steamAppId;
    const c = library.state.steamIdCache[g.id];
    return c && c > 0 ? c : null;
  }

  /** Clé de cache de la jaquette, ou null pour une jaquette générée. */
  coverKey(g: Game): string | null {
    const custom = library.state.customCovers[g.id];
    if (custom === 'none') return null;
    if (custom && !custom.startsWith('steam:')) return `file:${custom}`;
    const id = this.steamId(g);
    return id ? `steam:${id}` : null;
  }

  /** undefined = en cours, null = jaquette générée. */
  cover(g: Game): CoverResult | null | undefined {
    const key = this.coverKey(g);
    if (!key) return null;
    if (key in this.covers) return this.covers[key];
    this.load(`c|${key}`, async () => {
      let r: CoverResult | null;
      if (key.startsWith('file:')) r = { src: api.localSrc(key.slice(5)), landscape: false };
      else r = await steamCover(Number(key.slice(6)));
      this.covers[key] = r;
    });
    return undefined;
  }

  /** Bannière library_hero ; undefined = en cours, null = aucune. */
  hero(g: Game): string | null | undefined {
    const id = this.steamId(g);
    if (!id) return null;
    const key = String(id);
    if (key in this.heroes) return this.heroes[key];
    this.load(`h|${key}`, async () => {
      this.heroes[key] = await firstImage(heroUrls(id));
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

  private load(key: string, fn: () => Promise<void>): void {
    if (this.pending.has(key)) return;
    this.pending.add(key);
    queueMicrotask(() => {
      fn().catch((e) => console.warn('image', key, e));
    });
  }

  /** Cherche l'ID Steam des jeux hors Steam (si « Jaquettes automatiques » est actif). */
  async resolveSteamIds(): Promise<void> {
    if (this.resolving || !library.state.prefs.autoCovers) return;
    this.resolving = true;
    try {
      const todo = library.visible.filter(
        (g) =>
          !g.steamAppId && !(g.id in library.state.steamIdCache) && !library.state.customCovers[g.id]
      );
      const queue = [...todo];
      const worker = async () => {
        for (let g = queue.shift(); g; g = queue.shift()) {
          if (!library.state.prefs.autoCovers) return;
          let id: number | null = null;
          try {
            id = await api.resolveSteamId(library.name(g));
          } catch {
            id = null;
          }
          library.state.steamIdCache[g.id] = id ?? 0;
          library.save();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    } finally {
      this.resolving = false;
    }
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
