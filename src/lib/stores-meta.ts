import type { StoreId } from './types';

export interface StoreMeta {
  label: string;
  color: string;
  launcher: string;
}

// Ordre = priorité de dédoublonnage et ordre d'affichage.
export const STORE_ORDER: StoreId[] = [
  'steam',
  'epic',
  'gog',
  'ubisoft',
  'ea',
  'battlenet',
  'riot',
  'xbox',
  'local',
  'manual'
];

export const STORES: Record<StoreId, StoreMeta> = {
  steam: { label: 'Steam', color: '#66c0f4', launcher: 'Steam' },
  epic: { label: 'Epic Games', color: 'var(--epic)', launcher: 'Epic Games Launcher' },
  gog: { label: 'GOG', color: '#c084fc', launcher: 'GOG Galaxy' },
  ubisoft: { label: 'Ubisoft Connect', color: '#60a5fa', launcher: 'Ubisoft Connect' },
  ea: { label: 'EA app', color: '#ff6b6b', launcher: 'EA app' },
  battlenet: { label: 'Battle.net', color: '#38a3ff', launcher: 'Battle.net' },
  xbox: { label: 'Xbox', color: '#4ade80', launcher: 'Xbox' },
  riot: { label: 'Riot Games', color: '#ff5c6c', launcher: 'Riot Client' },
  local: { label: 'Local', color: '#f5a524', launcher: "l'exécutable du jeu" },
  manual: { label: 'Ajoutés', color: '#a78bfa', launcher: "l'exécutable du jeu" }
};

export const ACCENTS: { name: string; color: string }[] = [
  { name: 'Violet', color: '#7c6cff' },
  { name: 'Cyan', color: '#22b8f0' },
  { name: 'Corail', color: '#f2556b' },
  { name: 'Vert', color: '#22c55e' },
  { name: 'Ambre', color: '#f59e0b' }
];
