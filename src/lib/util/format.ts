// Formats français : durées, dates relatives, tailles.

const DAY = 86_400_000;
const HOUR = 3_600_000;

const nf = new Intl.NumberFormat('fr-FR');
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Début du jour local (minuit) pour un horodatage. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Nombre de jours calendaires entre `ts` et `now` (0 = aujourd'hui). */
export function daysAgo(ts: number, now = Date.now()): number {
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(ts)) / DAY));
}

/** « Aujourd'hui », « Hier », « Il y a N jours ». */
export function relativeDay(ts: number, now = Date.now()): string {
  const d = daysAgo(ts, now);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  return `Il y a ${d} jours`;
}

/** Temps de jeu : « 214 h », « 45 min », « 0 h ». */
export function hoursLabel(ms: number): string {
  if (ms <= 0) return '0 h';
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  return `${nf.format(Math.round(ms / HOUR))} h`;
}

/** Nombre d'heures entières (pour les totaux). */
export function hours(ms: number): number {
  return Math.round(ms / HOUR);
}

/** Chronomètre « mm:ss », puis « h:mm:ss » au-delà d'une heure. */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${two(mm)}:${two(ss)}` : `${two(mm)}:${two(ss)}`;
}

/** Taille disque : « 450 Mo », « 1,4 Go », « 23 Go ». */
export function sizeLabel(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return '-';
  const mb = bytes / 1_000_000;
  if (mb < 1000) return `${nf.format(Math.max(1, Math.round(mb)))} Mo`;
  const gb = bytes / 1_000_000_000;
  return `${gb < 10 ? nf1.format(gb) : nf.format(Math.round(gb))} Go`;
}

/** Date longue : « 12 mars 2026 ». */
export function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Moment récent : « À l'instant », « Il y a 5 min », « Il y a 3 h », puis comme `relativeDay`. */
export function timeAgo(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60_000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  if (min < 12 * 60) return `Il y a ${Math.floor(min / 60)} h`;
  return relativeDay(ts, now);
}

/** Heure d'un message : « 14:05 », précédée du jour s'il n'est pas d'aujourd'hui. */
export function messageTime(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const days = daysAgo(ts, now);
  if (days === 0) return hm;
  if (days === 1) return `Hier ${hm}`;
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${hm}`;
}

/** Pluriel simple : « 1 jeu », « 3 jeux ». */
export function plural(n: number, one: string, many: string): string {
  return `${nf.format(n)} ${n > 1 ? many : one}`;
}

export function formatNumber(n: number): string {
  return nf.format(n);
}

export const DAY_MS = DAY;
