// Compte Hangar (facultatif) : état, actions et synchro. Le jeton reste côté Rust, dans le coffre
// du système ; la logique de synchro (le plus récent gagne, élément par élément) est dans
// `util/cloud-sync.ts`.

import { api } from '../api';
import type { CloudChange, CloudStatus } from '../types';
import { ackPushed, applyRemote, hasMeaningful, markAllDirty, pendingChanges, replaceWithRemote } from '../util/cloud-sync';
import { syncEntries } from '../util/sync';
import { library } from './library.svelte';
import { ui } from './ui.svelte';

const ANON: CloudStatus = { connected: false, offline: false, revoked: false, user: null, devices: [] };
/** Récupération régulière des changements des autres postes. */
const PULL_EVERY = 15 * 60_000;
/** Envoi groupé, quelques secondes après un changement. */
const PUSH_DELAY = 5_000;
/** Garde-fou : pages lues ou envoyées par synchro. */
const MAX_PAGES = 100;

const message = (e: unknown) => String(e).replace(/^Error:\s*/, '');

/** à jour, en cours, serveur injoignable (changements gardés), refus du serveur. */
export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

/** Choix de la première connexion, quand le poste et le compte ont tous deux des données. */
export type FirstChoice = 'merge' | 'account';

class Cloud {
  status = $state<CloudStatus>(ANON);
  /** Connexion en cours dans le navigateur. */
  busy = $state(false);
  phase = $state<SyncState>('idle');
  /** Dernière synchro réussie (ms epoch, 0 : aucune depuis le lancement). */
  lastSync = $state(0);
  private loading: Promise<void> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private started = false;

  /** Pseudo affiché : nom du compte, sinon le début de l'adresse e-mail. */
  name = $derived(this.status.user?.name.trim() || this.status.user?.email.split('@')[0] || 'Compte');
  initial = $derived(this.name.charAt(0).toUpperCase());
  /** État de synchro affiché (pastille, Paramètres). */
  syncState = $derived<SyncState>(this.status.offline ? 'offline' : this.phase);

  async refresh(): Promise<void> {
    try {
      const s = await api.cloudStatus();
      if (s.revoked) this.dropped();
      this.status = s;
    } catch (e) {
      console.error('cloud_status', e);
    }
  }

  /** Premier chargement de l'état (une seule fois par lancement). */
  load(): Promise<void> {
    this.loading ??= this.refresh();
    return this.loading;
  }

  /**
   * Lance la synchro une fois la bibliothèque chargée : tout de suite, puis toutes les 15 min,
   * quelques secondes après chaque changement et au retour du réseau.
   */
  start(): () => void {
    if (this.started) return () => {};
    this.started = true;
    library.onDirty = () => this.schedulePush();
    // Poste déconnecté pendant que Hangar était fermé : la prochaine connexion refera la fusion.
    void this.load().then(() => {
      if (!this.status.connected && library.state.cloud.merged) this.resetSync();
    });
    const timer = setInterval(() => void this.sync(), PULL_EVERY);
    const online = () => void this.sync();
    window.addEventListener('online', online);
    void this.load().then(() => this.sync());
    return () => {
      clearInterval(timer);
      clearTimeout(this.pushTimer);
      window.removeEventListener('online', online);
      library.onDirty = null;
      this.started = false;
    };
  }

  private schedulePush(): void {
    // Hors ligne : la file attend la prochaine synchro (15 min, ou retour du réseau).
    if (!this.status.connected || this.syncState === 'offline') return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.sync(), PUSH_DELAY);
  }

  /** Synchronise maintenant (une seule à la fois ; demandée pendant une synchro, elle est refaite après). */
  sync(): Promise<void> {
    if (!this.status.connected || library.loadError) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    clearTimeout(this.pushTimer);
    this.running = (async () => {
      do {
        this.again = false;
        await this.run();
      } while (this.again && this.status.connected && this.phase === 'idle');
    })().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<void> {
    const s = library.state;
    this.phase = 'syncing';
    try {
      const first = !s.cloud.merged;
      let cursor = first ? 0 : s.cloud.cursor;
      const changes: CloudChange[] = [];
      for (let i = 0; i < MAX_PAGES; i++) {
        const page = await api.cloudPull(cursor);
        changes.push(...page.changes);
        cursor = page.cursor;
        if (!page.more) break;
      }
      if (first) {
        const choice = await this.firstChoice(changes);
        library.flushStamps();
        if (choice === 'account') replaceWithRemote(s, changes);
        else {
          markAllDirty(s);
          applyRemote(s, changes);
        }
        s.cloud.merged = true;
      } else {
        library.flushStamps();
        applyRemote(s, changes);
      }
      s.cloud.cursor = cursor;
      library.remoteApplied();

      for (let i = 0; i < MAX_PAGES; i++) {
        library.flushStamps();
        const batch = pendingChanges(s);
        if (!batch.length) break;
        await api.cloudPush(batch);
        ackPushed(s, batch);
      }
      library.save();

      const key = await api.cloudSyncSteamGridDb(first).catch(() => null);
      if (key !== null && key !== s.prefs.steamGridDb) {
        s.prefs.steamGridDb = key;
        library.save();
      }
      this.phase = 'idle';
      this.lastSync = Date.now();
      if (this.status.offline) this.status = { ...this.status, offline: false };
    } catch (e) {
      console.error('cloud_sync', message(e));
      await this.failed();
    }
  }

  /** Échec : serveur injoignable (la file attend), ou poste déconnecté du compte. */
  private async failed(): Promise<void> {
    const st = await api.cloudStatus().catch(() => null);
    if (st && !st.connected) {
      this.status = ANON;
      this.dropped();
      return;
    }
    if (st) this.status = st;
    this.phase = !st || st.offline ? 'offline' : 'error';
  }

  /** Le compte a refusé ce poste (déconnecté à distance) : retour en anonyme, tout reste ici. */
  private dropped(): void {
    ui.toast('Ce PC a été déconnecté de ton compte Hangar.');
    this.resetSync();
  }

  private resetSync(): void {
    this.phase = 'idle';
    this.lastSync = 0;
    const c = library.state.cloud;
    c.cursor = 0;
    c.merged = false;
    c.dirty = [];
    library.save();
  }

  /**
   * Première synchro de ce poste : fusion d'office si un des deux côtés n'a rien de personnel
   * (compte vide : tout est envoyé ; poste neuf : le compte l'emporte), sinon la question.
   * Fermer la question vaut « Fusionner », le choix par défaut, qui ne perd rien.
   */
  private firstChoice(changes: CloudChange[]): Promise<FirstChoice> {
    const alive = changes.filter((c) => c.value !== null).map((c) => c.key);
    if (!alive.length) return Promise.resolve('merge');
    library.flushStamps();
    // Poste sans rien de personnel : ses réglages par défaut ne doivent pas écraser ceux du compte.
    if (!hasMeaningful(syncEntries(library.state).keys())) return Promise.resolve('account');
    if (!hasMeaningful(alive)) return Promise.resolve('merge');
    return (async () => {
      // Une autre fenêtre est ouverte (assistant de démarrage...) : la question attend qu'elle se ferme.
      while (ui.modal) await new Promise((r) => setTimeout(r, 400));
      return new Promise<FirstChoice>((resolve) => {
        ui.modal = { kind: 'cloudMerge', resolve };
      });
    })();
  }

  async login(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      this.status = await api.cloudLogin(library.state.deviceId);
      ui.toast(`Connecté au compte Hangar : ${this.name}`);
      void this.sync();
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

  /** La file d'envoi reste sur le poste : la prochaine connexion fusionne de toute façon tout. */
  async logout(): Promise<void> {
    try {
      await api.cloudLogout();
    } catch (e) {
      console.error('cloud_logout', e);
    }
    this.status = ANON;
    this.resetSync();
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
