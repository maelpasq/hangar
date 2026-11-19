// Badges vus dans le dashboard (docs/ADMIN-DESIGN.md, section 3). Leurs définitions (nom,
// emblème, couleur) viennent du serveur et se modifient dans l'écran Badges ; ce module garde la
// liste chargée et les couleurs proposées. Avec bug-status.ts, le seul module où une couleur
// s'écrit en dur.
import { GIVEN_ICONS, type GivenIcon } from '../../src/lib/util/badges';
import { api, type AdminBadge } from './api';

export const badgeDefs = $state<{ list: AdminBadge[] }>({ list: [] });

/** Badge par son identifiant ; un badge supprimé depuis garde le nom noté au journal. */
export function badgeOf(id: string, name?: string): AdminBadge {
  return (
    badgeDefs.list.find((b) => b.id === id) ?? {
      id,
      name: name ?? id,
      description: '',
      icon: 'star',
      color: 'accent',
      position: 0,
      active: false,
      held: 0,
      legacy: false
    }
  );
}

/** Recharge la liste après un changement fait ailleurs (journal, fiche). */
export async function loadBadges() {
  badgeDefs.list = (await api.badges()).badges;
}

/** Emblème d'un badge (l'étoile s'il n'existe pas). */
export const iconOf = (b: { icon: string }): GivenIcon =>
  (GIVEN_ICONS as readonly string[]).includes(b.icon) ? (b.icon as GivenIcon) : 'star';

/** Couleur CSS d'un badge (`accent` : l'accent de l'app). */
export const colorOf = (b: { color: string }) => (b.color === 'accent' ? 'var(--accent)' : b.color);

/** Couleurs proposées à la création d'un badge, nommées pour les lecteurs d'écran. */
export const PALETTE: { color: string; label: string }[] = [
  { color: 'accent', label: 'Accent' },
  { color: '#8d70ff', label: 'Violet' },
  { color: '#4f8ff7', label: 'Bleu' },
  { color: '#22b8a6', label: 'Turquoise' },
  { color: '#3fb950', label: 'Vert' },
  { color: '#e9b52c', label: 'Or' },
  { color: '#f08a3c', label: 'Orange' },
  { color: '#f2556b', label: 'Rose' },
  { color: '#e5484d', label: 'Rouge' },
  { color: '#aab3c2', label: 'Argent' }
];

/** Nom des emblèmes, pour les lecteurs d'écran (même ordre que `GIVEN_ICONS` de l'app). */
export const ICON_LABELS: Record<string, string> = {
  seal: 'Rosette',
  shield: 'Bouclier',
  flask: 'Fiole',
  bug: 'Insecte',
  star: 'Étoile',
  heart: 'Cœur',
  trophy: 'Trophée',
  crown: 'Couronne',
  rocket: 'Fusée',
  bolt: 'Éclair',
  gem: 'Diamant',
  flame: 'Flamme',
  gamepad: 'Manette',
  brush: 'Pinceau',
  music: 'Musique',
  chat: 'Bulle',
  network: 'Réseau'
};

/** Teintes d'accompagnement des chiffres clés et du journal. */
export const TINTS = {
  info: '#3b82f6',
  social: '#f2556b',
  warn: '#f5a524',
  discord: '#5865f2'
};
