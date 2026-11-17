<script lang="ts">
  // Menu contextuel (clic droit) : un jeu, ou toute liste d'actions (src/lib/menus.ts).
  import { onMount } from 'svelte';
  import { gameItems } from '../menus';
  import { library } from '../stores/library.svelte';
  import { ui, type MenuItem, type MenuTarget } from '../stores/ui.svelte';
  import Icon from './Icon.svelte';

  let { target, x, y }: { target: MenuTarget; x: number; y: number } = $props();

  let menu: HTMLDivElement;
  let pos = $state({ left: -9999, top: -9999 });

  // Position recalculée à chaque ouverture pour rester dans la fenêtre.
  $effect(() => {
    // offsetWidth/Height : taille réelle, sans l'échelle de l'animation d'ouverture.
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    pos = {
      left: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - h - 8))
    };
    menu.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  });

  const label = $derived.by(() => {
    if ('label' in target) return target.label;
    const g = library.get(target.gameId);
    return g ? library.name(g) : 'Menu';
  });

  // Séparateurs nettoyés : jamais en tête, en fin ni deux de suite.
  const items = $derived.by(() => {
    const raw: MenuItem[] = 'gameId' in target ? gameItems(target.gameId) : target.items();
    const out: MenuItem[] = [];
    for (const it of raw) {
      if (it === 'sep' && (!out.length || out.at(-1) === 'sep')) continue;
      out.push(it);
    }
    if (out.at(-1) === 'sep') out.pop();
    return out;
  });

  // Plus rien à proposer (jeu masqué, ami retiré...) : le menu se ferme.
  $effect(() => {
    if (!items.length) ui.menu = null;
  });

  onMount(() => {
    // La cible est la fenêtre elle-même pour « blur » : ce n'est pas un nœud, on ferme.
    const close = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node) || !menu.contains(t)) ui.menu = null;
    };
    const t = setTimeout(() => {
      window.addEventListener('mousedown', close);
      window.addEventListener('wheel', close, { passive: true });
      window.addEventListener('blur', close);
    });
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', close);
      window.removeEventListener('wheel', close);
      window.removeEventListener('blur', close);
    };
  });

  function onkeydown(e: KeyboardEvent) {
    const btns = [...menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      // Sinon App voit Échap sans menu ouvert et quitte la fiche du jeu.
      e.stopPropagation();
      ui.menu = null;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      btns[(i + 1) % btns.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      btns[(i - 1 + btns.length) % btns.length]?.focus();
    }
  }
</script>

<div
  class="menu"
  bind:this={menu}
  role="menu"
  tabindex="-1"
  aria-label={label}
  style:left="{pos.left}px"
  style:top="{pos.top}px"
  {onkeydown}
>
  {#each items as it, i (it === 'sep' ? `sep${i}` : it.label)}
    {#if it === 'sep'}
      <div class="sep" role="separator"></div>
    {:else}
    <button
      role="menuitem"
      class:danger={it.danger}
      disabled={it.disabled}
      onclick={() => {
        // Le menu se ferme d'abord : l'action peut en ouvrir un autre ou une modale.
        ui.menu = null;
        it.run();
      }}
    >
      <Icon name={it.icon} size={16} />{it.label}
    </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 90;
    min-width: 220px;
    padding: 6px;
    background: rgb(var(--popover) / 0.86);
    backdrop-filter: blur(30px) saturate(1.4);
    border: 1px solid var(--border-3);
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
    animation: hgPopIn 0.16s var(--ease) both;
    transform-origin: top left;
  }

  button {
    width: 100%;
    height: 36px;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 0 12px;
    border-radius: 9px;
    font-size: 13.5px;
    color: var(--text-soft);
    text-align: left;
  }

  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--surface-3);
    color: var(--strong);
    outline: none;
  }

  .sep {
    height: 1px;
    margin: 5px 8px;
    background: var(--border-3);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .danger {
    color: var(--danger-text);
  }

  .danger:hover:not(:disabled),
  .danger:focus-visible {
    color: var(--danger-text);
    background: rgba(229, 72, 77, 0.12);
  }
</style>
