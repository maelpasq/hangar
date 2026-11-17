// Navigation par l'ancre de l'adresse : `#/`, `#/bugs?statut=…&q=…`, `#/bugs/<numéro>`,
// `#/comptes?q=…`, `#/comptes/<id>`, `#/journal`.
export type Route =
  | { page: 'accueil' }
  | { page: 'bugs'; statut: string; q: string }
  | { page: 'bug'; id: number }
  | { page: 'comptes'; q: string }
  | { page: 'compte'; id: string }
  | { page: 'journal' };

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  if (seg[0] === 'bugs' && seg[1] && Number(seg[1]) > 0) return { page: 'bug', id: Number(seg[1]) };
  if (seg[0] === 'bugs') return { page: 'bugs', statut: params.get('statut') ?? 'ouverts', q: params.get('q') ?? '' };
  if (seg[0] === 'comptes' && seg[1]) return { page: 'compte', id: seg[1] };
  if (seg[0] === 'comptes') return { page: 'comptes', q: params.get('q') ?? '' };
  if (seg[0] === 'journal') return { page: 'journal' };
  return { page: 'accueil' };
}

export const router = $state({ route: parse(location.hash) });

addEventListener('hashchange', () => {
  router.route = parse(location.hash);
});

export const href = {
  accueil: '#/',
  bugs: (statut = 'ouverts', q = '') => {
    const p = new URLSearchParams();
    if (statut !== 'ouverts') p.set('statut', statut);
    if (q) p.set('q', q);
    const s = p.toString();
    return s ? `#/bugs?${s}` : '#/bugs';
  },
  bug: (id: number) => `#/bugs/${id}`,
  comptes: (q = '') => (q ? `#/comptes?q=${encodeURIComponent(q)}` : '#/comptes'),
  compte: (id: string) => `#/comptes/${encodeURIComponent(id)}`,
  /** Cible d'une ligne du journal : un compte ou `bug:<numéro>`. */
  target: (id: string) => (id.startsWith('bug:') ? `#/bugs/${id.slice(4)}` : `#/comptes/${encodeURIComponent(id)}`),
  journal: '#/journal'
};

/** Change l'adresse sans ajouter d'entrée à l'historique (saisie de la recherche, filtres). */
export function replace(hash: string) {
  history.replaceState(null, '', hash);
  router.route = parse(hash);
}
