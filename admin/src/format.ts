// Mise en forme : dates, durées, libellés du journal.
import type { LogRow } from './api';
import { TINTS, badgeOf } from './badges.svelte';
import { statusOf } from './bug-status';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const shortTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const nf = new Intl.NumberFormat('fr-FR');

export const date = (ms: number) => dateFmt.format(ms);
export const dateTime = (ms: number) => dateTimeFmt.format(ms);
export const num = (n: number) => nf.format(n);
/** « 19 oct. » */
export const shortDate = (ms: number) => shortFmt.format(ms);
/** « 15 nov. 10:24 » */
export const shortDateTime = (ms: number) => shortTimeFmt.format(ms).replace(/,? à |, /, ' ');

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

/** Nom d'un badge noté au journal (le nom actuel s'il existe encore). */
const badgeName = (l: LogRow) => badgeOf(String(l.detail?.badge), typeof l.detail?.name === 'string' ? l.detail.name : undefined).name;

const FIELD_LABELS: Record<string, string> = { name: 'nom', description: 'description', icon: 'emblème', color: 'couleur', active: 'affichage' };
const changesLabel = (c: unknown) => (Array.isArray(c) ? c.map((k) => FIELD_LABELS[String(k)] ?? String(k)).join(', ') : '');

/** Phrase d'une ligne du journal, sans le compte visé. */
export function actionLabel(l: LogRow): string {
  const badge = typeof l.detail?.badge === 'string' ? badgeName(l) : '';
  switch (l.action) {
    case 'badge.donner':
      return `Badge donné : ${badge}`;
    case 'badge.retirer':
      return `Badge retiré : ${badge}`;
    case 'badge.creer':
      return `Badge créé : ${badge}`;
    case 'badge.modifier':
      return `Badge modifié : ${badge}`;
    case 'badge.supprimer':
      return `Badge supprimé : ${badge}`;
    case 'badge.ordre':
      return 'Ordre des badges changé';
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

/** Phrase courte d'une ligne du journal, avec sa cible (« #37 passé en Corrigé (1.2.29) »). */
export function logText(l: LogRow): string {
  const d = l.detail ?? {};
  const who = l.targetName ?? '';
  switch (l.action) {
    case 'badge.donner':
      return `Badge ${badgeName(l)} donné à ${who}`;
    case 'badge.retirer':
      return `Badge ${badgeName(l)} retiré à ${who}`;
    case 'badge.creer':
    case 'badge.modifier':
    case 'badge.supprimer':
    case 'badge.ordre':
      return actionLabel(l);
    case 'bug.statut': {
      const id = l.targetId?.replace(/^bug:/, '') ?? '';
      const more = d.fixedIn ? ` (${d.fixedIn})` : d.duplicateOf ? ` (doublon du #${d.duplicateOf})` : '';
      return `#${id} passé en ${statusOf(String(d.vers)).label}${more}`;
    }
    case 'bug.note':
      return `#${l.targetId?.replace(/^bug:/, '') ?? ''} : note interne modifiée`;
    default:
      return who ? `${actionLabel(l)} · ${who}` : actionLabel(l);
  }
}

/** « Aujourd'hui 19:12 », « Hier 21:05 », sinon « 15 nov. 10:24 ». */
export function when(ms: number, now = Date.now()): string {
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const time = new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const d = Math.round((day(now) - day(ms)) / 86_400_000);
  return d === 0 ? `Aujourd’hui ${time}` : d === 1 ? `Hier ${time}` : shortDateTime(ms);
}

/** Couleur de la puce d'une action du journal. */
export function actionColor(action: string): string {
  if (action === 'bug.statut') return 'var(--accent)';
  if (action === 'bug.note') return TINTS.info;
  if (action === 'badge.donner' || action === 'badge.creer' || action === 'sanction.lever') return 'var(--success)';
  if (action === 'badge.retirer' || action === 'badge.supprimer' || action === 'sanction.donner') return 'var(--danger)';
  if (action === 'badge.modifier' || action === 'badge.ordre') return 'var(--accent)';
  return TINTS.warn;
}

/** Colonne « Détail » du journal : le changement seul (« En cours → Corrigé (1.2.29) »). */
export function logDetail(l: LogRow): string {
  const d = l.detail ?? {};
  switch (l.action) {
    case 'badge.donner':
    case 'badge.retirer':
    case 'badge.creer':
    case 'badge.supprimer':
      return badgeName(l);
    case 'badge.modifier':
      return `${badgeName(l)} : ${changesLabel(d.changes)}`;
    case 'badge.ordre':
      return 'Nouvel ordre d’affichage';
    case 'bug.statut': {
      const to = statusOf(String(d.vers)).label;
      const target = d.duplicateOf ? `Doublon de #${d.duplicateOf}` : to;
      const more = d.fixedIn ? ` (${d.fixedIn})` : '';
      return d.de === d.vers ? `Précisé : ${target}${more}` : `${statusOf(String(d.de)).label} → ${target}${more}`;
    }
    case 'bug.note':
      return 'Note interne modifiée';
    default:
      return actionLabel(l);
  }
}
