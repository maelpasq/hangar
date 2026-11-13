<script lang="ts">
  // Hangar MC pas encore ouvert : le bouton de la barre latérale présente ce qui arrive, dans le
  // style pixel de Hangar MC (Pixelify Sans, coins crantés, biseaux, logo en pixels).
  import '@fontsource-variable/pixelify-sans';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { ui } from '../stores/ui.svelte';

  const close = () => {
    ui.modal = null;
  };
  // Logo de Hangar MC : l'arche et l'étoile de Hangar en pixels (17 x 13).
  const MARK =
    'M7 0h3v1h-3zM5 1h7v1h-7zM3 2h11v1h-11zM2 3h6v1h-6zM9 3h6v1h-6zM1 4h5v1h-5zM11 4h5v1h-5zM0 5h5v1h-5zM12 5h5v1h-5zM0 6h3v1h-3zM8 6h1v1h-1zM14 6h3v1h-3zM0 7h3v1h-3zM7 7h3v1h-3zM14 7h3v1h-3zM0 8h3v1h-3zM5 8h7v1h-7zM14 8h3v1h-3zM0 9h3v1h-3zM7 9h3v1h-3zM14 9h3v1h-3zM0 10h3v1h-3zM8 10h1v1h-1zM14 10h3v1h-3zM0 11h3v1h-3zM14 11h3v1h-3zM0 12h2v1h-2zM15 12h2v1h-2z';
</script>

<Modal title="Hangar MC arrive bientôt" class="mcsoon" onclose={close}>
  <div class="hero px slot">
    <span class="logo">
      <svg width="30" height="30" viewBox="0 -2 17 17" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">
        <path d={MARK} />
      </svg>
    </span>
    <span class="name">Hangar MC</span>
    <span class="tag"><Icon name="alert" size={12} />Bientôt</span>
  </div>
  <p class="txt">
    Le client Minecraft de Hangar : toutes les versions du jeu, Fabric intégré et nos propres modules, lancées en un clic
    sans le launcher officiel.
  </p>
  <p class="txt">
    Il est en cours de finition. Dès qu'il est prêt, une mise à jour de Hangar débloque cet écran, sans rien à faire de
    ton côté.
  </p>
  {#snippet footer()}
    <button
      class="btn primary px pxbtn autofocus"
      onclick={() => {
        close();
        ui.home();
      }}>Retour à l'accueil</button
    >
  {/snippet}
</Modal>

<style>
  /* Fenêtre de Hangar en pixels : coins crantés et biseau, titre en Pixelify Sans. */
  :global(.back .box.mcsoon) {
    --px: 3px;
    --px-hi: rgb(255 255 255 / 0.13);
    --px-lo: rgb(0 0 0 / 0.34);
    border: 0;
    border-radius: 0;
    clip-path: polygon(
      0 var(--px), var(--px) var(--px), var(--px) 0, calc(100% - var(--px)) 0, calc(100% - var(--px)) var(--px),
      100% var(--px), 100% calc(100% - var(--px)), calc(100% - var(--px)) calc(100% - var(--px)),
      calc(100% - var(--px)) 100%, var(--px) 100%, var(--px) calc(100% - var(--px)), 0 calc(100% - var(--px))
    );
    box-shadow:
      inset var(--px) var(--px) 0 var(--px-hi),
      inset calc(var(--px) * -1) calc(var(--px) * -1) 0 var(--px-lo);
  }

  :global(.back .box.mcsoon h2) {
    font-family: 'Pixelify Sans Variable', var(--font);
    font-size: 22px;
    letter-spacing: 0;
  }

  .px {
    border-radius: 0;
    clip-path: polygon(
      0 var(--px), var(--px) var(--px), var(--px) 0, calc(100% - var(--px)) 0, calc(100% - var(--px)) var(--px),
      100% var(--px), 100% calc(100% - var(--px)), calc(100% - var(--px)) calc(100% - var(--px)),
      calc(100% - var(--px)) 100%, var(--px) 100%, var(--px) calc(100% - var(--px)), 0 calc(100% - var(--px))
    );
  }

  /* Creux, comme une case d'inventaire. */
  .slot {
    background: rgb(0 0 0 / 0.22);
    box-shadow:
      inset var(--px) var(--px) 0 var(--px-lo),
      inset calc(var(--px) * -1) calc(var(--px) * -1) 0 var(--px-hi);
  }

  .hero {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    margin-bottom: 4px;
  }

  .logo {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    color: var(--strong);
    background: rgb(255 255 255 / 0.05);
  }

  .name {
    flex: 1;
    font-family: 'Pixelify Sans Variable', var(--font);
    font-size: 19px;
    font-weight: 600;
    color: var(--strong);
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px 2px;
    font-family: 'Pixelify Sans Variable', var(--font);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--star);
    background: color-mix(in srgb, var(--star) 14%, transparent);
  }

  /* Bouton biseauté, enfoncé d'un pixel au clic ; le focus passe à l'intérieur du crantage. */
  .pxbtn {
    border: 0;
    font-family: 'Pixelify Sans Variable', var(--font);
    font-size: 15px;
    font-weight: 600;
    box-shadow:
      inset var(--px) var(--px) 0 var(--px-hi),
      inset 0 calc(var(--px) * -2) 0 var(--px-lo);
    transition:
      background 0.15s,
      filter 0.15s,
      transform 0.08s steps(1);
  }

  .pxbtn:active {
    transform: translateY(var(--px));
    box-shadow:
      inset var(--px) var(--px) 0 var(--px-lo),
      inset 0 calc(var(--px) * -1) 0 var(--px-hi);
  }

  .pxbtn:focus-visible {
    outline: none;
    box-shadow:
      inset 0 0 0 var(--px) var(--text),
      inset 0 0 0 calc(var(--px) * 2) var(--accent);
  }

  @media (prefers-reduced-motion: reduce) {
    .pxbtn,
    .pxbtn:active {
      transition: none;
      transform: none;
    }
  }
</style>
