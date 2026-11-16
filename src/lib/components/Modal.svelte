<script lang="ts">
  // Fenêtre modale : fond flouté, Échap ou clic à côté pour fermer, focus piégé.
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    title,
    onclose,
    width = 460,
    maxHeight,
    class: cls = '',
    children,
    footer,
    hero
  }: {
    title: string;
    onclose: () => void;
    width?: number;
    /** Hauteur maximale en pixels (sinon presque tout l'écran) ; seul le contenu défile. */
    maxHeight?: number;
    class?: string;
    children: Snippet;
    footer?: Snippet;
    /** Bandeau pleine largeur au-dessus du titre (illustration). */
    hero?: Snippet;
  } = $props();

  let box: HTMLDivElement;
  let body: HTMLDivElement;
  const id = `m${Math.random().toString(36).slice(2, 8)}`;

  const FOCUSABLE = 'button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])';

  onMount(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = box.querySelector<HTMLElement>('input, .autofocus') ?? box.querySelector<HTMLElement>(FOCUSABLE);
    // Sans défilement : un bouton du pied ne doit pas faire descendre le contenu.
    first?.focus({ preventScroll: true });
    body.scrollTop = 0;
    return () => prev?.focus?.();
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    } else if (e.key === 'Tab') {
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        items.at(-1)!.focus();
      } else if (!e.shiftKey && i === items.length - 1) {
        e.preventDefault();
        items[0].focus();
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="back"
  onmousedown={(e) => {
    if (e.target === e.currentTarget) onclose();
  }}
  {onkeydown}
>
  <div
    class="box {cls}"
    bind:this={box}
    role="dialog"
    aria-modal="true"
    aria-labelledby={id}
    style:width="min({width}px, calc(100vw - 40px))"
    style:max-height={maxHeight ? `min(${maxHeight}px, calc(100vh - 60px))` : null}
  >
    {#if hero}{@render hero()}{/if}
    <div class="head">
      <h2 {id}>{title}</h2>
      <button class="ibtn close" aria-label="Fermer" onclick={onclose}><Icon name="x" size={16} /></button>
    </div>
    <div class="body" bind:this={body}>{@render children()}</div>
    {#if footer}<div class="foot">{@render footer()}</div>{/if}
  </div>
</div>

<style>
  .back {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    background: rgba(5, 6, 9, 0.55);
    backdrop-filter: blur(8px);
    animation: hgFade 0.18s both;
  }

  .box {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 60px);
    overflow: hidden;
    background: var(--panel);
    border: 1px solid var(--border-2);
    border-radius: var(--r-section);
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.7);
    animation: hgPopIn 0.22s var(--ease) both;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    padding: 20px 16px 6px 24px;
  }

  h2 {
    flex: 1;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.2px;
  }

  .close {
    width: 32px;
    height: 32px;
  }

  .body {
    min-height: 0;
    overflow: auto;
    padding: 10px 24px 8px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .body > :global(*) {
    flex-shrink: 0;
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    flex-shrink: 0;
    padding: 14px 24px 22px;
  }
</style>
