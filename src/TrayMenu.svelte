<script lang="ts">
  // Menu de l'icône (clic gauche) : petite fenêtre Hangar avec les jeux récents.
  // Elle se cache dès qu'elle perd le focus (géré par Rust).
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import Icon from './lib/components/Icon.svelte';
  import Logo from './lib/components/Logo.svelte';
  import { hue } from './lib/util/color';
  import type { TrayState } from './lib/types';

  let data = $state<TrayState>({ games: [], theme: 'dark', accent: '#7c6cff' });
  let list: HTMLDivElement;

  async function refresh() {
    try {
      data = await api.trayState();
    } catch {
      /* état vide : seulement Ouvrir / Quitter */
    }
    const root = document.documentElement;
    const light = data.theme === 'light' || (data.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
    root.dataset.theme = light ? 'light' : 'dark';
    root.style.setProperty('--accent', data.accent);
    list?.querySelector<HTMLButtonElement>('button')?.focus();
  }

  const act = (action: string) => api.trayAction(action).catch(() => {});

  function onkeydown(e: KeyboardEvent) {
    const btns = [...list.querySelectorAll<HTMLButtonElement>('button')];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      void act('hide');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      btns[(i + 1) % btns.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      btns[(i - 1 + btns.length) % btns.length]?.focus();
    }
  }

  onMount(() => {
    void refresh();
    // La fenêtre est gardée cachée entre deux ouvertures : on relit le contenu à chaque fois.
    addEventListener('focus', refresh);
    return () => removeEventListener('focus', refresh);
  });
</script>

<svelte:window {onkeydown} />

<div class="menu" bind:this={list} role="menu" aria-label="Hangar">
  <header>
    <Logo size={22} />
    <span>Hangar</span>
  </header>

  <p class="sec">Jeux récents</p>
  {#each data.games as g (g.id)}
    <button class="game" role="menuitem" onclick={() => act(`game:${g.id}`)}>
      <span class="cover" style:--h={hue(g.id)}>
        {#if g.cover}<img src={g.cover} alt="" />{:else}{g.name.slice(0, 1)}{/if}
      </span>
      <span class="name">{g.name}</span>
      <span class="play" aria-hidden="true"><Icon name="play" size={12} /></span>
    </button>
  {:else}
    <p class="none">Aucun jeu lancé pour l'instant.</p>
  {/each}

  <div class="sep"></div>
  <button class="item" role="menuitem" onclick={() => act('show')}><Icon name="home" size={16} />Ouvrir Hangar</button>
  <button class="item quit" role="menuitem" onclick={() => act('quit')}><Icon name="x" size={16} />Quitter Hangar</button>
</div>

<style>
  :global(html),
  :global(body) {
    background: var(--bg);
    overflow: hidden;
  }

  .menu {
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 10px 8px;
    border: 1px solid var(--border-3);
    background: rgb(var(--popover) / 1);
    color: var(--text);
    user-select: none;
  }

  header {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 4px 10px 10px;
    font-size: 15px;
    font-weight: 700;
    color: var(--strong);
  }

  .sec {
    padding: 4px 10px 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted);
  }

  button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 11px;
    border-radius: 10px;
    text-align: left;
    color: var(--text-soft);
  }

  button:hover,
  button:focus-visible {
    background: var(--surface-3);
    color: var(--strong);
    outline: none;
  }

  .game {
    height: 52px;
    padding: 0 8px;
  }

  .cover {
    width: 28px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 6px;
    overflow: hidden;
    display: grid;
    place-items: center;
    font-weight: 700;
    color: #fff;
    background: hsl(var(--h) 45% 32%);
  }

  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13.5px;
  }

  .play {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--muted);
  }

  .game:hover .play,
  .game:focus-visible .play {
    background: var(--accent);
    color: #fff;
  }

  .none {
    height: 52px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    font-size: 13px;
    color: var(--muted);
  }

  .sep {
    height: 1px;
    margin: 8px 6px;
    background: var(--border-2);
  }

  .item {
    height: 38px;
    padding: 0 12px;
    font-size: 13.5px;
  }

  .quit:hover,
  .quit:focus-visible {
    color: var(--danger-text);
    background: rgba(229, 72, 77, 0.12);
  }
</style>
