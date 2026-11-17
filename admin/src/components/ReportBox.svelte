<script lang="ts">
  // Encart d'un signalement : motif en rouge, auteur et date, précision, extrait cité.
  import type { Snippet } from 'svelte';
  import { splitReason } from '../moderation';

  let {
    reason,
    excerpt,
    meta,
    children
  }: { reason: string; excerpt: string | null; meta: Snippet; children?: Snippet } = $props();

  const r = $derived(splitReason(reason));
</script>

<div class="report">
  <div class="line">
    <span class="motif">{r.label}</span>
    <span class="meta">{@render meta()}</span>
    {#if children}<span class="end">{@render children()}</span>{/if}
  </div>
  {#if r.detail}<p class="detail">{r.detail}</p>{/if}
  {#if excerpt}<blockquote>« {excerpt} »</blockquote>{/if}
</div>

<style>
  .report {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger) 22%, transparent);
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .motif {
    color: var(--danger-text);
    font-weight: 600;
  }

  .meta {
    color: var(--text-3);
  }

  .end {
    margin-left: auto;
    display: inline-flex;
    gap: 8px;
  }

  .detail {
    font-size: 13.5px;
    color: var(--text-soft);
  }

  blockquote {
    margin: 0;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgb(var(--glass) / 0.36);
    font-size: 13px;
    color: var(--text-2);
    font-style: italic;
  }
</style>
