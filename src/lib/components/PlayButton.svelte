<script lang="ts">
  // Bouton Jouer couleur d'accent (« Installer » pour un jeu non installé).
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import Icon from './Icon.svelte';

  let { gameId, large = false, label = 'Jouer' }: { gameId: string; large?: boolean; label?: string } = $props();

  const toInstall = $derived(!!library.get(gameId)?.notInstalled);
</script>

<button class="play" class:large onclick={() => runner.play(gameId)}>
  {#if toInstall}
    <Icon name="download" size={large ? 18 : 17} stroke={2.2} />Installer
  {:else}
    <Icon name="play" size={large ? 17 : 16} />{label}
  {/if}
</button>

<style>
  .play {
    height: 50px;
    padding: 0 28px 0 22px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border-radius: 15px;
    background: var(--accent);
    color: #fff;
    font-weight: 650;
    font-size: 15.5px;
    box-shadow:
      0 12px 34px -10px var(--accent-shadow),
      inset 0 1px 0 rgba(255, 255, 255, 0.25);
    transition:
      transform 0.25s var(--ease),
      filter 0.2s,
      box-shadow 0.25s;
  }

  .play.large {
    height: 52px;
    padding: 0 34px 0 26px;
    gap: 11px;
    border-radius: 16px;
    font-size: 16px;
  }

  .play:hover {
    transform: translateY(-2px);
    filter: brightness(1.1);
    box-shadow:
      0 16px 40px -10px color-mix(in srgb, var(--accent) 90%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.25);
  }

  .play:active {
    transform: scale(0.97);
  }
</style>
