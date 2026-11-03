<script lang="ts">
  // Puce de filtre (store) avec point de couleur et compteur.
  import type { Snippet } from 'svelte';

  let {
    on = false,
    color,
    count,
    onclick,
    children
  }: { on?: boolean; color?: string; count?: number; onclick: () => void; children: Snippet } = $props();
</script>

<button class="chip" class:on aria-pressed={on} {onclick}>
  {#if color}<span class="d" style:background={color}></span>{/if}
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
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: rgba(255, 255, 255, 0.03);
    font-size: 13px;
    color: var(--text-3);
    transition: all 0.18s;
  }

  .chip:hover {
    background: var(--surface-3);
    color: #fff;
  }

  .chip.on {
    background: #fff;
    color: #0a0b0f;
    border-color: #fff;
  }

  .d {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .c {
    opacity: 0.6;
  }
</style>
