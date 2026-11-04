<script lang="ts">
  // Logo d'un store, dans sa couleur, à côté de son nom (décoratif : le nom est toujours écrit).
  import { STORE_LOGOS } from '../store-logos';
  import { STORES } from '../stores-meta';
  import type { StoreId } from '../types';
  import Icon from './Icon.svelte';

  let { store, size = 14, glow = false }: { store: StoreId; size?: number; glow?: boolean } = $props();
</script>

<span class="slogo" class:glow style:color={STORES[store].color} aria-hidden="true">
  {#if STORE_LOGOS[store]}
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d={STORE_LOGOS[store]} /></svg>
  {:else}
    <Icon name={store === 'manual' ? 'plus' : 'folder'} {size} />
  {/if}
</span>

<style>
  .slogo {
    display: inline-flex;
    flex-shrink: 0;
    vertical-align: middle;
  }

  .glow {
    filter: drop-shadow(0 0 6px color-mix(in srgb, currentColor 45%, transparent));
  }
</style>
