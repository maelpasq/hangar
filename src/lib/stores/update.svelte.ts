// Mise à jour de Hangar : recherche (discrète au démarrage, ou à la demande), puis installation.

import { api } from '../api';
import { ui } from './ui.svelte';

type Phase = 'idle' | 'checking' | 'uptodate' | 'available' | 'installing';

class Updater {
  phase = $state<Phase>('idle');
  /** Version disponible. */
  version = $state('');
  /** Avancement du téléchargement (0 à 1), null si inconnu. */
  progress = $state<number | null>(null);

  get label(): string {
    switch (this.phase) {
      case 'checking':
        return 'Recherche en cours...';
      case 'uptodate':
        return 'Hangar est à jour';
      case 'available':
        return `Version ${this.version} disponible`;
      case 'installing':
        return this.progress === null ? 'Installation...' : `Téléchargement ${Math.round(this.progress * 100)} %`;
      default:
        return 'Recherche automatique au démarrage';
    }
  }

  /** `quiet` : au démarrage, pas de message si Hangar est à jour ou hors ligne. */
  async check(quiet = false): Promise<void> {
    if (this.phase === 'checking' || this.phase === 'installing') return;
    this.phase = 'checking';
    try {
      const u = await api.checkUpdate();
      this.version = u?.version ?? '';
      this.phase = u ? 'available' : 'uptodate';
      if (u && quiet) ui.toast(`Hangar ${u.version} est disponible`);
    } catch (e) {
      this.phase = 'idle';
      if (!quiet) ui.toast(`Impossible de vérifier les mises à jour : ${String(e)}`, { error: true });
    }
  }

  async install(): Promise<void> {
    if (this.phase !== 'available') return;
    this.phase = 'installing';
    this.progress = null;
    try {
      await api.installUpdate((r) => (this.progress = r));
    } catch (e) {
      this.phase = 'available';
      ui.toast(`Échec de la mise à jour : ${String(e)}`, { error: true });
    }
  }
}

export const updater = new Updater();
