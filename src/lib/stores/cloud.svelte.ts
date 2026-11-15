// Compte Hangar (facultatif) : état et actions. Le jeton reste côté Rust, dans le coffre du système.

import { api } from '../api';
import type { CloudStatus } from '../types';
import { library } from './library.svelte';
import { ui } from './ui.svelte';

const ANON: CloudStatus = { connected: false, offline: false, revoked: false, user: null, devices: [] };

const message = (e: unknown) => String(e).replace(/^Error:\s*/, '');

class Cloud {
  status = $state<CloudStatus>(ANON);
  /** Connexion en cours dans le navigateur. */
  busy = $state(false);
  private loaded = false;

  /** Pseudo affiché : nom du compte, sinon le début de l'adresse e-mail. */
  name = $derived(this.status.user?.name.trim() || this.status.user?.email.split('@')[0] || 'Compte');
  initial = $derived(this.name.charAt(0).toUpperCase());

  async refresh(): Promise<void> {
    try {
      const s = await api.cloudStatus();
      if (s.revoked) ui.toast('Ce PC a été déconnecté de ton compte Hangar.');
      this.status = s;
    } catch (e) {
      console.error('cloud_status', e);
    }
  }

  /** Premier chargement de l'état (une seule fois par lancement). */
  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    void this.refresh();
  }

  async login(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      this.status = await api.cloudLogin(library.state.deviceId);
      ui.toast(`Connecté au compte Hangar : ${this.name}`);
      return true;
    } catch (e) {
      // Annulée : rien à annoncer.
      const m = message(e);
      if (m) ui.toast(m, { error: true });
      return false;
    } finally {
      this.busy = false;
    }
  }

  cancel(): void {
    api.cloudCancelLogin().catch(() => {});
  }

  async logout(): Promise<void> {
    try {
      await api.cloudLogout();
    } catch (e) {
      console.error('cloud_logout', e);
    }
    this.status = ANON;
    ui.toast('Déconnecté du compte Hangar. Tes jeux et réglages restent sur ce PC.');
  }

  private async apply(task: () => Promise<CloudStatus>): Promise<boolean> {
    try {
      this.status = await task();
      return true;
    } catch (e) {
      ui.toast(message(e), { error: true });
      await this.refresh();
      return false;
    }
  }

  renameDevice(id: string, name: string): Promise<boolean> {
    return this.apply(() => api.cloudRenameDevice(id, name.trim()));
  }

  forgetDevice(id: string): Promise<boolean> {
    return this.apply(() => api.cloudForgetDevice(id));
  }
}

export const cloud = new Cloud();
