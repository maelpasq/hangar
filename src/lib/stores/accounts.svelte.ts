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
      ui.toast(String(e).replace(/^Error:\s*/, ''), { error: true });
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
