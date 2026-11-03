// Recherche insensible à la casse et aux accents.

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[™®©]/g, '')
    .toLowerCase()
    .trim();
}

/** Vrai si `name` contient `query` (accents et casse ignorés). */
export function matches(name: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return false;
  return normalize(name).includes(q);
}

/** Trie les résultats : ceux qui commencent par la requête d'abord. */
export function rank<T>(items: T[], query: string, name: (t: T) => string): T[] {
  const q = normalize(query);
  if (!q) return [];
  return items
    .filter((t) => normalize(name(t)).includes(q))
    .sort((a, b) => {
      const na = normalize(name(a));
      const nb = normalize(name(b));
      const pa = na.startsWith(q) ? 0 : 1;
      const pb = nb.startsWith(q) ? 0 : 1;
      return pa - pb || na.localeCompare(nb, 'fr');
    });
}
