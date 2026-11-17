// Badge d'ancienneté : calculé d'après la date de création du compte Hangar, sans rien demander
// au serveur. L'emblème est l'arche du logo de Hangar, dont la matière gagne en valeur avec le temps.

export interface Tier {
  id: string;
  name: string;
  /** Nom du badge : « Arche d'or ». */
  title: string;
  /** Mois d'ancienneté pour l'obtenir (0 : dès l'inscription). */
  months: number;
  /** Dégradé de l'arche : clair, moyen, sombre. */
  colors: [string, string, string];
}

export const TIERS: Tier[] = [
  { id: 'bronze', name: 'Bronze', title: 'Arche de bronze', months: 0, colors: ['#f6caa3', '#c98652', '#6e3d1f'] },
  { id: 'argent', name: 'Argent', title: "Arche d'argent", months: 1, colors: ['#ffffff', '#c3cad6', '#5f6a7c'] },
  { id: 'or', name: 'Or', title: "Arche d'or", months: 6, colors: ['#fff3b0', '#f2c23d', '#94620a'] },
  { id: 'platine', name: 'Platine', title: 'Arche de platine', months: 12, colors: ['#f4fcff', '#a9d3ee', '#45708f'] },
  { id: 'diamant', name: 'Diamant', title: 'Arche de diamant', months: 24, colors: ['#e6fbff', '#6fd6f7', '#1c64a3'] },
  { id: 'emeraude', name: 'Émeraude', title: "Arche d'émeraude", months: 36, colors: ['#ccffe6', '#34d08a', '#0b6040'] },
  { id: 'rubis', name: 'Rubis', title: 'Arche de rubis', months: 60, colors: ['#ffd3de', '#f0436b', '#7e1029'] },
  { id: 'opale', name: 'Opale', title: "Arche d'opale", months: 72, colors: ['#ffe0f4', '#b4f0ff', '#8d70ff'] }
];

/** La date + `n` mois de calendrier (le 31 janvier + 1 mois : le dernier jour de février). */
export function addMonths(ts: number, n: number): number {
  const d = new Date(ts);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.getTime();
}

/** Durée d'un palier : « Dès l'inscription », « 3 mois », « 1 an », « 6 ans ». */
export function tierAge(t: Tier): string {
  if (t.months === 0) return "Dès l'inscription";
  if (t.months % 12) return `${t.months} mois`;
  const y = t.months / 12;
  return y === 1 ? '1 an' : `${y} ans`;
}

/** Durée entre deux dates en années, mois et jours de calendrier : « 1 an et 2 mois », « 12 jours ». */
export function durationLabel(from: number, to: number): string {
  if (to <= from) return "aujourd'hui";
  let months = 0;
  while (addMonths(from, months + 1) <= to) months++;
  const days = Math.floor((to - addMonths(from, months)) / 86_400_000);
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y) parts.push(y === 1 ? '1 an' : `${y} ans`);
  if (m) parts.push(`${m} mois`);
  // Les jours seulement tant qu'il n'y a pas d'année : « 1 an et 2 mois » suffit.
  if (days && !y) parts.push(days === 1 ? '1 jour' : `${days} jours`);
  if (!parts.length) return "moins d'un jour";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

export interface Seniority {
  tier: Tier;
  index: number;
  /** Palier suivant, null au dernier. */
  next: Tier | null;
  /** Date d'obtention du palier suivant. */
  nextAt: number | null;
  /** Avancée vers le palier suivant, de 0 à 1 (1 au dernier palier). */
  progress: number;
}

/** Palier d'un compte créé à `since`, vu à `now`. */
export function seniority(since: number, now = Date.now()): Seniority {
  let index = 0;
  TIERS.forEach((t, i) => {
    if (addMonths(since, t.months) <= now) index = i;
  });
  const tier = TIERS[index];
  const next = TIERS[index + 1] ?? null;
  if (!next) return { tier, index, next, nextAt: null, progress: 1 };
  const start = addMonths(since, tier.months);
  const nextAt = addMonths(since, next.months);
  const progress = Math.min(1, Math.max(0, (now - start) / (nextAt - start)));
  return { tier, index, next, nextAt, progress };
}
