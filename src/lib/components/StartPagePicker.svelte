<script lang="ts">
  // Choix de l'onglet de départ (configuration de départ et sa popup pour qui avait déjà Hangar).
  // Le choix s'applique tout de suite.
  import Icon from './Icon.svelte';
  import { library } from '../stores/library.svelte';
  import { startPages } from '../start-page';
  import type { StartPage } from '../types';

  let { webGames }: { webGames: boolean } = $props();

  const pages = $derived(startPages(webGames));
  // Choix qui n'existe plus (Jeux web désactivé, collection supprimée) : Accueil, comme au démarrage.
  const current = $derived<StartPage>(pages.find((p) => p.value === library.state.prefs.startPage)?.value ?? 'home');

  function pick(p: StartPage) {
    library.state.prefs.startPage = p;
    library.save();
  }

  function onkeydown(e: KeyboardEvent) {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = pages.findIndex((p) => p.value === current);
    const next = pages[(i + d + pages.length) % pages.length];
    pick(next.value);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-v="${CSS.escape(next.value)}"]`)?.focus();
  }
</script>

<div class="pages" role="radiogroup" aria-label="Onglet de départ" tabindex="-1" {onkeydown}>
  {#each pages as p (p.value)}
    <button
      class="page"
      class:on={p.value === current}
      role="radio"
      aria-checked={p.value === current}
      tabindex={p.value === current ? 0 : -1}
      data-v={p.value}
      onclick={() => pick(p.value)}
    >
      <Icon name={p.icon} size={18} />
      <span class="lbl">{p.label}</span>
    </button>
  {/each}
</div>

<style>
  .pages {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .page {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    background: rgb(var(--ink) / 0.05);
    color: var(--text-2);
    font-weight: 600;
    font-size: 13.5px;
    text-align: left;
    box-shadow: inset 0 0 0 1.5px transparent;
    transition:
      background 0.15s,
      box-shadow 0.15s,
      color 0.15s;
  }

  .page:hover {
    background: rgb(var(--ink) / 0.08);
    color: var(--strong);
  }

  .page :global(svg) {
    flex-shrink: 0;
  }

  .lbl {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .page.on {
    color: var(--strong);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .page.on :global(svg) {
    color: var(--accent-text);
  }
</style>
