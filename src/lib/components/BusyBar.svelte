<script lang="ts">
  // Barre fine en haut de la fenêtre tant qu'une action de l'utilisateur charge (stores/busy).
  import { busy } from '../stores/busy.svelte';
</script>

<div class="sr-only" role="status">{busy.count > 0 ? 'Chargement en cours' : ''}</div>
{#if busy.count > 0}
  <div class="hg-busy-bar" aria-hidden="true"><span></span></div>
{/if}

<style>
  .hg-busy-bar {
    position: fixed;
    inset: 0 0 auto;
    height: 3px;
    z-index: 100;
    overflow: hidden;
    pointer-events: none;
    animation: hgFade 0.2s both;
  }

  .hg-busy-bar span {
    position: absolute;
    inset: 0;
    width: 40%;
    background: linear-gradient(90deg, transparent, var(--accent) 30%, var(--accent) 70%, transparent);
    animation: hgSlide 1.1s var(--ease) infinite;
  }

  :global(html:has(.hg-busy-bar)) {
    cursor: progress;
  }

  @media (prefers-reduced-motion: reduce) {
    .hg-busy-bar span {
      width: 100%;
      animation: none !important;
      opacity: 0.7;
    }
  }
</style>
