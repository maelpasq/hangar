<script lang="ts">
  // Jaquette d'un jeu sans image : dégradé stable + nom + icône de l'exe éventuelle.
  import { art } from '../art.svelte';
  import { library } from '../stores/library.svelte';
  import type { Game } from '../types';
  import { generatedBackground } from '../util/color';

  let {
    game,
    fontSize = 22,
    padding = 16,
    showName = true
  }: { game: Game; fontSize?: number; padding?: number; showName?: boolean } = $props();

  const icon = $derived(showName ? art.icon(game) : null);
</script>

<span class="gen" style:background={generatedBackground(game.id)} style:padding="{padding}px">
  {#if icon}
    <span class="badge"><img src={icon} alt="" decoding="async" /></span>
  {/if}
  {#if showName}
    <span class="name" style:font-size="{fontSize}px">{library.name(game)}</span>
  {/if}
</span>

<style>
  .gen {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    text-align: left;
    color: #fff;
  }

  .name {
    font-weight: 800;
    letter-spacing: -0.4px;
    line-height: 1.05;
    overflow-wrap: anywhere;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
    /* Nom très long : 5 lignes au plus, puis ellipse (le haut reste libre pour l'icône). */
    display: -webkit-box;
    -webkit-line-clamp: 5;
    line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
    padding-bottom: 0.06em;
  }

  .badge {
    position: absolute;
    top: 12px;
    left: 12px;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .badge img {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
</style>
