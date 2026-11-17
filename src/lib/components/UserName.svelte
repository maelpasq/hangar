<script lang="ts">
  // Pseudo coupé par « ... » s'il est trop long, la pastille certifiée toujours visible à sa suite.
  // Prend la police de son parent.
  import CertifiedMark from './CertifiedMark.svelte';

  let { name, certified = false, size = 14 }: { name: string; certified?: boolean; size?: number } = $props();
</script>

<span class="un"><span class="txt">{name}</span>{#if certified}<CertifiedMark {size} />{/if}</span>

<style>
  .un {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .txt {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
