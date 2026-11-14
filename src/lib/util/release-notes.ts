// Notes de version montrées après une mise à jour de Hangar.
// Source : l'historique de docs/RELEASES.md, embarqué au build (aucun réseau).

import releasesMd from '../../../docs/RELEASES.md?raw';

export interface NotesSection {
  title: string;
  items: string[];
}

export interface ReleaseNotes {
  version: string;
  date: string;
  /** Phrase d'accroche (ou, pour les anciennes versions, toute la description). */
  intro: string;
  sections: NotesSection[];
}

/** Compare deux numéros de version x.y.z (négatif si a < b). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Lit les entrées « ### x.y.z - date » de la section Historique, de la plus récente à la plus ancienne. */
export function parseReleases(md: string): ReleaseNotes[] {
  const start = md.indexOf('\n## Historique');
  const body = start >= 0 ? md.slice(start) : md;
  const out: ReleaseNotes[] = [];
  let cur: ReleaseNotes | null = null;
  let section: NotesSection | null = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^###\s+(\d+(?:\.\d+)*)\s*-\s*(.+)$/.exec(line);
    if (head) {
      cur = { version: head[1], date: head[2].trim(), intro: '', sections: [] };
      section = null;
      out.push(cur);
    } else if (!cur || !line) {
      continue;
    } else if (line.startsWith('## ')) {
      cur = null;
    } else if (line.startsWith('#### ')) {
      section = { title: line.slice(5).trim(), items: [] };
      cur.sections.push(section);
    } else if (/^[-*]\s+/.test(line)) {
      const item = line.replace(/^[-*]\s+/, '');
      if (section) section.items.push(item);
      else cur.intro = cur.intro ? `${cur.intro} ${item}` : item;
    } else if (section?.items.length) {
      // Suite d'une puce sur la ligne suivante.
      section.items[section.items.length - 1] += ` ${line}`;
    } else {
      cur.intro = cur.intro ? `${cur.intro} ${line}` : line;
    }
  }
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

/** Au plus ce nombre de versions dans la fenêtre (qui a sauté beaucoup de mises à jour). */
export const MAX_NOTES = 5;

/**
 * Notes à montrer pour passer de `since` (dernière version vue, null : inconnue) à `current` :
 * toutes les versions de (since, current], ou seulement `current` si `since` est inconnue.
 */
export function notesBetween(all: ReleaseNotes[], since: string | null, current: string): ReleaseNotes[] {
  const upTo = all.filter((r) => compareVersions(r.version, current) <= 0);
  const list = since ? upTo.filter((r) => compareVersions(r.version, since) > 0) : upTo.filter((r) => r.version === current);
  return list.slice(0, MAX_NOTES);
}

/** Découpe un texte en morceaux normaux et en gras (`**...**`), sans HTML. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/\*\*(.+?)\*\*/)
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter((p) => p.text);
}

export const RELEASES = parseReleases(releasesMd);
