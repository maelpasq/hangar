<script lang="ts">
  // Barre du haut : retour, recherche, actualiser, thème, contrôles de fenêtre.
  import { api } from '../api';
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { updater } from '../stores/update.svelte';
  import { isMac } from '../util/platform';
  import { ui } from '../stores/ui.svelte';
  import type { Game, Theme } from '../types';
  import { formatNumber } from '../util/format';
  import { rank } from '../util/search';
  import Icon, { type IconName } from './Icon.svelte';
  import SearchPanel from './SearchPanel.svelte';
  import UpdatesMenu from './UpdatesMenu.svelte';

  let { onrefresh, input = $bindable() }: { onrefresh: () => void; input?: HTMLInputElement } = $props();

  let selected = $state(0);
  let maximized = $state(false);

  const matches = $derived(ui.query.trim() ? rank(library.visible, ui.query, (g) => library.name(g)) : []);
  const results = $derived(matches.slice(0, 6));
  const show = $derived(ui.searchOpen && ui.query.trim().length > 0);

  $effect(() => {
    void ui.query;
    selected = 0;
  });

  function pick(g: Game, play: boolean) {
    input?.blur();
    if (play) runner.play(g.id);
    else ui.open(g.id);
    ui.query = '';
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selected = Math.min(results.length - 1, selected + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selected = Math.max(0, selected - 1);
    } else if (e.key === 'Enter') {
      const g = results[selected];
      if (g) pick(g, e.ctrlKey || e.metaKey);
    } else if (e.key === 'Escape') {
      ui.query = '';
      input?.blur();
    }
  }

  const THEMES: Record<Theme, { label: string; icon: IconName; next: Theme }> = {
    dark: { label: 'sombre', icon: 'moon', next: 'light' },
    light: { label: 'clair', icon: 'sun', next: 'system' },
    system: { label: "celui de l'appareil", icon: 'monitor', next: 'dark' }
  };
  const theme = $derived(library.state.theme);

  function cycleTheme() {
    library.state.theme = THEMES[theme].next;
    library.save();
  }

  async function toggleMax() {
    await api.win.toggleMaximize();
    maximized = await api.win.isMaximized();
  }
</script>

<header data-tauri-drag-region class:mac={isMac} class:over={ui.screen === 'game'} class:solid={ui.screen === 'game' && ui.pageScrolled}>
  {#if ui.screen === 'game'}
    <button class="ibtn" onclick={() => ui.back()} aria-label="Retour" title="Retour"
      ><Icon name="back" stroke={2} /></button
    >
  {/if}
  <div class="mid" data-tauri-drag-region>
    <label class="search">
      <Icon name="search" size={17} stroke={1.9} />
      <span class="sr-only">Rechercher un jeu</span>
      <input
        bind:this={input}
        bind:value={ui.query}
        type="text"
        spellcheck="false"
        autocomplete="off"
        placeholder="Rechercher parmi {formatNumber(library.visible.length)} {library.visible.length > 1 ? 'jeux' : 'jeu'}"
        role="combobox"
        aria-expanded={show}
        aria-controls="search-results"
        aria-activedescendant={show && results.length ? `res-${selected}` : undefined}
        onfocus={() => (ui.searchOpen = true)}
        onblur={() => setTimeout(() => (ui.searchOpen = false), 120)}
        {onkeydown}
      />
      <kbd>{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
    </label>
    {#if show}
      <SearchPanel {results} total={matches.length} {selected} onpick={pick} onhover={(i) => (selected = i)} />
    {/if}
  </div>
  <div class="right">
    {#if updater.phase === 'available' || updater.phase === 'installing'}
      <button
        class="update"
        disabled={updater.phase === 'installing'}
        title="Installer Hangar {updater.version} et redémarrer"
        onclick={() => updater.install()}
        >{updater.phase === 'installing' ? updater.label : 'Mettre à jour Hangar'}</button
      >
    {/if}
    <UpdatesMenu />
    <button
      class="ibtn"
      aria-label="Actualiser la bibliothèque"
      title="Actualiser la bibliothèque"
      disabled={library.scanning}
      onclick={onrefresh}
    >
      <Icon name="refresh" class={library.scanning ? 'spin' : ''} />
    </button>
    <button
      class="ibtn theme"
      onclick={cycleTheme}
      aria-label="Thème : {THEMES[theme].label}. Passer en {THEMES[THEMES[theme].next].label}"
      title="Thème : {THEMES[theme].label}"><Icon name={THEMES[theme].icon} /></button
    >
    <!-- macOS : boutons natifs de la fenêtre, en haut à gauche -->
    {#if !isMac}
      <button class="wbtn" aria-label="Réduire" title="Réduire" onclick={() => api.win.minimize()}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"
          ><path d="M2 6h8"></path></svg
        >
      </button>
      <button
        class="wbtn"
        aria-label={maximized ? 'Restaurer' : 'Agrandir'}
        title={maximized ? 'Restaurer' : 'Agrandir'}
        onclick={toggleMax}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
          {#if maximized}
            <rect x="2.5" y="3.5" width="6" height="6" rx="1.2"></rect><path d="M4.5 3.5V2.8a.8.8 0 0 1 .8-.8h3.9a.8.8 0 0 1 .8.8v3.9a.8.8 0 0 1-.8.8h-.7"></path>
          {:else}
            <rect x="2.5" y="2.5" width="7" height="7" rx="1.2"></rect>
          {/if}
        </svg>
      </button>
      <button class="wbtn x" aria-label="Fermer" title="Fermer" onclick={() => api.win.close()}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"
          ><path d="m3 3 6 6M9 3l-6 6"></path></svg
        >
      </button>
    {/if}
  </div>
</header>

<style>
  header {
    height: 64px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 0 0 28px;
    position: relative;
    z-index: 20;
    transition:
      background 0.25s,
      box-shadow 0.25s;
  }

  /* Page de jeu défilée : le contenu ne doit pas se voir derrière la recherche. */
  header.solid {
    background: rgb(var(--glass) / 0.78);
    backdrop-filter: blur(24px) saturate(1.3);
    box-shadow: 0 1px 0 var(--border-1);
  }

  .mid {
    flex: 1;
    display: flex;
    justify-content: center;
    position: relative;
    min-width: 0;
  }

  .search {
    width: min(560px, 100%);
    height: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 0 14px;
    border-radius: 13px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--muted);
    transition:
      border-color 0.2s,
      background 0.2s,
      box-shadow 0.2s;
  }

  .over .search {
    background: rgb(var(--glass) / 0.45);
    backdrop-filter: blur(20px);
  }

  .search:focus-within {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    background: var(--surface-3);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  input {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    outline: none;
    color: var(--strong);
    font-size: 14px;
  }

  input::placeholder {
    color: var(--muted);
  }

  .update {
    height: 32px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    transition: background 0.18s;
  }

  .update:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 85%, #fff);
  }

  .update:disabled {
    cursor: default;
    opacity: 0.85;
  }

  kbd {
    font:
      500 11px var(--font);
    color: var(--muted);
    border: 1px solid var(--border-3);
    border-radius: 6px;
    padding: 3px 6px;
    white-space: nowrap;
  }

  header.mac {
    padding-right: 16px;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .theme {
    margin-right: 8px;
  }

  .ibtn:disabled {
    cursor: default;
  }


  .wbtn {
    width: 46px;
    height: 44px;
    display: grid;
    place-items: center;
    color: var(--muted);
    transition:
      background 0.12s,
      color 0.12s;
  }

  .wbtn:hover {
    background: var(--surface-3);
    color: var(--strong);
  }

  .wbtn.x:hover {
    background: var(--danger);
    color: #fff;
  }

  .over .wbtn,
  .over .ibtn {
    color: var(--text-2);
  }
</style>
