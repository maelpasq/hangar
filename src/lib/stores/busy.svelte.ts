// Retour visuel des actions : un appel au backend qui part d'un geste de l'utilisateur (clic,
// touche, bouton de manette) et dure plus de DELAY ms affiche un chargement, sur le bouton
// cliqué quand il est encore là (attribut data-hg-busy, base.css) et en haut de la fenêtre
// (BusyBar). Aucun écran n'a à s'en occuper : api.ts passe chaque appel par `track`.

/** Sous ce délai, l'action paraît immédiate : rien ne s'affiche. */
const DELAY = 150;
/** Une fois affiché, le chargement reste au moins ce temps (pas de clignotement). */
const MIN_SHOW = 300;
/** Après un appel, la suite du gestionnaire a ce temps pour lancer le suivant (même action). */
const GRACE = 40;
/** Au-delà, un bouton est un bloc (ligne, tuile) : son contenu reste visible, atténué, sous le rond. */
const MAX_W = 420;
const MAX_H = 64;

interface Action {
  el: HTMLElement | null;
  /** Texte du bouton au moment du clic (s'il change, l'écran affiche déjà son propre état). */
  label: string;
  pending: number;
  shown: boolean;
  shownAt: number;
  timer: number;
  endTimer: number;
  /** Position mise en ligne pour placer le rond de chargement (rendue à la fin). */
  setPosition: boolean;
}

class Busy {
  /** Actions longues en cours (la barre du haut s'affiche au-dessus de 0). */
  count = $state(0);
  /** Action à laquelle se rattachent les appels qui partent maintenant. */
  private open: Action | null = null;
  private closeTimer = 0;

  /** Geste de l'utilisateur sur `el` (un bouton ou rien) : les appels qui suivent lui appartiennent. */
  gesture(el: Element | null): void {
    const button = el instanceof HTMLElement ? el.closest<HTMLElement>('button') : null;
    const label = button?.textContent ?? '';
    this.attach({ el: button, label, pending: 0, shown: false, shownAt: 0, timer: 0, endTimer: 0, setPosition: false }, 0);
  }

  /** Suit la promesse d'un appel au backend ; sans geste récent, elle passe telle quelle. */
  track<T>(p: Promise<T>): Promise<T> {
    const a = this.open;
    if (!a) return p;
    a.pending++;
    clearTimeout(a.endTimer);
    if (!a.shown && !a.timer) a.timer = window.setTimeout(() => this.show(a), DELAY);
    return p.finally(() => {
      a.pending--;
      // La suite du gestionnaire (après son `await`) peut enchaîner un autre appel.
      this.attach(a, GRACE);
      if (a.pending > 0) return;
      const left = a.shown ? MIN_SHOW - (performance.now() - a.shownAt) : 0;
      a.endTimer = window.setTimeout(() => a.pending === 0 && this.finish(a), Math.max(GRACE, left));
    });
  }

  private attach(a: Action, ms: number): void {
    this.open = a;
    clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      if (this.open === a) this.open = null;
    }, ms);
  }

  private show(a: Action): void {
    if (a.pending === 0 || a.shown) {
      a.timer = 0; // un appel enchaîné plus tard relancera l'attente
      return;
    }
    a.shown = true;
    a.shownAt = performance.now();
    this.count++;
    const el = a.el;
    if (!el?.isConnected || !el.offsetWidth) return;
    // L'écran montre déjà que ça charge : texte changé (« Connexion... ») ou icône qui tourne.
    if (el.textContent !== a.label || el.querySelector('.spin')) return;
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
      a.setPosition = true;
    }
    el.dataset.hgBusy = el.offsetWidth > MAX_W || el.offsetHeight > MAX_H ? 'block' : '';
  }

  private finish(a: Action): void {
    clearTimeout(a.timer);
    a.timer = 0;
    if (!a.shown) return;
    a.shown = false;
    this.count--;
    if (a.el) {
      delete a.el.dataset.hgBusy;
      if (a.setPosition) a.el.style.removeProperty('position');
    }
  }
}

export const busy = new Busy();

/** Écoute les gestes de l'utilisateur ; à appeler une fois au démarrage. */
let watching = false;
export function watchGestures(): void {
  if (watching) return;
  watching = true;
  document.addEventListener('click', (e) => busy.gesture(e.target as Element | null), true);
  document.addEventListener(
    'keydown',
    (e) => {
      // Taper dans un champ n'est pas une action (la recherche a son propre retour).
      const t = e.target as HTMLElement | null;
      if (e.key !== 'Enter' && t?.closest('input, textarea, [contenteditable]')) return;
      // Entrée ou Espace sur un bouton produisent aussi un clic, qui désignera le bouton.
      busy.gesture(null);
    },
    true
  );
}
