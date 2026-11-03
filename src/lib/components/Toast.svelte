<script lang="ts">
  // Pile de toasts en bas au centre.
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="host" role="status" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    {@const g = library.get(t.gameId)}
    <div class="toast" class:error={t.error} class:leaving={t.leaving}>
      {#if t.error}
        <span class="ic"><Icon name="alert" size={18} /></span>
      {:else if g}
        <span class="thumb"><Cover game={g} showName={false} eager /></span>
      {/if}
      <span class="txt">{t.text}</span>
      {#if t.action}
        <button
          class="act"
          onclick={() => {
            t.action?.run();
            ui.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .host {
    position: fixed;
    left: 50%;
    bottom: 26px;
    transform: translateX(-50%);
    z-index: 95;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    max-width: min(560px, calc(100vw - 40px));
    padding: 10px 16px 10px 10px;
    background: rgba(24, 26, 34, 0.9);
    backdrop-filter: blur(24px);
    border: 1px solid var(--border-3);
    border-radius: 14px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
    font-size: 13.5px;
    animation: hgToastIn 0.35s var(--ease) both;
    transition:
      opacity 0.25s,
      transform 0.25s;
  }

  .toast.leaving {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
  }

  .toast.error {
    border-color: rgba(229, 72, 77, 0.5);
    padding-left: 14px;
  }

  .thumb {
    position: relative;
    width: 28px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .ic {
    color: var(--danger-text);
    display: grid;
  }

  .txt {
    line-height: 1.35;
  }

  .act {
    margin-left: 4px;
    font-weight: 650;
    color: var(--accent-text);
    padding: 4px 8px;
    border-radius: 8px;
  }

  .act:hover {
    background: var(--surface-3);
    color: #fff;
  }
</style>
