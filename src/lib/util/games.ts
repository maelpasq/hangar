import { STORE_ORDER } from '../stores-meta';
import type { Game } from '../types';

function dirKey(g: Game): string {
  return (g.installDir ?? '').toLowerCase().replace(/[\\/]+$/, '') || g.id;
}

/** Un même dossier détecté par deux sources n'apparaît qu'une fois (ordre de STORE_ORDER). */
export function dedupe(games: Game[]): Game[] {
  const sorted = [...games].sort((a, b) => STORE_ORDER.indexOf(a.store) - STORE_ORDER.indexOf(b.store));
  const seen = new Set<string>();
  const ids = new Set<string>();
  const out: Game[] = [];
  for (const g of sorted) {
    const k = dirKey(g);
    if (seen.has(k) || ids.has(g.id)) continue;
    seen.add(k);
    ids.add(g.id);
    out.push(g);
  }
  return out;
}

/** Dossier parent d'un chemin Windows. */
export function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return i > 0 ? path.slice(0, i) : path;
}

/** Nom de fichier sans extension, nettoyé pour servir de nom de jeu. */
export function nameFromPath(path: string): string {
  const file = path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1);
  return file
    .replace(/\.(exe|lnk|url|bat)$/i, '')
    .replace(/[_.]+/g, ' ')
    .replace(/[-\s]*(win64|shipping|x64|launcher)$/i, '')
    .trim();
}
