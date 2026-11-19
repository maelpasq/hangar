// Libellés de la modération : sanctions, durées, statuts des signalements.
import type { ReportStatus, SanctionKind } from './api';
import { TINTS } from './badges.svelte';
import { date } from './format';

export const KINDS: { id: SanctionKind; label: string; help: string }[] = [
  { id: 'social', label: 'Amis coupés', help: 'Amis désactivés et impossibles à réactiver. Le reste du compte marche.' },
  { id: 'total', label: 'Compte suspendu', help: 'Plus de synchro ni d\'amis. Export et suppression restent possibles.' }
];

export const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;

/** Durées proposées, en jours ; null : définitive. */
export const DURATIONS: { days: number | null; label: string }[] = [
  { days: 1, label: '1 jour' },
  { days: 3, label: '3 jours' },
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
  { days: null, label: 'Définitive' }
];

export const untilLabel = (until: number | null) => (until === null ? 'définitive' : `jusqu'au ${date(until)}`);

export const REPORT_STATUSES: { id: ReportStatus; label: string; color: string }[] = [
  { id: 'ouvert', label: 'Ouvert', color: TINTS.warn },
  { id: 'traite', label: 'Traité', color: 'var(--success)' },
  { id: 'rejete', label: 'Rejeté', color: 'var(--muted-2)' }
];

export const reportStatusOf = (id: string) => REPORT_STATUSES.find((s) => s.id === id) ?? REPORT_STATUSES[0];

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harcelement: 'Harcèlement',
  contenu: 'Contenu inapproprié',
  autre: 'Autre'
};

/** Motif enregistré (« harcelement : messages insistants ») : catégorie lisible et précision. */
export function splitReason(reason: string): { label: string; detail: string } {
  const [code, ...rest] = reason.split(' : ');
  const detail = rest.join(' : ').trim();
  return { label: REASON_LABELS[code] ?? code[0].toUpperCase() + code.slice(1), detail: detail ? detail[0].toUpperCase() + detail.slice(1) : '' };
}
