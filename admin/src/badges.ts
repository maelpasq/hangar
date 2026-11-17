// Badges donnés par l'administrateur, vus dans le dashboard (docs/ADMIN-DESIGN.md, section 3) :
// nom court et couleur. Avec bug-status.ts, le seul module où une couleur s'écrit en dur.
import type { Badge } from './api';

export const BADGES: { id: Badge; label: string; hint: string; color: string }[] = [
  { id: 'certifie', label: 'Certifié', hint: 'Compte vérifié par Hangar', color: 'var(--accent)' },
  { id: 'equipe', label: 'Équipe', hint: 'Membre de pamal Studio', color: 'var(--success)' },
  { id: 'testeur', label: 'Testeur', hint: 'Teste les versions de Hangar Test', color: '#3b82f6' },
  { id: 'chasseur', label: 'Chasseur de bugs', hint: 'A signalé un bug corrigé', color: 'var(--star)' }
];

export const badgeOf = (id: string) => BADGES.find((b) => b.id === id) ?? BADGES[0];

/** Teintes d'accompagnement des chiffres clés et du journal. */
export const TINTS = {
  info: '#3b82f6',
  social: '#f2556b',
  warn: '#f5a524',
  discord: '#5865f2'
};
