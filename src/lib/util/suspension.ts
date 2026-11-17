// Textes d'une sanction de la modération (compte suspendu, amis coupés), montrés dans les
// Paramètres et l'écran Amis.
import type { CloudSuspension } from '../types';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** « jusqu'au 24 novembre 2026 » ou « définitivement ». */
export function suspensionEnd(s: CloudSuspension): string {
  return s.until === null ? 'définitivement' : `jusqu'au ${dateFmt.format(s.until)}`;
}

/**
 * Titre court, phrase courte (par la modération, jusqu'à quand) et explication complète, avec le
 * motif s'il y en a un.
 */
export function suspensionText(s: CloudSuspension): { title: string; short: string; body: string } {
  const reason = s.reason.trim() ? ` Motif : ${s.reason.trim()}` : '';
  if (s.kind === 'total') {
    const short = `Suspendu par la modération ${suspensionEnd(s)}.`;
    return {
      title: 'Compte suspendu',
      short,
      body: `${short} La synchronisation et les amis sont en pause. Tu peux toujours exporter tes données ou supprimer ton compte.${reason}`
    };
  }
  const short = `Désactivés par la modération ${suspensionEnd(s)}.`;
  return {
    title: 'Amis désactivés',
    short,
    body: `${short} Tu ne peux pas les réactiver pour l'instant, le reste de ton compte fonctionne normalement.${reason}`
  };
}
