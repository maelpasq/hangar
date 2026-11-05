<script lang="ts">
  // Mode manette : plein écran, grandes jaquettes, navigation à la croix ou au stick.
  // A : jouer · Y : favori · X : fiche du jeu · LB / RB : onglet · B ou Start : quitter.
  // Le clavier marche aussi (flèches, Entrée, Échap, Tab).
  import { onMount, tick } from 'svelte';
  import { api } from '../api';
  import { art } from '../art.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import { gamepad, type PadAction } from '../stores/gamepad.svelte';
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';
  import { hoursLabel, relativeDay } from '../util/format';

  type Tab = 'recent' | 'favorites' | 'all' | 'toInstall';

  const byName = (a: Game, b: Game) => library.name(a).localeCompare(library.name(b), 'fr');
  const tabs = $derived(
    (
      [
        {
          id: 'recent',
          label: 'Récents',
          games: [...library.installed].sort((a, b) => library.totals(b.id).lastPlayed - library.totals(a.id).lastPlayed || byName(a, b))
        },
        { id: 'favorites', label: 'Favoris', games: [...library.favorites].sort(byName) },
        { id: 'all', label: 'Tous les jeux', games: [...library.installed].sort(byName) },
        { id: 'toInstall', label: 'À installer', games: [...library.toInstall].sort(byName) }
      ] as { id: Tab; label: string; games: Game[] }[]
    ).filter((t) => t.id === 'recent' || t.games.length)
  );

  let tab = $state<Tab>('recent');
  let index = $state(0);
  let cols = $state(5);
  let grid: HTMLDivElement | undefined = $state();
  let clock = $state(new Date());

  const games = $derived(tabs.find((t) => t.id === tab)?.games ?? []);
  const focused = $derived(games[Math.min(index, games.length - 1)]);
  const hero = $derived(focused ? (art.hero(focused) ?? art.cover(focused)?.src ?? null) : null);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function exit() {
    ui.big = false;
  }

  async function focusTile() {
    await tick();
    const el = grid?.querySelectorAll<HTMLButtonElement>('.tile')[index];
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }

  function measure() {
    const first = grid?.querySelector<HTMLElement>('.tile');
    if (!grid || !first) return;
    cols = Math.max(1, Math.round(grid.clientWidth / first.offsetWidth));
  }

  function switchTab(step: number) {
    const i = tabs.findIndex((t) => t.id === tab);
    tab = tabs[(i + step + tabs.length) % tabs.length].id;
    index = 0;
    void focusTile();
  }

  function move(d: number) {
    if (!games.length) return;
    index = Math.max(0, Math.min(games.length - 1, index + d));
    void focusTile();
  }

  function act(a: PadAction) {
    // Pendant l'écran de lancement, seul B (annuler) compte.
    if (runner.launching) {
      if (a === 'b') runner.cancel();
      return;
    }
    if (ui.modal) return;
    switch (a) {
      case 'left':
        return move(-1);
      case 'right':
        return move(1);
      case 'up':
        return move(-cols);
      case 'down':
        return move(cols);
      case 'lb':
        return switchTab(-1);
      case 'rb':
        return switchTab(1);
      case 'a':
        if (focused) void runner.play(focused.id);
        return;
      case 'y':
        if (focused) library.toggleFav(focused.id);
        return;
      case 'x':
        if (focused) {
          const id = focused.id;
          exit();
          ui.open(id);
        }
        return;
      case 'b':
      case 'start':
        return exit();
    }
  }

  const KEYS: Record<string, PadAction> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Escape: 'b',
    PageUp: 'lb',
    PageDown: 'rb'
  };

  function onkeydown(e: KeyboardEvent) {
    const a = KEYS[e.key];
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    act(a);
  }

  onMount(() => {
    const off = gamepad.listen(act);
    api.win.setFullscreen(true).catch(() => {});
    const t = setInterval(() => (clock = new Date()), 15_000);
    const ro = new ResizeObserver(measure);
    if (grid) ro.observe(grid);
    void focusTile().then(measure);
    return () => {
      off();
      clearInterval(t);
      ro.disconnect();
      api.win.setFullscreen(false).catch(() => {});
    };
  });
</script>

<div class="big" role="dialog" aria-modal="true" aria-label="Mode manette" tabindex="-1" {onkeydown}>
  <div class="bg" aria-hidden="true">
    {#if hero}
      {#key hero}<img src={hero} alt="" />{/key}
    {/if}
  </div>

  <header>
    <span class="brand"><Logo size={34} /><span>Hangar</span></span>
    <nav class="tabs" aria-label="Onglets">
      <span class="pad" aria-hidden="true">LB</span>
      {#each tabs as t (t.id)}
        <button
          class:on={tab === t.id}
          aria-current={tab === t.id ? 'page' : undefined}
          tabindex="-1"
          onclick={() => {
            tab = t.id;
            index = 0;
            void focusTile();
          }}>{t.label}</button
        >
      {/each}
      <span class="pad" aria-hidden="true">RB</span>
    </nav>
    <span class="clock num">{clock.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
    <button class="quit" onclick={exit} aria-label="Quitter le mode manette"><Icon name="x" size={22} /></button>
  </header>

  <section class="info" aria-live="polite">
    {#if focused}
      <h1>{library.name(focused)}</h1>
      <p>
        {#if runner.isRunning(focused.id)}<span class="live">En cours</span> ·{/if}
        {#if focused.notInstalled}À installer via {focused.launcherName}
        {:else}
          {hoursLabel(library.totals(focused.id).playMs)} de jeu
          {#if library.totals(focused.id).lastPlayed}· {relativeDay(library.totals(focused.id).lastPlayed).toLowerCase()}{/if}
        {/if}
      </p>
    {:else}
      <h1>Aucun jeu ici</h1>
      <p>Change d'onglet avec LB / RB.</p>
    {/if}
  </section>

  <div class="grid" bind:this={grid}>
    {#each games as g, i (g.id)}
      <button
        class="tile"
        class:on={i === index}
        class:dim={g.notInstalled}
        aria-label="{library.name(g)}{g.notInstalled ? ', à installer' : ''}"
        onfocus={() => (index = i)}
        onmouseenter={() => (index = i)}
        onclick={() => runner.play(g.id)}
      >
        <Cover game={g} fontSize={20} eager={i < 18} />
        {#if library.isFav(g.id)}<span class="fav" aria-hidden="true"><Icon name="star" size={16} /></span>{/if}
      </button>
    {/each}
  </div>

  <footer aria-hidden="true">
    <span><b class="btn-a">A</b>{focused?.notInstalled ? 'Installer' : 'Jouer'}</span>
    <span><b class="btn-y">Y</b>Favori</span>
    <span><b class="btn-x">X</b>Fiche du jeu</span>
    <span><b class="btn-b">B</b>Quitter</span>
    {#if !gamepad.connected}<span class="kb">Clavier : flèches, Entrée, Échap</span>{/if}
  </footer>
</div>

<style>
  .big {
    position: fixed;
    inset: 0;
    /* Sous l'écran de lancement (60), les modales et les toasts. */
    z-index: 55;
    display: flex;
    flex-direction: column;
    padding: 28px 56px 22px;
    background: var(--bg);
    color: var(--text);
    overflow: hidden;
    outline: none;
  }

  .bg {
    position: absolute;
    inset: 0;
    z-index: -1;
  }

  .bg img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: blur(28px) saturate(1.2);
    opacity: 0.35;
    transform: scale(1.08);
    animation: bgIn 0.5s ease both;
  }

  .bg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgb(0 0 0 / 0.2), var(--bg) 85%);
  }

  @keyframes bgIn {
    from {
      opacity: 0;
    }
  }

  header {
    display: flex;
    align-items: center;
    gap: 28px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 22px;
    font-weight: 700;
  }

  .tabs {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
  }

  .tabs button {
    height: 44px;
    padding: 0 20px;
    border-radius: 22px;
    font-size: 17px;
    font-weight: 600;
    color: var(--muted);
  }

  .tabs button.on {
    background: var(--strong);
    color: var(--bg);
  }

  .pad {
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--border-3);
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
  }

  .clock {
    font-size: 20px;
    font-weight: 600;
  }

  .quit {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--surface-2);
  }

  .info {
    margin: 36px 0 22px;
    min-height: 88px;
  }

  h1 {
    font-size: 44px;
    font-weight: 800;
    letter-spacing: -1px;
    line-height: 1.1;
  }

  .info p {
    margin-top: 8px;
    font-size: 18px;
    color: var(--muted);
  }

  .live {
    color: var(--accent);
    font-weight: 700;
  }

  .grid {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    /* Rangées à la hauteur des jaquettes, jamais tassées dans la hauteur de l'écran. */
    grid-auto-rows: max-content;
    gap: 28px 24px;
    padding: 14px 10px 40px;
    margin: 0 -10px;
    align-content: start;
  }

  .tile {
    position: relative;
    display: block;
    border-radius: 16px;
    overflow: hidden;
    background: var(--surface-2);
    transition:
      transform 0.18s var(--ease),
      box-shadow 0.18s;
  }

  /* Hauteur 2:3 par le remplissage : aspect-ratio seul ne dimensionne pas les rangées de la grille ici. */
  .tile::before {
    content: '';
    display: block;
    padding-top: 150%;
  }

  .tile :global(.img) {
    position: absolute;
    inset: 0;
  }

  .tile.dim {
    opacity: 0.55;
  }

  .tile.on,
  .tile:focus-visible {
    transform: scale(1.06);
    box-shadow:
      0 0 0 4px var(--accent),
      0 20px 50px rgb(0 0 0 / 0.5);
    opacity: 1;
    outline: none;
    z-index: 1;
  }

  .fav {
    position: absolute;
    top: 10px;
    right: 10px;
    color: #ffd166;
    filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.6));
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 26px;
    padding-top: 14px;
    font-size: 15px;
    color: var(--text-soft);
  }

  footer span {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  footer b {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 13px;
    color: #fff;
  }

  .btn-a {
    background: #2f9e44;
  }
  .btn-b {
    background: #c92a2a;
  }
  .btn-x {
    background: #1971c2;
  }
  .btn-y {
    background: #e8a400;
  }

  .kb {
    color: var(--muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .tile,
    .bg img {
      transition: none;
      animation: none;
    }
  }
</style>
