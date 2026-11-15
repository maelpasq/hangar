// Comptes des launchers : état (détecté, connecté) et actions. Aucun jeton ne passe par ici.

import { api } from '../api';
import { STORES } from '../stores-meta';
import type { AccountStatus, StoreId } from '../types';
import { plural } from '../util/format';
import { ui } from './ui.svelte';

class Accounts {
  list = $state<AccountStatus[]>([]);
  /** Store en cours de connexion. */
  busy = $state<StoreId | null>(null);
  byStore = $derived(new Map(this.list.map((a) => [a.store, a])));
  /** Xbox : code à saisir sur microsoft.com/link pendant la connexion. */
  xboxCode = $state<string | null>(null);
  private xboxCancelled = false;

  async refresh(): Promise<void> {
    try {
      this.list = await api.accountsStatus();
    } catch (e) {
      console.error('accounts_status', e);
    }
  }

  private async run(store: StoreId, task: () => Promise<number>): Promise<boolean> {
    if (this.busy) return false;
    this.busy = store;
    try {
      const n = await task();
      ui.toast(`${STORES[store].label} connecté : ${plural(n, 'jeu trouvé', 'jeux trouvés')}`);
      return true;
    } catch (e) {
      // Annulée par l'utilisateur : rien à annoncer.
      if (!(store === 'xbox' && this.xboxCancelled)) ui.toast(String(e).replace(/^Error:\s*/, ''), { error: true });
      return false;
    } finally {
      this.busy = null;
      await this.refresh();
    }
  }

  connectSteam(key: string): Promise<boolean> {
    return this.run('steam', () => api.connectSteam(key.trim()));
  }

  connect(store: StoreId): Promise<boolean> {
    return this.run(store, () => api.connectAccount(store));
  }

  /** Xbox : affiche un code, ouvre microsoft.com/link, puis attend la connexion. */
  async connectXbox(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = 'xbox';
    try {
      this.xboxCode = (await api.xboxLoginCode()).userCode;
    } catch (e) {
      this.busy = null;
      ui.toast(String(e).replace(/^Error:\s*/, ''), { error: true });
      return false;
    }
    this.xboxCancelled = false;
    await this.copyXboxCode(false);
    api.openLink('microsoft-link').catch(() => {});
    this.busy = null;
    try {
      return await this.run('xbox', () => api.connectAccount('xbox'));
    } finally {
      this.xboxCode = null;
    }
  }

  cancelXbox(): void {
    this.xboxCancelled = true;
    this.xboxCode = null;
    api.xboxLoginCancel().catch(() => {});
  }

  /** Copie le code Xbox ; `announce` : dit aussi quand la copie a réussi. */
  async copyXboxCode(announce = true): Promise<void> {
    if (!this.xboxCode) return;
    try {
      await navigator.clipboard.writeText(this.xboxCode);
      if (announce) ui.toast('Code copié');
    } catch {
      if (announce) ui.toast('Copie impossible, recopie le code à la main', { error: true });
    }
  }

  async disconnect(store: StoreId): Promise<void> {
    try {
      await api.disconnectAccount(store);
      ui.toast(`${STORES[store].label} déconnecté, jeton effacé`);
    } catch (e) {
      ui.toast(String(e), { error: true });
    }
    await this.refresh();
  }
}

export const accounts = new Accounts();
