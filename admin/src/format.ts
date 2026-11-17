// Mise en forme : dates, durées, libellés du journal.
import { givenLabel } from '../../src/lib/util/badges';
import type { Badge, LogRow } from './api';
import { statusOf } from './bug-status';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const nf = new Intl.NumberFormat('fr-FR');

export const date = (ms: number) => dateFmt.format(ms);
export const dateTime = (ms: number) => dateTimeFmt.format(ms);
export const num = (n: number) => nf.format(n);

/** « il y a 3 h », « hier », sinon la date. */
export function ago(ms: number | null, now = Date.now()): string {
  if (ms === null) return 'jamais';
  const d = now - ms;
  if (d < 60_000) return 'à l\'instant';
  if (d < 3_600_000) return `il y a ${Math.floor(d / 60_000)} min`;
  if (d < 86_400_000) return `il y a ${Math.floor(d / 3_600_000)} h`;
  if (d < 2 * 86_400_000) return 'hier';
  if (d < 30 * 86_400_000) return `il y a ${Math.floor(d / 86_400_000)} j`;
  return date(ms);
}

export const hours = (ms: number) => `${num(Math.round(ms / 3_600_000))} h`;

/** Phrase d'une ligne du journal, sans le compte visé. */
export function actionLabel(l: LogRow): string {
  const badge = typeof l.detail?.badge === 'string' ? givenLabel(l.detail.badge as Badge) : '';
  switch (l.action) {
    case 'badge.donner':
      return `Badge donné : ${badge}`;
    case 'badge.retirer':
      return `Badge retiré : ${badge}`;
    case 'bug.statut': {
      const d = l.detail ?? {};
      const to = statusOf(String(d.vers)).label;
      const more = d.fixedIn ? ` dans ${d.fixedIn}` : d.duplicateOf ? ` du #${d.duplicateOf}` : '';
      return d.de === d.vers ? `Statut précisé : ${to}${more}` : `Statut : ${statusOf(String(d.de)).label} → ${to}${more}`;
    }
    case 'bug.note':
      return 'Note interne modifiée';
    case 'sanction.donner': {
      const d = l.detail ?? {};
      const what = d.kind === 'total' ? 'Compte suspendu' : 'Amis coupés';
      const how = typeof d.days === 'number' ? `${d.days} j` : 'définitivement';
      return `${what} (${how}) : ${String(d.reason ?? '')}`;
    }
    case 'sanction.lever':
      return `Sanction levée : ${l.detail?.kind === 'total' ? 'compte suspendu' : 'amis coupés'}`;
    case 'signalement.statut': {
      const names: Record<string, string> = { ouvert: 'ouvert', traite: 'traité', rejete: 'rejeté' };
      return `Signalement ${names[String(l.detail?.vers)] ?? String(l.detail?.vers)}`;
    }
    default:
      return l.action;
  }
}
