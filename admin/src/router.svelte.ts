// Navigation par l'ancre de l'adresse : `#/`, `#/comptes?q=…`, `#/comptes/<id>`, `#/journal`.
export type Route =
  | { page: 'accueil' }
  | { page: 'comptes'; q: string }
  | { page: 'compte'; id: string }
  | { page: 'journal' };

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (seg[0] === 'comptes' && seg[1]) return { page: 'compte', id: seg[1] };
  if (seg[0] === 'comptes') return { page: 'comptes', q: new URLSearchParams(query).get('q') ?? '' };
  if (seg[0] === 'journal') return { page: 'journal' };
  return { page: 'accueil' };
}

export const router = $state({ route: parse(location.hash) });

addEventListener('hashchange', () => {
  router.route = parse(location.hash);
});

export const href = {
  accueil: '#/',
  comptes: (q = '') => (q ? `#/comptes?q=${encodeURIComponent(q)}` : '#/comptes'),
  compte: (id: string) => `#/comptes/${encodeURIComponent(id)}`,
  journal: '#/journal'
};

/** Change l'adresse sans ajouter d'entrée à l'historique (saisie de la recherche). */
export function replace(hash: string) {
  history.replaceState(null, '', hash);
  router.route = parse(hash);
}
