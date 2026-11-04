<script lang="ts">
  // Panneau de résultats de recherche (sous le champ).
  import { STORES } from '../stores-meta';
  import { library } from '../stores/library.svelte';
  import type { Game } from '../types';
  import { hoursLabel } from '../util/format';
  import Cover from './Cover.svelte';
  import StoreLogo from './StoreLogo.svelte';

  let {
    results,
    total,
    selected,
    onpick,
    onhover
  }: {
    results: Game[];
    total: number;
    selected: number;
    onpick: (g: Game, play: boolean) => void;
    onhover: (i: number) => void;
  } = $props();
</script>

<div class="panel" id="search-results" role="listbox" aria-label="Résultats de recherche">
  <p class="head" aria-live="polite">{total} résultat{total > 1 ? 's' : ''}</p>
  {#each results as g, i (g.id)}
    <button
      class="res"
      class:sel={i === selected}
      id="res-{i}"
      role="option"
      aria-selected={i === selected}
      tabindex="-1"
      onmousedown={(e) => e.preventDefault()}
      onmouseenter={() => onhover(i)}
      onclick={(e) => onpick(g, e.ctrlKey || e.metaKey)}
    >
      <span class="thumb"><Cover game={g} showName={false} eager /></span>
      <span class="txt">
        <span class="nm">{library.name(g)}</span>
        <span class="meta"
          ><StoreLogo store={g.store} size={12} />{STORES[g.store].label} · {hoursLabel(
            library.totals(g.id).playMs
          )}</span
        >
      </span>
      <span class="open">Ouvrir</span>
    </button>
  {/each}
  {#if !results.length}
    <p class="none">Aucun jeu ne correspond.</p>
  {/if}
</div>

<style>
  .panel {
    position: absolute;
    top: 48px;
    width: min(560px, 100%);
    padding: 8px;
    border-radius: 16px;
    background: rgba(22, 24, 32, 0.92);
    backdrop-filter: blur(30px) saturate(1.4);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.6);
    animation: hgIn 0.25s both;
    z-index: 30;
  }

  .head {
    padding: 6px 10px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted);
  }

  .res {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-radius: 11px;
    text-align: left;
    transition: background 0.12s;
  }

  /* Ligne choisie (souris ou flèches) : assez contrastée pour se voir au clavier. */
  .res.sel {
    background: rgba(255, 255, 255, 0.1);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
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
    flex: 1;
    min-width: 0;
  }

  .nm {
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }

  .open {
    font-size: 12px;
    color: var(--muted);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    padding: 3px 8px;
  }

  .none {
    padding: 18px 10px;
    color: var(--text-3);
    text-align: center;
  }
</style>
