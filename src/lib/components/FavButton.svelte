<script lang="ts">
  // Étoile favori : petite (sur jaquette) ou grande (bouton fantôme sur image).
  import { library } from '../stores/library.svelte';
  import Icon from './Icon.svelte';

  let {
    gameId,
    variant = 'card',
    size = 50
  }: { gameId: string; variant?: 'card' | 'ghost'; size?: number } = $props();

  const on = $derived(library.isFav(gameId));
  const label = $derived(on ? 'Retirer des favoris' : 'Ajouter aux favoris');
</script>

{#if variant === 'card'}
  <button
    class="fav"
    class:on
    aria-label={label}
    aria-pressed={on}
    title={label}
    onclick={(e) => {
      e.stopPropagation();
      library.toggleFav(gameId);
    }}
  >
    <Icon name="star" size={15} />
  </button>
{:else}
  <button
    class="ghost big"
    class:on
    aria-label={label}
    aria-pressed={on}
    title={label}
    style:width="{size}px"
    style:height="{size}px"
    style:border-radius="{size > 50 ? 16 : 15}px"
    onclick={() => library.toggleFav(gameId)}
  >
    <Icon name="star" size={19} />
  </button>
{/if}

<style>
  .fav {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    opacity: 0;
    transition:
      opacity 0.2s,
      transform 0.2s;
    z-index: 2;
    color: #fff;
  }

  :global(.card:hover) .fav,
  :global(.card:focus-within) .fav,
  .fav.on {
    opacity: 1;
  }

  .fav:hover {
    transform: scale(1.12);
  }

  .fav.on :global(svg) {
    fill: var(--star);
    stroke: var(--star);
  }

  .big {
    display: grid;
    place-items: center;
    padding: 0;
  }
</style>
