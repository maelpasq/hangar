// Lancement et suivi des jeux, piloté par les événements launch://* du backend.

import { rescan, showLauncher } from '../actions';
import { api } from '../api';
import type { LaunchEvent, LauncherPrompt } from '../types';
import { elapsed } from '../util/format';
import { isLinux, isMac } from '../util/platform';
import { library } from './library.svelte';
import { ui } from './ui.svelte';

export interface Launching {
  gameId: string;
  /** 0 = ouverture du launcher, 1 = démarrage du jeu, 2 = bon jeu */
  step: 0 | 1 | 2;
  key: number;
  /** Steam attend une réponse (Steam Cloud) : la question est posée dans l'écran de lancement. */
  prompt?: LauncherPrompt;
  /** La boîte de Steam est montrée, l'utilisateur y fait son choix. */
  inLauncher?: boolean;
}

/** Fermeture de l'overlay au plus tard après ce délai. */
const OVERLAY_MAX_MS = 4000;
/** Question d'un launcher reçue jusqu'à ce délai après le lancement (recherche du jeu par le suivi). */
const PROMPT_MAX_MS = 95_000;
/** Relevé de la progression des téléchargements Steam. */
const PROGRESS_MS = 2000;
/** Téléchargement Steam resté à 0 % aussi longtemps : signalé. */
const STUCK_MS = 5 * 60_000;
/** Écart minimal entre deux scans au retour sur Hangar pendant une installation. */
const INSTALL_RESCAN_MS = 30_000;

const installState = (id: string): string => {
  const g = library.get(id);
  return `${!!g?.notInstalled}|${!!g?.updatePending}`;
};

class Runner {
  launching = $state<Launching | null>(null);
  private lastLaunch: { gameId: string; at: number } | null = null;
  /** Jeux dont un processus est détecté, avec l'heure de début. */
  running = $state<Record<string, number>>({});
  /** Jeux web ouverts dans leur fenêtre, avec l'heure d'ouverture (présence Discord seulement). */
  web = $state<Record<string, number>>({});
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
  /** Installations, désinstallations ou mises à jour en attente : id -> état du jeu au départ.
   *  Au retour sur la fenêtre, un rescan dit si elles sont faites. */
  private installs = new Map<string, string>();
  /** Installations demandées et pas encore parties (double clic, manette). */
  private installing = new Set<string>();
  /** Téléchargements Steam suivis : progression de 0 à 1, et pause demandée dans Steam. */
  progress = $state<Record<string, { value: number; kind: 'install' | 'update'; paused?: boolean }>>({});  /** Début de chaque téléchargement suivi, et s'il a déjà été signalé comme bloqué. */
  private started = new Map<string, { at: number; warned: boolean }>();
  private poll: ReturnType<typeof setInterval> | undefined;
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
    this.lastLaunch = { gameId, at: Date.now() };
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.closeOverlay(true), OVERLAY_MAX_MS);
    try {
      await api.launchGame(gameId);
    } catch (e) {
      this.fail(gameId, String(e));
    }
  }

  /** Installe le jeu : demande d'abord le dossier quand le launcher en a plusieurs à proposer. */
  async install(gameId: string): Promise<void> {
    ui.menu = null;
    if (this.installing.has(gameId)) return;
    this.installing.add(gameId);
    try {
      await this.askInstall(gameId);
    } finally {
      this.installing.delete(gameId);
    }
  }

  private async askInstall(gameId: string): Promise<void> {
    // Téléchargement déjà lancé (Hangar rouvert entre-temps) : on reprend juste sa progression.
    if (library.get(gameId)?.store === 'steam' && (await api.installProgress(gameId).catch(() => null)) !== null) {
      this.follow(gameId, 'install');
      return;
    }
    const targets = await api.installTargets(gameId).catch(() => []);
    // Mode manette : pas de fenêtre à la souris, le dossier par défaut du launcher.
    if (targets.length && !ui.big) ui.modal = { kind: 'installDir', gameId, targets };
    else await this.startInstall(gameId, targets[0]?.path ?? null);
  }

  /** Installation dans le dossier choisi (fenêtre des dossiers). */
  async installTo(gameId: string, dir: string | null): Promise<void> {
    if (this.installing.has(gameId)) return;
    this.installing.add(gameId);
    try {
      await this.startInstall(gameId, dir);
    } finally {
      this.installing.delete(gameId);
    }
  }

  /** Steam sous Windows : en arrière-plan avec sa progression ; ailleurs dans leur launcher. */
  private async startInstall(gameId: string, dir: string | null): Promise<void> {
    const g = library.get(gameId);
    if (!g) return;
    try {
      ui.toast(await api.installGame(gameId, dir), { gameId });
      // Hors Windows, Steam attend la confirmation de sa fenêtre : pas encore de manifeste à suivre.
      if (g.store === 'steam' && !isLinux && !isMac) this.follow(gameId, 'install');
      else this.watchInstall(gameId);
    } catch (e) {
      this.fail(gameId, String(e));
    }
  }

  /** Suit un téléchargement Steam (installation ou mise à jour) jusqu'à la fin. */
  follow(gameId: string, kind: 'install' | 'update'): void {
    if (gameId in this.progress) return;
    this.progress = { ...this.progress, [gameId]: { value: 0, kind } };
    this.started.set(gameId, { at: Date.now(), warned: false });
    this.poll ??= setInterval(() => this.pollProgress(), PROGRESS_MS);
  }

  /** Reprend le suivi des téléchargements Steam en cours (Hangar relancé, ou lancés depuis Steam). */
  async resumeDownloads(): Promise<void> {
    if (isLinux || isMac) return;
    for (const id of await api.steamDownloads().catch(() => [])) {
      const g = library.get(id);
      if (g) this.follow(id, g.notInstalled ? 'install' : 'update');
    }
  }

  /** Page des téléchargements de Steam (pause, reprise, annulation) : Steam ne laisse pas
   *  une autre app les faire elle-même. */
  async showInSteam(gameId: string): Promise<void> {
    try {
      await api.showSteamDownloads();
    } catch (e) {
      ui.toast(String(e), { error: true, gameId });
    }
  }

  /** « Installation 42 % », « Mise à jour 42 % » ou « En pause 42 % » pendant un téléchargement suivi. */
  busyLabel(gameId: string): string | null {
    const p = this.progress[gameId];
    if (!p) return null;
    return `${p.paused ? 'En pause' : p.kind === 'install' ? 'Installation' : 'Mise à jour'} ${Math.round(p.value * 100)} %`;
  }

  private async pollProgress(): Promise<void> {
    for (const [id, p] of Object.entries(this.progress)) {
      const v = await api.installProgress(id).catch(() => null);
      if (v !== null) {
        this.progress = { ...this.progress, [id]: { ...p, value: v[0], paused: v[1] } };
        if (!v[1]) this.warnIfStuck(id, v[0]);
        continue;
      }
      const { [id]: _done, ...rest } = this.progress;
      this.progress = rest;
      this.started.delete(id);
      await rescan();
      const g = library.get(id);
      if (!g) continue;
      if (g.notInstalled) ui.toast(`L'installation de ${library.name(g)} n'a pas abouti`, { error: true, gameId: id });
      else ui.toast(`${library.name(g)} est prêt`, { gameId: id, action: { label: 'Jouer', run: () => this.play(id) } });
    }
    if (!Object.keys(this.progress).length) {
      clearInterval(this.poll);
      this.poll = undefined;
    }
  }

  /** Steam n'a toujours rien téléchargé après STUCK_MS (hors ligne, déconnecté, file d'attente) : on le dit une fois. */
  private warnIfStuck(id: string, value: number): void {
    const s = this.started.get(id);
    if (!s || s.warned || value > 0 || Date.now() - s.at < STUCK_MS) return;
    s.warned = true;
    const g = library.get(id);
    ui.toast(
      `Steam n'a pas encore commencé à télécharger ${g ? library.name(g) : 'le jeu'}. Vérifie qu'il est connecté et qu'aucun autre téléchargement ne passe avant.`,
      { error: true, gameId: id }
    );
  }

  /** Suit une installation, une désinstallation ou une mise à jour ouverte dans un launcher. */
  watchInstall(gameId: string): void {
    this.installs.set(gameId, installState(gameId));
  }

  /** Oublie une installation suivie dont l'état a déjà changé (désinstallation directe finie). */
  settleInstall(gameId: string): void {
    const was = this.installs.get(gameId);
    if (was !== undefined && installState(gameId) !== was) this.installs.delete(gameId);
  }

  /** Retour sur Hangar : rescan si une installation est en cours (au plus toutes les 30 s). */
  async checkInstalls(): Promise<void> {
    if (!this.installs.size || Date.now() - this.lastInstallScan < INSTALL_RESCAN_MS) return;
    this.lastInstallScan = Date.now();
    await rescan();
    for (const [id, was] of this.installs) if (installState(id) !== was) this.installs.delete(id);
  }

  /** Discord : le jeu en cours le plus récent, sinon le jeu web ouvert le plus récent, ou rien. */
  syncPresence(): void {
    if (!library.state.prefs.discordPresence) return;
    const id = this.current;
    const web = Object.keys(this.web).reduce<string | null>((a, b) => (a && this.web[a] >= this.web[b] ? a : b), null);
    if (id) api.setPresence(id, this.running[id]).catch(() => {});
    else api.setPresence(web && `web:${web}`, web ? this.web[web] : 0).catch(() => {});
  }

  webOpened(id: string): void {
    if (id in this.web) return; // fenêtre déjà ouverte, ramenée devant : même début
    this.web = { ...this.web, [id]: Date.now() };
    this.syncPresence();
  }

  webClosed(id: string): void {
    const { [id]: _gone, ...rest } = this.web;
    this.web = rest;
    this.syncPresence();
  }

  cancel(): void {
    clearTimeout(this.closeTimer);
    const p = this.launching?.prompt;
    if (p) api.answerLauncherPrompt(p.hwnd, false).catch(() => {});
    this.launching = null;
  }

  /** Question d'un launcher : posée dans l'écran de lancement, rouvert pour le dernier jeu lancé
   *  s'il s'est déjà fermé (Steam synchronise avant de répondre). Sinon sa boîte est montrée. */
  ask(p: LauncherPrompt): void {
    const l = this.launching;
    const last = this.lastLaunch;
    if (l && !l.prompt) {
      this.launching = { ...l, prompt: p, inLauncher: false };
    } else if (!l && last && Date.now() - last.at < PROMPT_MAX_MS && !this.running[last.gameId]) {
      clearTimeout(this.closeTimer);
      this.launching = { gameId: last.gameId, step: 1, key: ++this.seq, prompt: p, inLauncher: false };
      if (this.minimizedByUs) {
        this.minimizedByUs = false;
        api.win.restore().catch(() => {});
      }
    } else {
      api.answerLauncherPrompt(p.hwnd, true).catch(() => {});
    }
  }

  /** Réponse à la question : Annuler ferme la boîte de Steam, sinon elle est montrée pour le choix. */
  answer(show: boolean): void {
    const l = this.launching;
    if (!l?.prompt) return;
    if (!show) return this.cancel();
    api.answerLauncherPrompt(l.prompt.hwnd, true).catch((e) => ui.toast(String(e), { error: true, gameId: l.gameId }));
    this.launching = { ...l, prompt: undefined, inLauncher: true };
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
          this.launching = { ...l, step: 2, prompt: undefined, inLauncher: false };
          clearTimeout(this.closeTimer);
          this.closeTimer = setTimeout(() => this.closeOverlay(true), 700);
        }
        break;
      case 'session': {
        // Point d'étape d'une partie en cours. Après une veille, une nouvelle session
        // commence : le chronomètre repart de son début.
        library.recordSession(e.session);
        const shown = this.running[e.gameId];
        if (shown !== undefined && e.session.start > shown + 60_000) {
          this.running = { ...this.running, [e.gameId]: e.session.start };
          this.syncPresence();
        }
        break;
      }
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
    // Une question ou un choix dans Steam en cours : l'écran reste jusqu'à la réponse.
    if (!l || ((l.prompt || l.inLauncher) && l.step < 2)) return;
    clearTimeout(this.closeTimer);
    this.launching = null;
    if (!ok) return;
    const g = library.get(l.gameId);
    // Jeu pas encore détecté : son launcher (caché) attend peut-être l'utilisateur.
    const waiting = g && !this.isRunning(g.id) && g.store !== 'local' && g.store !== 'manual';
    if (g) ui.toast(`${library.name(g)} lancé`, { gameId: g.id, action: waiting ? showLauncher : undefined });
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
