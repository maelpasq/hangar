<script lang="ts">
  // Carte « En jeu » de la barre latérale.
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import Cover from './Cover.svelte';

  let { rail = false }: { rail?: boolean } = $props();

  const game = $derived(library.get(runner.current));
</script>

{#if game}
  {@const time = runner.elapsed(game.id)}
  <button
    class="run"
    class:rail
    onclick={() => ui.open(game.id)}
    aria-label="En jeu : {library.name(game)}, {time}"
    title={rail ? `En jeu · ${time} · ${library.name(game)}` : undefined}
  >
    <span class="thumb"><Cover {game} showName={false} eager /></span>
    {#if !rail}
      <span class="txt">
        <span class="lbl num"><span class="pulse dotg"></span>En jeu · {time}</span>
        <span class="nm">{library.name(game)}</span>
      </span>
    {:else}
      <span class="pulse dotg abs"></span>
    {/if}
  </button>
{/if}

<style>
  .run {
    position: relative;
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 10px;
    border-radius: 14px;
    background: rgba(52, 211, 153, 0.08);
    border: 1px solid rgba(52, 211, 153, 0.25);
    text-align: left;
    animation: hgIn 0.5s both;
    width: 100%;
  }

  .run.rail {
    justify-content: center;
    padding: 6px;
  }

  .thumb {
    position: relative;
    width: 34px;
    height: 48px;
    border-radius: 7px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .txt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .lbl {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 600;
    color: var(--success-text);
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .dotg {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
    flex-shrink: 0;
  }

  .abs {
    position: absolute;
    top: 6px;
    right: 6px;
  }

  .nm {
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
