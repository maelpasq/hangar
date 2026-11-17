// Badges d'un profil, dans l'ordre d'affichage (à droite du pseudo) : ceux donnés par
// l'administrateur, puis ceux que l'app calcule d'après le profil. Les badges calculés suivent
// la confidentialité du compte : le serveur renvoie `games`, `stores` et `playMs` à null quand
// la bibliothèque ou le temps de jeu sont cachés, et le badge ne s'affiche pas.
// L'ancienneté a son propre composant (`SeniorityBadge.svelte`), toujours en dernier.

import type { Badge } from '../types';

export type BadgeIcon = 'seal' | 'shield' | 'flask' | 'bug' | 'flag' | 'stack' | 'clock' | 'grid';

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

/** Paliers de collection (jeux) et de temps de jeu (heures). */
export const COLLECTION_TIERS = [50, 100, 250, 500];
export const PLAY_TIERS = [100, 500, 1000];

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
  since?: number;
  games?: number | null;
  stores?: number | null;
  playMs?: number | null;
}

export function badgeViews(p: BadgeSource): BadgeView[] {
  const out: BadgeView[] = GIVEN_BADGES.filter((b) => p.badges?.includes(b)).map((b) => ({ id: b, ...GIVEN[b] }));
  if (p.since && p.since < PIONEER_END) {
    out.push({ id: 'pionnier', label: 'Pionnier : sur Hangar avant décembre 2026', icon: 'flag', color: '#f08a3c' });
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
    out.push({ id: 'multi', label: `Multi-launchers : jeux sur ${p.stores} launchers`, icon: 'grid', color: '#4f8ff7' });
  }
  return out;
}
