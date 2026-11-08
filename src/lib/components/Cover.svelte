<script lang="ts">
  // Image d'une jaquette 2:3 : chargement à l'approche de l'écran, fondu, repli généré.
  import { art, visible } from '../art.svelte';
  import type { Game } from '../types';
  import BlurImage from './BlurImage.svelte';
  import GeneratedCover from './GeneratedCover.svelte';

  let {
    game,
    fontSize = 22,
    padding = 16,
    showName = true,
    eager = false,
    alt = ''
  }: {
    game: Game;
    fontSize?: number;
    padding?: number;
    showName?: boolean;
    eager?: boolean;
    alt?: string;
  } = $props();

  let seen = $state(false);
  let loaded = $state(false);
  const key = $derived(art.coverKey(game));
  const res = $derived(seen || eager ? art.cover(game) : undefined);

  $effect(() => {
    void key;
    loaded = false;
  });

  function onError() {
    if (key) art.fail(key);
  }
</script>

<span class="img" use:visible={() => (seen = true)}>
  {#if res === null}
    <GeneratedCover {game} {fontSize} {padding} {showName} />
  {:else if res}
    {#if res.landscape}
      <BlurImage class="blur" src={res.src} brightness={0.7} />
      <img
        class="land"
        class:on={loaded}
        src={res.src}
        {alt}
        decoding="async"
        onload={() => (loaded = true)}
        onerror={onError}
      />
    {:else}
      <img
        class="full"
        class:on={loaded}
        src={res.src}
        {alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onload={() => (loaded = true)}
        onerror={onError}
      />
    {/if}
  {/if}
  {#if res === undefined || (res && !loaded)}
    <span class="shimmer shimmer-fx" aria-hidden="true"></span>
  {/if}
</span>

<style>
  .img {
    position: absolute;
    inset: 0;
    display: block;
    overflow: hidden;
    border-radius: inherit;
    background: var(--cover-bg);
  }

  img {
    display: block;
  }

  .full {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition:
      opacity 0.4s ease,
      transform 0.6s var(--ease);
  }

  .img :global(.blur) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .land {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    width: 100%;
    transform: translateY(-50%);
    opacity: 0;
    transition: opacity 0.4s ease;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  .on {
    opacity: 1;
  }

  .shimmer {
    position: absolute;
    inset: 0;
    background: var(--cover-bg);
  }
</style>
