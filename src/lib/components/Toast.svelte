<script lang="ts">
  // Pile de toasts en bas au centre ; un toast peut porter une rangée de petites infobulles
  // (ce que le bouton Actualiser a rafraîchi), qui apparaissent une à une.
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="host" role="status" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    {@const g = library.get(t.gameId)}
    <div class="group" class:leaving={t.leaving}>
      <div class="toast" class:error={t.error}>
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
      {#if t.chips?.length}
        <ul class="chips" aria-label="Éléments actualisés">
          {#each t.chips as c (c)}
            <li class="chip"><Icon name="check" size={13} />{c}</li>
          {/each}
        </ul>
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
    /* Sans largeur propre, `left: 50%` la limite à la moitié de la fenêtre (infobulles à la ligne). */
    width: max-content;
    max-width: calc(100vw - 40px);
    z-index: 95;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }

  .group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    transition:
      opacity 0.25s,
      transform 0.25s;
  }

  .group.leaving {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    max-width: min(560px, calc(100vw - 40px));
    padding: 10px 16px 10px 10px;
    background: rgb(var(--popover) / 0.9);
    backdrop-filter: blur(24px);
    border: 1px solid var(--border-3);
    border-radius: 14px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
    font-size: 13.5px;
    animation: hgToastIn 0.35s var(--ease) both;
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

  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    max-width: min(720px, calc(100vw - 40px));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chip {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 11px 0 9px;
    background: rgb(var(--popover) / 0.9);
    backdrop-filter: blur(24px);
    border: 1px solid var(--border-3);
    border-radius: 999px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
    font-size: 12px;
    font-weight: 550;
    color: var(--text-2);
    white-space: nowrap;
    animation: hgToastIn 0.3s var(--ease) both;
  }

  .chip :global(svg) {
    color: var(--accent-text);
    flex-shrink: 0;
  }

  .act:hover {
    background: var(--surface-3);
    color: var(--strong);
  }
</style>
