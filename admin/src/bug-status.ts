// Statuts des bugs (comme server/src/bug.ts) : nom, couleur de la pastille, ouvert ou clos.
import type { BugStatus } from './api';

export const STATUSES: { id: BugStatus; label: string; color: string; open: boolean }[] = [
  { id: 'nouveau', label: 'Nouveau', color: 'var(--accent)', open: true },
  { id: 'confirme', label: 'Confirmé', color: '#f5a524', open: true },
  { id: 'en_cours', label: 'En cours', color: '#3b82f6', open: true },
  { id: 'corrige', label: 'Corrigé', color: 'var(--success)', open: false },
  { id: 'rejete', label: 'Rejeté', color: 'var(--muted-2)', open: false },
  { id: 'doublon', label: 'Doublon', color: 'var(--muted-2)', open: false }
];

export const OPEN_IDS = STATUSES.filter((s) => s.open).map((s) => s.id);

export const statusOf =(id: string) => STATUSES.find((s) => s.id === id) ?? STATUSES[0];

/** Filtres de la liste : les ouverts, chaque statut, tous. */
export const FILTERS: { id: string; label: string }[] = [
  { id: 'ouverts', label: 'Ouverts' },
  ...STATUSES.map((s) => ({ id: s.id as string, label: s.label })),
  { id: 'tous', label: 'Tous' }
];

export const SYSTEMS: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
