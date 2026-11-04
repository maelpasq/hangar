<script lang="ts">
  // Puce de filtre (store) avec point de couleur et compteur.
  import type { Snippet } from 'svelte';
  import type { StoreId } from '../types';
  import StoreLogo from './StoreLogo.svelte';

  let {
    on = false,
    color,
    store,
    count,
    onclick,
    children
  }: { on?: boolean; color?: string; store?: StoreId; count?: number; onclick: () => void; children: Snippet } = $props();
</script>

<button class="chip" class:on aria-pressed={on} {onclick}>
  {#if store}<StoreLogo {store} size={13} />{:else if color}<span class="d" style:background={color}></span>{/if}
  {@render children()}
  {#if count !== undefined}<span class="c num">{count}</span>{/if}
</button>

<style>
  .chip {
    height: 34px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 999px;
    border: 1px solid rgb(var(--ink) / 0.09);
    background: rgb(var(--ink) / 0.03);
    font-size: 13px;
    color: var(--text-3);
    transition: all 0.18s;
  }

  .chip:hover {
    background: var(--surface-3);
    color: var(--strong);
  }

  .chip.on {
    background: var(--strong);
    color: var(--bg);
    border-color: var(--strong);
  }

  .d {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  /* sur la puce active (fond blanc), le logo passe en sombre pour rester lisible */
  .chip.on :global(.slogo) {
    color: var(--bg) !important;
  }

  .c {
    opacity: 0.6;
  }
</style>
