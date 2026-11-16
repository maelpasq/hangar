<script lang="ts">
  // Jeu d'un autre compte (vitrine, jeux en commun, invitation) : sa jaquette s'il est dans la
  // bibliothèque d'ici (aucun appel réseau de plus), sinon une jaquette générée à son nom.
  import { social } from '../stores/social.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { SocialGame } from '../types';
  import { generatedBackground } from '../util/color';
  import Cover from './Cover.svelte';

  let { game, meta = '' }: { game: SocialGame; meta?: string } = $props();

  const local = $derived(social.localGame(game));
</script>

{#snippet art()}
  <span class="art" style:background={local ? null : generatedBackground(game.id)}>
    {#if local}<Cover game={local} showName={false} />{:else}<span class="gname">{game.name}</span>{/if}
  </span>
  <span class="name ell">{game.name}</span>
  {#if meta}<span class="meta ell num">{meta}</span>{/if}
{/snippet}

{#if local}
  <button class="tile" onclick={() => ui.open(local.id)} aria-label="{game.name}, ouvrir la fiche">{@render art()}</button>
{:else}
  <div class="tile" title="Pas dans ta bibliothèque">{@render art()}</div>
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
