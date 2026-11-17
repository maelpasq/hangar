// Mise à jour de Hangar : recherche (discrète au démarrage, ou à la demande), puis installation.

import { api } from '../api';
import { ui } from './ui.svelte';
import { isSameBaseFix, parseFixes, type Fixes } from '../util/release-notes';

type Phase = 'idle' | 'checking' | 'uptodate' | 'available' | 'installing';

class Updater {
  phase = $state<Phase>('idle');
  /** Version disponible. */
  version = $state('');
  /** Avancement du téléchargement (0 à 1), null si inconnu. */
  progress = $state<number | null>(null);
  /** Texte de la release de la version disponible. */
  notes = $state('');
  /** Version installée, lue à la recherche. */
  current = $state('');

  /** La version disponible est un correctif de la version installée (même base, 4e chiffre). */
  get isFix(): boolean {
    return this.phase !== 'idle' && !!this.version && !!this.current && isSameBaseFix(this.version, this.current);
  }

  /** Corrections apportées depuis la version installée, la plus récente en premier. */
  get fixes(): Fixes[] {
    return this.isFix ? parseFixes(this.notes, this.version, this.current) : [];
  }

  /** Bouton « Mettre à jour » : un correctif montre d'abord ses corrections, une version s'installe. */
  request(): void {
    if (this.phase !== 'available') return;
    if (this.isFix) ui.modal = { kind: 'updateFixes' };
    else void this.install();
  }

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

  /** `quiet` : au démarrage, pas de message si Hangar est à jour ou hors ligne. `announce` :
   *  toast quand une version est trouvée (le bouton Actualiser l'annonce en infobulle). */
  async check(quiet = false, announce = true): Promise<void> {
    if (this.phase === 'checking' || this.phase === 'installing') return;
    this.phase = 'checking';
    try {
      const u = await api.checkUpdate();
      this.version = u?.version ?? '';
      this.notes = u?.notes ?? '';
      this.current = await api.appVersion().catch(() => '');
      this.phase = u ? 'available' : 'uptodate';
      if (u && quiet && announce) ui.toast(`Hangar ${u.version} est disponible`);
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
