// Navigation par l'ancre de l'adresse : `#/`, `#/bugs?statut=…&q=…`, `#/bugs/<numéro>`,
// `#/signalements?statut=…`, `#/comptes?q=…`, `#/comptes/<id>`, `#/badges`, `#/badges/<id>`
// (`nouveau` : création), `#/journal`.
export type Route =
  | { page: 'accueil' }
  | { page: 'bugs'; statut: string; q: string }
  | { page: 'bug'; id: number; statut: string; q: string }
  | { page: 'signalements'; statut: string }
  | { page: 'comptes'; q: string }
  | { page: 'compte'; id: string; q: string }
  | { page: 'badges'; id: string | null }
  | { page: 'journal' };

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  if (seg[0] === 'bugs' && seg[1] && Number(seg[1]) > 0)
    return { page: 'bug', id: Number(seg[1]), statut: params.get('statut') ?? 'ouverts', q: params.get('q') ?? '' };
  if (seg[0] === 'bugs') return { page: 'bugs', statut: params.get('statut') ?? 'ouverts', q: params.get('q') ?? '' };
  if (seg[0] === 'signalements') return { page: 'signalements', statut: params.get('statut') ?? 'ouvert' };
  if (seg[0] === 'comptes' && seg[1]) return { page: 'compte', id: seg[1], q: params.get('q') ?? '' };
  if (seg[0] === 'comptes') return { page: 'comptes', q: params.get('q') ?? '' };
  if (seg[0] === 'badges') return { page: 'badges', id: seg[1] ?? null };
  if (seg[0] === 'journal') return { page: 'journal' };
  return { page: 'accueil' };
}

export const router = $state({ route: parse(location.hash) });

addEventListener('hashchange', () => {
  router.route = parse(location.hash);
});

export const href: {
  accueil: string;
  bugs: (statut?: string, q?: string, id?: number) => string;
  bug: (id: number, statut?: string, q?: string) => string;
  signalements: (statut?: string) => string;
  comptes: (q?: string) => string;
  compte: (id: string, q?: string) => string;
  target: (id: string) => string;
  badges: (id?: string) => string;
  journal: string;
} = {
  accueil: '#/',
  bugs: (statut = 'ouverts', q = '', id?: number) => {
    const p = new URLSearchParams();
    if (statut !== 'ouverts') p.set('statut', statut);
    if (q) p.set('q', q);
    const s = p.toString();
    const path = id ? `#/bugs/${id}` : '#/bugs';
    return s ? `${path}?${s}` : path;
  },
  bug: (id: number, statut = 'ouverts', q = '') => href.bugs(statut, q, id),
  signalements: (statut = 'ouvert') => (statut === 'ouvert' ? '#/signalements' : `#/signalements?statut=${statut}`),
  comptes: (q = '') => (q ? `#/comptes?q=${encodeURIComponent(q)}` : '#/comptes'),
  compte: (id: string, q = '') => `#/comptes/${encodeURIComponent(id)}${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  /** Cible d'une ligne du journal : un compte, `bug:<numéro>` ou `badge:<identifiant>`. */
  target: (id: string) =>
    id.startsWith('bug:')
      ? `#/bugs/${id.slice(4)}`
      : id.startsWith('badge:')
        ? href.badges(id.slice(6))
        : `#/comptes/${encodeURIComponent(id)}`,
  badges: (id?: string) => (id ? `#/badges/${encodeURIComponent(id)}` : '#/badges'),
  journal: '#/journal'
};

/** Change l'adresse sans ajouter d'entrée à l'historique (saisie de la recherche, filtres). */
export function replace(hash: string) {
  history.replaceState(null, '', hash);
  router.route = parse(hash);
}
