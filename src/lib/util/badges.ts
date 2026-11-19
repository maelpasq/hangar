// Badges d'un profil, dans l'ordre d'affichage (à droite du pseudo) : ceux donnés par
// l'administrateur, puis ceux que l'app calcule d'après le profil. Les badges calculés suivent
// la confidentialité du compte : le serveur renvoie `games`, `stores` et `playMs` à null quand
// la bibliothèque ou le temps de jeu sont cachés, et le badge ne s'affiche pas.
// L'ancienneté a son propre composant (`SeniorityBadge.svelte`), toujours en dernier.

import type { Badge, BadgeDef } from '../types';

/**
 * Emblèmes des badges donnés par l'administrateur, au choix dans le dashboard. Même liste que
 * `BADGE_ICONS` du serveur (server/src/badges.ts) ; en ajouter un demande une version de l'app.
 */
export const GIVEN_ICONS = [
  'seal',
  'shield',
  'flask',
  'bug',
  'star',
  'heart',
  'trophy',
  'crown',
  'rocket',
  'bolt',
  'gem',
  'flame',
  'gamepad',
  'brush',
  'music',
  'chat',
  'network'
] as const;

export type GivenIcon = (typeof GIVEN_ICONS)[number];

/** Emblèmes : ceux des badges donnés, puis ceux des badges calculés. */
export type BadgeIcon = GivenIcon | 'flag' | 'stack' | 'clock' | 'grid';

export interface BadgeView {
  id: string;
  /** Bulle au survol et nom pour les lecteurs d'écran. */
  label: string;
  icon: BadgeIcon;
  /** Couleur de l'emblème. */
  color: string;
}

/** Comptes créés avant cette date : badge Pionnier (1er décembre 2026, heure locale). */
export const PIONEER_END = new Date(2026, 11, 1).getTime();

/** Nombre de launchers pour le badge Multi-launchers. */
export const MULTI_STORES = 5;

/** Couleurs des paliers (comme les arches d'ancienneté) : bronze, argent, or, diamant. */
const TIER_COLORS = ['#c98652', '#aab3c2', '#e9b52c', '#4fc6f0'];
const PIONEER_COLOR = '#f08a3c';
const MULTI_COLOR = '#4f8ff7';

/** Paliers de collection (jeux) et de temps de jeu (heures). */
export const COLLECTION_TIERS = [50, 100, 250, 500];
export const PLAY_TIERS = [100, 500, 1000];

/** Badge calculé par l'app, décrit pour le dashboard admin (lecture seule). */
export interface AutoBadge {
  id: string;
  name: string;
  /** Règle d'attribution. */
  rule: string;
  icon: BadgeIcon;
  /** Paliers éventuels, chacun avec sa couleur ; sinon un seul. */
  tiers: { label: string; color: string }[];
}

/** Badges calculés, dans leur ordre d'affichage (après ceux donnés, avant l'ancienneté). */
export const AUTO_BADGES: AutoBadge[] = [
  {
    id: 'pionnier',
    name: 'Pionnier',
    rule: 'Compte créé avant le 1er décembre 2026',
    icon: 'flag',
    tiers: [{ label: 'Pionnier', color: PIONEER_COLOR }]
  },
  {
    id: 'collection',
    name: 'Collectionneur',
    rule: 'Nombre de jeux, si la bibliothèque est visible',
    icon: 'stack',
    tiers: COLLECTION_TIERS.map((t, i) => ({ label: `${t} jeux`, color: TIER_COLORS[i] }))
  },
  {
    id: 'marathon',
    name: 'Marathonien',
    rule: 'Heures de jeu, si le temps de jeu est visible',
    icon: 'clock',
    tiers: PLAY_TIERS.map((t, i) => ({ label: `${t} h`, color: TIER_COLORS[i + 1] }))
  },
  {
    id: 'multi',
    name: 'Multi-launchers',
    rule: `Jeux sur ${MULTI_STORES} launchers ou plus, si la bibliothèque est visible`,
    icon: 'grid',
    tiers: [{ label: `${MULTI_STORES} launchers`, color: MULTI_COLOR }]
  }
];

const GIVEN: Record<Badge, Omit<BadgeView, 'id'>> = {
  certifie: { label: 'Compte certifié', icon: 'seal', color: 'var(--accent)' },
  equipe: { label: 'Équipe Hangar', icon: 'shield', color: '#8d70ff' },
  testeur: { label: 'Testeur de Hangar', icon: 'flask', color: '#22b8a6' },
  chasseur: { label: 'Chasseur de bugs', icon: 'bug', color: '#3fb950' }
};

/** Badges que seul l'administrateur donne, dans l'ordre d'affichage. */
export const GIVEN_BADGES = Object.keys(GIVEN) as Badge[];

export function givenLabel(b: Badge): string {
  return GIVEN[b].label;
}

/** Badge créé dans le dashboard, tel que l'app l'affiche. Emblème inconnu de cette version : l'étoile. */
export function defView(d: BadgeDef): BadgeView {
  return {
    id: d.id,
    label: d.name,
    icon: (GIVEN_ICONS as readonly string[]).includes(d.icon) ? (d.icon as GivenIcon) : 'star',
    color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : 'var(--accent)'
  };
}

/** Nom, emblème et couleur d'un badge donné par l'administrateur (aussi pour le dashboard admin). */
export function givenView(b: Badge): BadgeView {
  return { id: b, ...GIVEN[b] };
}

/** Indice du plus haut palier atteint, -1 si aucun. */
function tierOf(value: number, tiers: number[]): number {
  let i = -1;
  tiers.forEach((t, k) => {
    if (value >= t) i = k;
  });
  return i;
}

export interface BadgeSource {
  badges?: Badge[];
  /** Serveur d'après la phase 4 : tous les badges donnés, avec leur nom, emblème et couleur. */
  badgeDefs?: BadgeDef[];
  since?: number;
  games?: number | null;
  stores?: number | null;
  playMs?: number | null;
}

export function badgeViews(p: BadgeSource): BadgeView[] {
  const out: BadgeView[] = p.badgeDefs
    ? p.badgeDefs.map(defView)
    : GIVEN_BADGES.filter((b) => p.badges?.includes(b)).map((b) => ({ id: b, ...GIVEN[b] }));
  if (p.since && p.since < PIONEER_END) {
    out.push({ id: 'pionnier', label: 'Pionnier : sur Hangar avant décembre 2026', icon: 'flag', color: PIONEER_COLOR });
  }
  if (typeof p.games === 'number') {
    const i = tierOf(p.games, COLLECTION_TIERS);
    if (i >= 0) {
      out.push({ id: 'collection', label: `Collectionneur : ${COLLECTION_TIERS[i]} jeux et plus`, icon: 'stack', color: TIER_COLORS[i] });
    }
  }
  if (typeof p.playMs === 'number') {
    const i = tierOf(p.playMs / 3_600_000, PLAY_TIERS);
    if (i >= 0) {
      out.push({ id: 'marathon', label: `Marathonien : ${PLAY_TIERS[i]} heures de jeu et plus`, icon: 'clock', color: TIER_COLORS[i + 1] });
    }
  }
  if (typeof p.stores === 'number' && p.stores >= MULTI_STORES) {
    out.push({ id: 'multi', label: `Multi-launchers : jeux sur ${p.stores} launchers`, icon: 'grid', color: MULTI_COLOR });
  }
  return out;
}
