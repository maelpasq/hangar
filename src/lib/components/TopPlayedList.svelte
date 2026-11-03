<script lang="ts">
  // « Les plus joués » : lignes avec miniature, heures et barre relative.
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';
  import { hoursLabel } from '../util/format';
  import Cover from './Cover.svelte';

  let { games }: { games: Game[] } = $props();

  const max = $derived(Math.max(1, ...games.map((g) => library.totals(g.id).playMs)));
</script>

<div class="grid">
  {#each games as g, i (g.id)}
    {@const ms = library.totals(g.id).playMs}
    <button
      class="res rise"
      style:animation-delay="{Math.min(i, 24) * 35}ms"
      onclick={() => ui.open(g.id)}
      oncontextmenu={(e) => {
        e.preventDefault();
        ui.menu = { gameId: g.id, x: e.clientX, y: e.clientY };
      }}
    >
      <span class="thumb"><Cover game={g} showName={false} /></span>
      <span class="body">
        <span class="top"><span class="nm">{library.name(g)}</span><span class="h num">{hoursLabel(ms)}</span></span>
        <span class="track"><span class="fill" style:width="{Math.round((ms / max) * 100)}%"></span></span>
      </span>
    </button>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 14px;
  }

  .res {
    width: 100%;
    display: flex;
    align-items: center;
    text-align: left;
    padding: 12px;
    gap: 14px;
    border-radius: 16px;
    background: var(--surface-1);
    border: 1px solid rgba(255, 255, 255, 0.06);
    transition: background 0.12s;
  }

  .res:hover {
    background: var(--surface-3);
  }

  .thumb {
    position: relative;
    width: 46px;
    height: 66px;
    border-radius: 9px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .nm {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .h {
    color: var(--text-2);
    white-space: nowrap;
  }

  .track {
    height: 6px;
    border-radius: 6px;
    background: var(--surface-3);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: 6px;
    background: linear-gradient(90deg, var(--accent), #3dd6f5);
  }
</style>
