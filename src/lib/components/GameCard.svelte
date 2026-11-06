<script lang="ts">
  // Carte de jeu (jaquette 2:3) : clic = fiche, bouton « Lancer » ou double-clic = lancer, clic droit = menu.
  // Jeu non installé : jaquette atténuée, bouton « Installer ».
  import { STORES } from '../stores-meta';
  import { updateGame } from '../actions';
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';
  import { hoursLabel, relativeDay } from '../util/format';
  import Cover from './Cover.svelte';
  import FavButton from './FavButton.svelte';
  import Icon from './Icon.svelte';
  import StoreLogo from './StoreLogo.svelte';

  let {
    game,
    index = 0,
    width,
    meta = 'hours',
    variant = 'grid',
    fav = true,
    animate = true
  }: {
    game: Game;
    index?: number;
    width?: number;
    meta?: 'hours' | 'last' | 'store' | 'none';
    variant?: 'grid' | 'row' | 'small';
    fav?: boolean;
    animate?: boolean;
  } = $props();

  const store = $derived(STORES[game.store]);
  const name = $derived(library.name(game));
  const t = $derived(library.totals(game.id));
  const toInstall = $derived(!!game.notInstalled);
  // Onglet « Mises à jour » : l'action principale de la jaquette met le jeu à jour.
  const toUpdate = $derived(ui.updates && !toInstall && !!game.updatePending);
  const primary = () => (toUpdate ? updateGame(game.id) : runner.play(game.id));
  const metaText = $derived(
    toInstall && meta !== 'last'
      ? `${store.label} · Non installé`
      : game.updatePending && meta !== 'last'
        ? `${store.label} · Mise à jour`
      : meta === 'hours'
      ? `${store.label} · ${hoursLabel(t.playMs)}`
      : meta === 'last'
        ? t.lastPlayed
          ? relativeDay(t.lastPlayed)
          : store.label
        : store.label
  );
  const gen = $derived(variant === 'grid' ? { f: 22, p: 16 } : variant === 'row' ? { f: 19, p: 14 } : { f: 18, p: 14 });

  let clickTimer: ReturnType<typeof setTimeout> | undefined;

  function onclick(e: MouseEvent) {
    // Attendre un éventuel double-clic avant d'ouvrir la fiche.
    if (e.detail === 0) return ui.open(game.id);
    if (e.detail > 1) return;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => ui.open(game.id), 220);
  }

  function ondblclick() {
    clearTimeout(clickTimer);
    primary();
  }

  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
    ui.menu = { gameId: game.id, x: e.clientX, y: e.clientY };
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      ui.menu = { gameId: game.id, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }
</script>

<div
  class="card"
  class:rise={animate}
  class:fixed={!!width}
  style:width={width ? `${width}px` : null}
  style:animation-delay={animate ? `${Math.min(index, 24) * 35}ms` : null}
>
  <div class="frame">
    <button
      class="cover"
      class:dim={toInstall && !ui.toInstall}
      aria-label={toInstall ? `${name}, non installé` : name}
      title={name}
      {onclick}
      {ondblclick}
      {oncontextmenu}
      {onkeydown}
    >
      <Cover {game} fontSize={gen.f} padding={gen.p} />
      <span class="ov"></span>
    </button>
    <button class="play" aria-label="{toUpdate ? 'Mettre à jour' : toInstall ? 'Installer' : 'Lancer'} {name}" onclick={primary}
      >{#if variant !== 'small'}<Icon
          name={toInstall || toUpdate ? 'download' : 'play'}
          size={toInstall || toUpdate ? 14 : 12}
          stroke={2.2}
        />{/if}{toUpdate ? 'Mettre à jour' : toInstall ? 'Installer' : 'Lancer'}</button
    >
  </div>
  {#if fav}<FavButton gameId={game.id} />{/if}
  {#if variant === 'small'}
    <div class="name small">{name}</div>
  {:else}
    <div class="info" class:inrow={variant === 'row'}>
      <div class="name">{name}</div>
      {#if meta !== 'none'}
        <div class="meta"><StoreLogo store={game.store} size={12} /><span class="mt">{metaText}</span></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .card {
    position: relative;
    min-width: 0;
  }

  .card.fixed {
    flex-shrink: 0;
  }

  .frame {
    position: relative;
    transition: transform 0.4s var(--ease);
  }

  .cover {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 2 / 3;
    border-radius: var(--r-cover);
    overflow: hidden;
    background: var(--cover-bg);
    box-shadow: 0 10px 30px -14px rgba(0, 0, 0, 0.9);
    transition: box-shadow 0.4s var(--ease);
  }

  .cover::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.09);
    pointer-events: none;
  }

  .card:hover .frame,
  .frame:focus-within {
    transform: translateY(-6px) scale(1.025);
  }

  .card:hover .cover,
  .cover:focus-visible {
    box-shadow:
      0 0 0 2px var(--accent-ring),
      0 26px 50px -16px var(--accent-glow);
    outline: none;
  }

  .cover :global(img) {
    transition:
      opacity 0.4s ease,
      transform 0.6s var(--ease);
  }

  .card:hover .cover :global(.full),
  .cover:focus-visible :global(.full) {
    transform: scale(1.06);
  }

  /* Non installé : jaquette désaturée, couleurs rendues au survol. */
  .cover.dim > :global(*:not(.ov)) {
    filter: grayscale(0.8) brightness(0.62);
    transition: filter 0.3s ease;
  }

  .card:hover .cover.dim > :global(*:not(.ov)),
  .cover.dim:focus-visible > :global(*:not(.ov)) {
    filter: none;
  }

  .ov {
    position: absolute;
    inset: 0;
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.7), transparent 55%);
    opacity: 0;
    transition: opacity 0.25s;
  }

  .card:hover .ov,
  .frame:focus-within .ov {
    opacity: 1;
  }

  .play {
    position: absolute;
    left: 50%;
    bottom: 14px;
    height: 36px;
    padding: 0 16px 0 13px;
    display: flex;
    align-items: center;
    gap: 7px;
    border-radius: 11px;
    background: #fff;
    color: #0a0b0f;
    font-weight: 650;
    font-size: 13px;
    white-space: nowrap;
    opacity: 0;
    transform: translate(-50%, 10px);
    transition:
      opacity 0.25s,
      transform 0.35s var(--ease);
  }

  .card:hover .play,
  .frame:focus-within .play {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  .play:hover {
    transform: translate(-50%, 0) scale(1.05);
  }

  .info {
    padding: 11px 2px 0;
  }

  .info.inrow {
    padding-top: 10px;
  }

  .name {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .info.inrow .name {
    font-size: 13.5px;
  }

  .name.small {
    padding: 10px 2px 0;
    font-size: 13px;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
    margin-top: 3px;
    min-width: 0;
  }

  .mt {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
