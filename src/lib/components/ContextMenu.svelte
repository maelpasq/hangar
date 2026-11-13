<script lang="ts">
  // Menu contextuel d'un jeu (clic droit).
  import { onMount } from 'svelte';
  import { hideGame, openFolder, uninstallGame, updateGame } from '../actions';
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  let { gameId, x, y }: { gameId: string; x: number; y: number } = $props();

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
    menu.querySelector<HTMLElement>('button')?.focus();
  });

  const game = $derived(library.get(gameId));
  const fav = $derived(library.isFav(gameId));

  const items = $derived<{ label: string; icon: IconName; run: () => void; danger?: boolean; disabled?: boolean }[]>([
    game?.notInstalled
      ? { label: 'Installer', icon: 'download', run: () => runner.play(gameId) }
      : { label: runner.isRunning(gameId) ? 'En cours' : 'Jouer', icon: 'play', run: () => runner.play(gameId) },
    {
      label: fav ? 'Retirer des favoris' : 'Ajouter aux favoris',
      icon: 'star',
      run: () => library.toggleFav(gameId)
    },
    { label: 'Collections', icon: 'layers', run: () => { ui.modal = { kind: 'collections', gameId }; } },
    { label: 'Renommer', icon: 'edit', run: () => { ui.modal = { kind: 'rename', gameId }; } },
    { label: 'Changer la jaquette', icon: 'image', run: () => { ui.modal = { kind: 'cover', gameId }; } },
    { label: 'Ouvrir le dossier', icon: 'folder', run: () => openFolder(gameId), disabled: !game?.installDir },
    ...(game && !game.notInstalled
      ? [
          { label: game.updatePending ? 'Mettre à jour' : 'Mises à jour', icon: 'refresh' as const, run: () => updateGame(gameId) },
          { label: 'Désinstaller', icon: 'package' as const, run: () => uninstallGame(gameId) }
        ]
      : []),
    { label: 'Masquer', icon: 'eyeOff', run: () => hideGame(gameId), danger: true }
  ]);

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
  aria-label={game ? library.name(game) : 'Menu'}
  style:left="{pos.left}px"
  style:top="{pos.top}px"
  {onkeydown}
>
  {#each items as it (it.label)}
    <button
      role="menuitem"
      class:danger={it.danger}
      disabled={it.disabled}
      onclick={() => {
        // L'action d'abord : fermer le menu rend `gameId` indisponible.
        it.run();
        ui.menu = null;
      }}
    >
      <Icon name={it.icon} size={16} />{it.label}
    </button>
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
