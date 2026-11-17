// Chiffres du dashboard, partagés entre la barre latérale (compteurs) et l'accueil.
import { api, type Stats } from './api';

export const stats = $state<{ data: Stats | null; failed: boolean; at: number }>({ data: null, failed: false, at: 0 });

export async function loadStats() {
  try {
    stats.data = await api.stats();
    stats.failed = false;
    stats.at = Date.now();
  } catch {
    stats.failed = true;
  }
}
