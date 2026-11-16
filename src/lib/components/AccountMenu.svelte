<script lang="ts">
  // Menu du compte Hangar, ouvert par le bouton du compte en bas de la barre latérale.
  import { onMount } from 'svelte';
  import { cloud } from '../stores/cloud.svelte';
  import { presenceLabel, social } from '../stores/social.svelte';
  import { ui } from '../stores/ui.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  let { anchor, onclose }: { anchor: HTMLElement; onclose: (refocus: boolean) => void } = $props();

  let menu: HTMLDivElement;
  let pos = $state({ left: 0, bottom: 0 });

  // Au-dessus du bouton, aligné sur sa gauche (positions relatives à la barre latérale).
  $effect(() => {
    const parent = anchor.offsetParent as HTMLElement | null;
    pos = {
      left: anchor.offsetLeft,
      bottom: (parent?.clientHeight ?? 0) - anchor.offsetTop + 6
    };
    menu.querySelector<HTMLElement>('button')?.focus();
  });

  type Item = { label: string; icon: IconName; run: () => void; danger?: boolean };
  const items: Item[] = [
    { label: 'Voir mon profil', icon: 'user', run: () => social.me && ui.profile(social.me) },
    { label: 'Paramètres du compte', icon: 'sliders', run: () => ui.settings('account') },
    { label: 'Se déconnecter', icon: 'logout', run: () => cloud.logout(), danger: true }
  ];

  onMount(() => {
    // Un clic sur le bouton du compte est laissé au bouton (il referme le menu lui-même).
    const close = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node) || (!menu.contains(t) && !anchor.contains(t))) onclose(false);
    };
    // En capture : un élément de la page qui arrête l'événement n'empêche pas la fermeture.
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', close, true);
      window.addEventListener('blur', close);
    });
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('blur', close);
    };
  });

  function onkeydown(e: KeyboardEvent) {
    const btns = [...menu.querySelectorAll<HTMLButtonElement>('button')];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      onclose(true);
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
  id="account-menu"
  bind:this={menu}
  role="menu"
  tabindex="-1"
  aria-label="Compte Hangar"
  style:left="{pos.left}px"
  style:bottom="{pos.bottom}px"
  {onkeydown}
>
  <div class="who">
    <span class="avatar" aria-hidden="true">
      {#if cloud.avatar}<img src={cloud.avatar} alt="" />{:else}{cloud.initial}{/if}
    </span>
    <span class="id">
      <span class="name ell">{cloud.name}</span>
      <span class="state ell">{presenceLabel(social.myPresence)}</span>
    </span>
  </div>
  <div class="sep" role="separator"></div>
  {#each items as it, i (it.label)}
    {#if i === items.length - 1}<div class="sep" role="separator"></div>{/if}
    <button
      role="menuitem"
      class:danger={it.danger}
      onclick={() => {
        onclose(false);
        it.run();
      }}
    >
      <Icon name={it.icon} size={16} />{it.label}
    </button>
  {/each}
</div>

<style>
  .menu {
    position: absolute;
    z-index: 10;
    width: 232px;
    padding: 6px;
    background: rgb(var(--popover) / 0.86);
    backdrop-filter: blur(30px) saturate(1.4);
    border: 1px solid var(--border-3);
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
    animation: hgPopIn 0.16s var(--ease) both;
    transform-origin: bottom left;
  }

  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 10px;
  }

  .avatar {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .id {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .name {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--strong);
  }

  .state {
    font-size: 12px;
    color: var(--muted);
  }

  .ell {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--border-1);
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

  button:hover,
  button:focus-visible {
    background: var(--surface-3);
    color: var(--strong);
    outline: none;
  }

  .danger {
    color: var(--danger-text);
  }

  .danger:hover,
  .danger:focus-visible {
    color: var(--danger-text);
    background: rgba(229, 72, 77, 0.12);
  }
</style>
