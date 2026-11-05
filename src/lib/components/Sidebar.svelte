<script lang="ts">
  import Logo from './Logo.svelte';
  import { isMac } from '../util/platform';
  import { plural } from '../util/format';
  // Barre latérale : navigation, stores, carte « En jeu », bouton « Ajouter un jeu ».
  import { STORES } from '../stores-meta';
  import StoreLogo from './StoreLogo.svelte';
  import { library, presentStores } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import RunningCard from './RunningCard.svelte';

  let { rail = false }: { rail?: boolean } = $props();

  const current = $derived(
    ui.screen === 'library'
      ? ui.favOnly
        ? 'favorites'
        : ui.toInstall
          ? 'toInstall'
          : ui.store === 'all'
          ? 'library'
          : ''
      : ui.screen === 'game'
        ? ''
        : ui.screen
  );

  const nav = $derived<{ key: string; label: string; icon: IconName; count?: number; go: () => void }[]>([
    { key: 'home', label: 'Accueil', icon: 'home', go: () => ui.home() },
    { key: 'library', label: 'Bibliothèque', icon: 'grid', count: library.installed.length, go: () => ui.libraryAll() },
    { key: 'favorites', label: 'Favoris', icon: 'star', count: library.favorites.length, go: () => ui.favorites() },
    ...(library.toInstall.length
      ? [{ key: 'toInstall', label: 'À installer', icon: 'download' as const, count: library.toInstall.length, go: () => ui.toInstallList() }]
      : []),
    { key: 'settings', label: 'Paramètres', icon: 'sliders', go: () => ui.settings() }
  ]);

  const stores = $derived(presentStores(library.counts));
</script>

<aside class:rail class:mac={isMac} aria-label="Navigation">
  {#if isMac}
    <!-- macOS : bande où se posent les boutons natifs, sert aussi à déplacer la fenêtre -->
    <div class="titlebar" data-tauri-drag-region></div>
  {/if}
  <div class="logo">
    <Logo size={30} />
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
      {@const on = ui.screen === 'library' && !ui.favOnly && !ui.toInstall && ui.store === s}
      <button
        class="navb store"
        class:on
        aria-current={on ? 'page' : undefined}
        aria-label={rail ? `${STORES[s].label}, ${plural(library.counts[s] ?? 0, 'jeu', 'jeux')}` : undefined}
        title={rail ? STORES[s].label : undefined}
        onclick={() => ui.storeFilter(s)}
      >
        <span class="ic" aria-hidden="true"><StoreLogo store={s} size={17} glow /></span>
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

  aside.mac {
    padding-top: 56px;
  }

  .titlebar {
    position: absolute;
    inset: 0 0 auto;
    height: 52px;
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
    min-height: 0;
    margin-right: -6px;
    padding-right: 6px;
    padding-bottom: 14px;
    /* Fondu en bas : une liste qui défile ne coupe pas net la dernière entrée. */
    mask-image: linear-gradient(to bottom, #000 calc(100% - 22px), transparent);
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
    color: var(--text-nav);
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
    color: var(--strong);
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
    color: var(--text-3);
  }
</style>
