<script lang="ts">
  // Menu « Mises à jour » de la barre du haut : visible seulement quand un jeu en attend.
  import { onMount } from 'svelte';
  import { updateGame } from '../actions';
  import { STORES } from '../stores-meta';
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import { sizeLabel } from '../util/format';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';
  import StoreLogo from './StoreLogo.svelte';

  let open = $state(false);
  let root = $state<HTMLDivElement>();
  let toggle = $state<HTMLButtonElement>();

  // Téléchargements Steam suivis (installations et mises à jour) avec leur progression.
  const downloads = $derived(
    Object.entries(runner.progress).flatMap(([id, p]) => {
      const g = library.get(id);
      return g ? [{ g, ...p }] : [];
    }),
  );
  const games = $derived(library.updates.filter((g) => !(g.id in runner.progress)));
  const total = $derived(games.reduce((n, g) => n + (g.updateBytes ?? 0), 0));
  const overall = $derived(downloads.reduce((n, d) => n + d.value, 0) / (downloads.length || 1));

  $effect(() => {
    if (!games.length && !downloads.length) open = false;
  });

  onMount(() => {
    const close = (e: Event) => {
      if (open && !(e.target instanceof Node && root?.contains(e.target))) open = false;
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
    };
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      open = false;
      toggle?.focus();
    }
  }

  function seeAll() {
    open = false;
    ui.updatesList();
  }
</script>

{#if games.length || downloads.length}
  <div class="wrap" bind:this={root} {onkeydown} role="presentation">
    <button
      bind:this={toggle}
      class="ibtn"
      class:on={open}
      aria-label="Mises à jour des jeux : {games.length}{downloads.length
        ? `, ${downloads.length} téléchargement${downloads.length > 1 ? 's' : ''} en cours`
        : ''}"
      title="Mises à jour des jeux"
      aria-haspopup="true"
      aria-expanded={open}
      aria-controls="updates-menu"
      onclick={() => (open = !open)}
    >
      <Icon name="download" />
      {#if games.length}
        <span class="badge" aria-hidden="true">{games.length > 9 ? '9+' : games.length}</span>
      {/if}
      {#if downloads.length}
        <span class="mini" aria-hidden="true"><span style:width="{overall * 100}%"></span></span>
      {/if}
    </button>
    {#if open}
      <div class="panel" id="updates-menu" role="region" aria-label="Mises à jour des jeux">
        {#if downloads.length}
          <div class="head"><span>En cours</span></div>
          <ul>
            {#each downloads as d (d.g.id)}
              {@const pct = Math.round(d.value * 100)}
              <li>
                <button class="game" onclick={() => { open = false; ui.open(d.g.id); }}>
                  <span class="thumb"><Cover game={d.g} showName={false} eager /></span>
                  <span class="txt">
                    <span class="nm">{library.name(d.g)}</span>
                    <span class="meta">{runner.busyLabel(d.g.id)}</span>
                    <span
                      class="bar"
                      class:paused={d.paused}
                      role="progressbar"
                      aria-label="Téléchargement de {library.name(d.g)}"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}><span style:width="{pct}%"></span></span
                    >
                  </span>
                </button>
                <button
                  class="go"
                  onclick={() => runner.showInSteam(d.g.id)}
                  aria-label="Afficher {library.name(d.g)} dans Steam"
                  title="Pause, reprise et annulation dans Steam">Afficher dans Steam</button
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if games.length}
        <div class="head">
          <span>Mises à jour</span>
          {#if total}<span class="tot">{sizeLabel(total)} à télécharger</span>{/if}
        </div>
        <ul>
          {#each games.slice(0, 6) as g (g.id)}
            <li>
              <button class="game" onclick={() => { open = false; ui.open(g.id); }}>
                <span class="thumb"><Cover game={g} showName={false} eager /></span>
                <span class="txt">
                  <span class="nm">{library.name(g)}</span>
                  <span class="meta"
                    ><StoreLogo store={g.store} size={12} />{STORES[g.store].label}{g.updateBytes
                      ? ` · ${sizeLabel(g.updateBytes)}`
                      : ''}</span
                  >
                </span>
              </button>
              <button class="go" onclick={() => updateGame(g.id)} aria-label="Mettre à jour {library.name(g)}"
                >Mettre à jour</button
              >
            </li>
          {/each}
        </ul>
        <button class="all" onclick={seeAll}
          >{games.length > 6 ? `Voir les ${games.length} jeux` : "Voir l'onglet Mises à jour"}</button
        >
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .wrap {
    position: relative;
  }

  .ibtn {
    position: relative;
  }

  .ibtn.on {
    background: var(--surface-3);
    color: var(--strong);
  }

  .badge {
    position: absolute;
    top: 3px;
    right: 2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    pointer-events: none;
  }

  .mini,
  .bar {
    display: block;
    height: 3px;
    border-radius: 999px;
    background: rgb(var(--ink) / 0.14);
    overflow: hidden;
  }

  .mini {
    position: absolute;
    left: 9px;
    right: 9px;
    bottom: 5px;
    pointer-events: none;
  }

  .bar {
    width: 100%;
    height: 4px;
    margin-top: 2px;
  }

  .mini span,
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: inherit;
    transition: width 0.4s var(--ease);
  }

  .bar.paused span {
    background: var(--muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .mini span,
    .bar span {
      transition: none;
    }
  }

  .panel {
    position: absolute;
    top: 46px;
    right: 0;
    width: 340px;
    max-width: calc(100vw - 24px);
    padding: 8px;
    border-radius: 16px;
    background: rgb(var(--popover) / 0.92);
    backdrop-filter: blur(30px) saturate(1.4);
    border: 1px solid rgb(var(--ink) / 0.12);
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.6);
    animation: hgPopIn 0.16s var(--ease) both;
    transform-origin: top right;
    z-index: 30;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 10px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted);
  }

  .tot {
    letter-spacing: 0;
    text-transform: none;
    font-weight: 500;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 11px;
    transition: background 0.12s;
  }

  li:hover {
    background: rgb(var(--ink) / 0.06);
  }

  .game {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 10px;
    border-radius: 11px;
    text-align: left;
  }

  .thumb {
    position: relative;
    width: 30px;
    height: 42px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .txt {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .nm {
    font-weight: 600;
    font-size: 13.5px;
    color: var(--strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }

  .go {
    flex-shrink: 0;
    height: 28px;
    margin-right: 8px;
    padding: 0 11px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--strong);
    font-size: 12px;
    font-weight: 600;
    transition: background 0.15s;
  }

  .go:hover {
    background: var(--accent);
    color: #fff;
  }

  .all {
    width: 100%;
    margin-top: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 34px;
    border-radius: 10px;
    font-size: 13px;
    color: var(--text-soft);
    border-top: 1px solid rgb(var(--ink) / 0.08);
  }

  .all:hover {
    background: rgb(var(--ink) / 0.06);
    color: var(--strong);
  }

  .game:focus-visible,
  .go:focus-visible,
  .all:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
