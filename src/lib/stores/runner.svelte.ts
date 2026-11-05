// Lancement et suivi des jeux, piloté par les événements launch://* du backend.

import { rescan } from '../actions';
import { api } from '../api';
import type { LaunchEvent } from '../types';
import { elapsed } from '../util/format';
import { library } from './library.svelte';
import { ui } from './ui.svelte';

export interface Launching {
  gameId: string;
  /** 0 = ouverture du launcher, 1 = démarrage du jeu, 2 = bon jeu */
  step: 0 | 1 | 2;
  key: number;
}

/** Fermeture de l'overlay au plus tard après ce délai. */
const OVERLAY_MAX_MS = 4000;
/** Écart minimal entre deux scans au retour sur Hangar pendant une installation. */
const INSTALL_RESCAN_MS = 30_000;

class Runner {
  launching = $state<Launching | null>(null);
  /** Jeux dont un processus est détecté, avec l'heure de début. */
  running = $state<Record<string, number>>({});
  now = $state(Date.now());

  /** Jeu en cours le plus récent (carte de la barre latérale). */
  current = $derived.by(() => {
    const ids = Object.keys(this.running);
    if (!ids.length) return null;
    return ids.reduce((a, b) => (this.running[a] >= this.running[b] ? a : b));
  });

  private seq = 0;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;
  private clock: ReturnType<typeof setInterval> | undefined;
  private minimizedByUs = false;
  private lastFail = '';
  /** Installations ou désinstallations en attente : id -> état « non installé » au départ.
   *  Au retour sur la fenêtre, un rescan dit si elles sont faites. */
  private installs = new Map<string, boolean>();
  private lastInstallScan = 0;

  isRunning(id: string): boolean {
    return id in this.running;
  }

  elapsed(id: string): string {
    const start = this.running[id];
    return start ? elapsed(this.now - start) : '00:00';
  }

  async play(gameId: string): Promise<void> {
    const g = library.get(gameId);
    if (!g) return;
    if (g.notInstalled) return this.install(gameId);
    if (this.isRunning(gameId)) {
      ui.open(gameId);
      return;
    }
    if (this.launching) return;
    ui.query = '';
    ui.searchOpen = false;
    ui.menu = null;
    this.launching = { gameId, step: 0, key: ++this.seq };
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.closeOverlay(true), OVERLAY_MAX_MS);
    try {
      await api.launchGame(gameId);
    } catch (e) {
      this.fail(gameId, String(e));
    }
  }

  /** Ouvre l'installation dans le launcher du jeu ; le scan le verra installé plus tard. */
  async install(gameId: string): Promise<void> {
    const g = library.get(gameId);
    if (!g) return;
    ui.menu = null;
    try {
      await api.installGame(gameId);
      this.watchInstall(gameId);
      ui.toast(`Installation de ${library.name(g)} ouverte dans ${g.launcherName}`, { gameId });
    } catch (e) {
      this.fail(gameId, String(e));
    }
  }

  /** Suit une installation ou une désinstallation ouverte dans un launcher. */
  watchInstall(gameId: string): void {
    this.installs.set(gameId, !!library.get(gameId)?.notInstalled);
  }

  /** Retour sur Hangar : rescan si une installation est en cours (au plus toutes les 30 s). */
  async checkInstalls(): Promise<void> {
    if (!this.installs.size || Date.now() - this.lastInstallScan < INSTALL_RESCAN_MS) return;
    this.lastInstallScan = Date.now();
    await rescan();
    for (const [id, was] of this.installs) if (!!library.get(id)?.notInstalled !== was) this.installs.delete(id);
  }

  /** Discord : le jeu en cours le plus récent, ou rien. */
  private syncPresence(): void {
    if (!library.state.prefs.discordPresence) return;
    const id = this.current;
    api.setPresence(id, id ? this.running[id] : 0).catch(() => {});
  }

  cancel(): void {
    clearTimeout(this.closeTimer);
    this.launching = null;
  }

  async stop(gameId: string): Promise<void> {
    try {
      await api.stopGame(gameId);
    } catch (e) {
      ui.toast(String(e), { error: true, gameId });
    }
  }

  handle(e: LaunchEvent): void {
    const l = this.launching;
    const mine = l?.gameId === e.gameId;
    switch (e.type) {
      case 'started':
        library.recordLaunch(e.gameId);
        if (mine && l.step < 1) this.launching = { ...l, step: 1 };
        break;
      case 'running':
        this.running = { ...this.running, [e.gameId]: Date.now() };
        this.tick();
        this.syncPresence();
        if (mine) {
          this.launching = { ...l, step: 2 };
          clearTimeout(this.closeTimer);
          this.closeTimer = setTimeout(() => this.closeOverlay(true), 700);
        }
        break;
      case 'ended': {
        const { [e.gameId]: _gone, ...rest } = this.running;
        this.running = rest;
        if (e.session) library.recordSession(e.session);
        this.syncPresence();
        if (mine) this.cancel();
        if (this.minimizedByUs && !Object.keys(rest).length) {
          this.minimizedByUs = false;
          api.win.restore().catch(() => {});
        }
        this.tick();
        break;
      }
      case 'failed':
        this.fail(e.gameId, e.message);
        break;
    }
  }

  private fail(gameId: string, message: string): void {
    const key = `${gameId}|${message}`;
    if (this.lastFail === key) return;
    this.lastFail = key;
    setTimeout(() => (this.lastFail = ''), 1500);
    if (this.launching?.gameId === gameId) this.cancel();
    ui.toast(message.replace(/^Error:\s*/, ''), { error: true, gameId });
  }

  private closeOverlay(ok: boolean): void {
    const l = this.launching;
    if (!l) return;
    clearTimeout(this.closeTimer);
    this.launching = null;
    if (!ok) return;
    const g = library.get(l.gameId);
    if (g) ui.toast(`${library.name(g)} lancé`, { gameId: g.id });
    if (library.state.prefs.minimizeOnLaunch) {
      this.minimizedByUs = true;
      api.win.minimize().catch(() => {});
    }
  }

  /** Chronomètre : une seule horloge, active seulement pendant une partie. */
  private tick(): void {
    const any = Object.keys(this.running).length > 0;
    if (any && !this.clock) {
      this.now = Date.now();
      this.clock = setInterval(() => (this.now = Date.now()), 1000);
    } else if (!any && this.clock) {
      clearInterval(this.clock);
      this.clock = undefined;
    }
  }
}

export const runner = new Runner();
