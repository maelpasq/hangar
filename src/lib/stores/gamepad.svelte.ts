// Manette : l'API Gamepad du navigateur, traduite en actions (croix, A, B...) avec répétition.
// Le dernier écouteur abonné reçoit les actions (le mode manette passe devant l'app).

import { pressed, REPEATS, type PadAction } from '../util/pad';

export type { PadAction };

const REPEAT_DELAY = 380;
const REPEAT_EVERY = 110;

class Pad {
  connected = $state(false);
  private listeners: ((a: PadAction) => void)[] = [];
  /** Action enfoncée -> prochaine répétition (ms). */
  private held = new Map<PadAction, number>();
  private raf = 0;

  start(): () => void {
    const update = () => {
      this.connected = [...(navigator.getGamepads?.() ?? [])].some((p) => p?.connected);
      if (this.connected && !this.raf) this.raf = requestAnimationFrame(this.poll);
    };
    addEventListener('gamepadconnected', update);
    addEventListener('gamepaddisconnected', update);
    update();
    return () => {
      removeEventListener('gamepadconnected', update);
      removeEventListener('gamepaddisconnected', update);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    };
  }

  /** Abonne un écouteur ; renvoie la fonction de désabonnement. */
  listen(cb: (a: PadAction) => void): () => void {
    this.listeners.push(cb);
    return () => (this.listeners = this.listeners.filter((x) => x !== cb));
  }

  private poll = (t: number) => {
    const now = new Set<PadAction>();
    let any = false;
    for (const p of navigator.getGamepads?.() ?? []) {
      if (!p?.connected) continue;
      any = true;
      for (const a of pressed(p)) now.add(a);
    }
    // Hors focus, Chromium renvoie des manettes figées : on ignore.
    if (!document.hasFocus()) now.clear();
    for (const a of [...this.held.keys()]) if (!now.has(a)) this.held.delete(a);
    for (const a of now) {
      const next = this.held.get(a);
      if (next === undefined) {
        this.held.set(a, REPEATS.has(a) ? t + REPEAT_DELAY : Infinity);
        this.emit(a);
      } else if (t >= next) {
        this.held.set(a, t + REPEAT_EVERY);
        this.emit(a);
      }
    }
    this.connected = any;
    this.raf = any ? requestAnimationFrame(this.poll) : 0;
  };

  private emit(a: PadAction): void {
    this.listeners.at(-1)?.(a);
  }
}

export const gamepad = new Pad();
