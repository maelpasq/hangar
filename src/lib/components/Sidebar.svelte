<script lang="ts">
  // Barre latérale : navigation, stores, carte « En jeu », bouton « Ajouter un jeu ».
  import { STORES } from '../stores-meta';
  import { library, presentStores } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import RunningCard from './RunningCard.svelte';

  let { rail = false }: { rail?: boolean } = $props();

  const current = $derived(
    ui.screen === 'library'
      ? ui.favOnly
        ? 'favorites'
        : ui.store === 'all'
          ? 'library'
          : ''
      : ui.screen === 'game'
        ? ''
        : ui.screen
  );

  const nav = $derived<{ key: string; label: string; icon: IconName; count?: number; go: () => void }[]>([
    { key: 'home', label: 'Accueil', icon: 'home', go: () => ui.home() },
    { key: 'library', label: 'Bibliothèque', icon: 'grid', count: library.visible.length, go: () => ui.libraryAll() },
    { key: 'favorites', label: 'Favoris', icon: 'star', count: library.favorites.length, go: () => ui.favorites() },
    { key: 'settings', label: 'Paramètres', icon: 'sliders', go: () => ui.settings() }
  ]);

  const stores = $derived(presentStores(library.counts));
</script>

<aside class:rail aria-label="Navigation">
  <div class="logo">
    <svg width="30" height="30" viewBox="0 0 1024 1024" aria-hidden="true"
      ><defs
        ><linearGradient id="hgl" x1="0" y1="0" x2="1" y2="1"
          ><stop offset="0" stop-color="#8b5cf6"></stop><stop offset=".55" stop-color="#6366f1"></stop><stop
            offset="1"
            stop-color="#22d3ee"
          ></stop></linearGradient
        ></defs
      ><rect x="64" y="64" width="896" height="896" rx="220" fill="url(#hgl)"></rect><path
        d="M272 760 V470 Q272 300 512 268 Q752 300 752 470 V760"
        fill="none"
        stroke="#fff"
        stroke-width="72"
        stroke-linecap="round"
      ></path><path
        d="M452 520 L612 610 L452 700 Z"
        fill="#fff"
        stroke="#fff"
        stroke-width="28"
        stroke-linejoin="round"
      ></path></svg
    >
    {#if !rail}<span>Hangar</span>{/if}
  </div>

  {#if !rail}<p class="sec">Bibliothèque</p>{/if}
  <nav aria-label="Bibliothèque">
    {#each nav as n (n.key)}
      <button
        class="navb"
        class:on={current === n.key}
        aria-current={current === n.key ? 'page' : undefined}
        aria-label={rail ? n.label : undefined}
        title={rail ? n.label : undefined}
        onclick={n.go}
      >
        <span class="ic"><Icon name={n.icon} /></span>
        {#if !rail}
          <span>{n.label}</span>
          <span class="count num">{n.count ?? ''}</span>
        {/if}
      </button>
    {/each}
  </nav>

  {#if !rail}<p class="sec stores">Stores</p>{:else}<div class="sep"></div>{/if}
  <nav class="scroll list" aria-label="Stores">
    {#each stores as s (s)}
      {@const on = ui.screen === 'library' && !ui.favOnly && ui.store === s}
      <button
        class="navb store"
        class:on
        aria-current={on ? 'page' : undefined}
        aria-label={rail ? `${STORES[s].label}, ${library.counts[s]} jeux` : undefined}
        title={rail ? STORES[s].label : undefined}
        onclick={() => ui.storeFilter(s)}
      >
        <span class="sdot" style:background={STORES[s].color} style:box-shadow="0 0 10px {STORES[s].color}"></span>
        {#if !rail}
          <span>{STORES[s].label}</span>
          <span class="count num">{library.counts[s]}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <RunningCard {rail} />
  <button
    class="navb add"
    onclick={() => { ui.modal = { kind: 'add' }; }}
    aria-label={rail ? 'Ajouter un jeu' : undefined}
    title={rail ? 'Ajouter un jeu' : undefined}
  >
    <Icon name="plus" size={16} stroke={2} />
    {#if !rail}Ajouter un jeu{/if}
  </button>
</aside>

<style>
  aside {
    position: relative;
    z-index: 2;
    width: 248px;
    flex-shrink: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 18px 12px 16px 24px;
    border-right: 1px solid var(--border-1);
    background: var(--sidebar);
    backdrop-filter: blur(30px);
  }

  aside.rail {
    width: 76px;
    padding: 18px 12px 16px;
    align-items: stretch;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 2px 4px 22px;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.2px;
  }

  .rail .logo {
    justify-content: center;
    padding: 2px 0 22px;
  }

  .sec {
    padding: 6px 12px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted);
  }

  .sec.stores {
    padding-top: 22px;
  }

  .sep {
    height: 1px;
    background: var(--border-1);
    margin: 12px 6px;
  }

  .list {
    flex: 1;
    margin-right: -6px;
    padding-right: 6px;
  }

  .rail .list {
    margin-right: 0;
    padding-right: 0;
    scrollbar-width: none;
  }

  .navb {
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    border-radius: 11px;
    color: #9ea3b5;
    font-size: 14px;
    text-align: left;
    transition:
      background 0.18s,
      color 0.18s;
    position: relative;
  }

  .navb.store {
    height: 36px;
  }

  .rail .navb {
    justify-content: center;
    padding: 0;
  }

  .navb:hover {
    background: var(--border-1);
    color: var(--text);
  }

  .navb.on {
    background: var(--border-2);
    color: #fff;
  }

  .navb.on::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 11px;
    bottom: 11px;
    width: 3px;
    border-radius: 3px;
    background: var(--accent);
  }

  .navb.store.on::before {
    top: 9px;
    bottom: 9px;
  }

  .ic {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
  }

  .sdot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin: 0 4px;
    flex-shrink: 0;
  }

  .count {
    margin-left: auto;
    font-size: 12px;
    color: var(--muted-2);
  }

  .add {
    margin-top: 10px;
    height: 44px;
    border: 1px dashed var(--border-3);
    justify-content: center;
    color: #b4b8c8;
  }
</style>
