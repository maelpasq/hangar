<script lang="ts">
  // En-tête de page : titre, sous-titre, actions à droite (alignées en bas, qui passent à la ligne).
  import type { Snippet } from 'svelte';

  let { title, sub, actions }: { title: string; sub?: string; actions?: Snippet } = $props();
</script>

<header>
  <div>
    <h1>{title}</h1>
    {#if sub}<p>{sub}</p>{/if}
  </div>
  {#if actions}
    <div class="actions">{@render actions()}</div>
  {/if}
</header>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px 24px;
  }

  header > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  h1 {
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.6px;
    color: var(--strong);
  }

  p {
    font-size: 14px;
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
</style>
