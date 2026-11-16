<script lang="ts">
  // Jeu d'un autre compte (vitrine, jeux en commun, invitation) : sa jaquette s'il est dans la
  // bibliothèque d'ici, sinon celle du CDN Steam (par son ID Steam ou son nom), sinon une
  // jaquette générée à son nom.
  import { art, visible } from '../art.svelte';
  import { social } from '../stores/social.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { SocialGame } from '../types';
  import { generatedBackground } from '../util/color';
  import BlurImage from './BlurImage.svelte';
  import Cover from './Cover.svelte';

  let { game, meta = '' }: { game: SocialGame; meta?: string } = $props();

  const local = $derived(social.localGame(game));
  let seen = $state(false);
  let loaded = $state(false);
  const res = $derived(!local && seen ? art.socialCover(game) : undefined);
</script>

{#snippet body()}
  <span class="art" style:background={local || res ? null : generatedBackground(game.id)} use:visible={() => (seen = true)}>
    {#if local}
      <Cover game={local} showName={false} />
    {:else if res}
      {#if res.landscape}<BlurImage class="blur" src={res.src} brightness={0.7} />{/if}
      <img
        class={res.landscape ? 'land' : 'full'}
        class:on={loaded}
        src={res.src}
        alt=""
        loading="lazy"
        decoding="async"
        onload={() => (loaded = true)}
        onerror={() => art.fail(art.socialKey(game))}
      />
    {:else}
      <span class="gname">{game.name}</span>
    {/if}
    {#if !local && (res === undefined || (res && !loaded))}<span class="shimmer shimmer-fx" aria-hidden="true"></span>{/if}
  </span>
  <span class="name ell">{game.name}</span>
  {#if meta}<span class="meta ell num">{meta}</span>{/if}
{/snippet}

{#if local}
  <button class="tile" onclick={() => ui.open(local.id)} aria-label="{game.name}, ouvrir la fiche">{@render body()}</button>
{:else}
  <div class="tile" title="Pas dans ta bibliothèque">{@render body()}</div>
{/if}

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    text-align: left;
    border-radius: 12px;
  }

  .art {
    position: relative;
    display: block;
    aspect-ratio: 2 / 3;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
    transition: transform 0.25s var(--ease);
  }

  button.tile:hover .art,
  button.tile:focus-visible .art {
    transform: translateY(-3px);
  }

  .full {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.4s ease;
  }

  .art :global(.blur) {
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

  .gname {
    position: absolute;
    inset: auto 10px 10px;
    font-weight: 700;
    font-size: 13px;
    line-height: 1.2;
    color: #fff;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .name {
    font-size: 13px;
    font-weight: 600;
  }

  .meta {
    margin-top: -4px;
    font-size: 12px;
    color: var(--muted);
  }
</style>
