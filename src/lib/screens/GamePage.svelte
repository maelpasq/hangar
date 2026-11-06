<script lang="ts">
  // Fiche d'un jeu : bannière, jaquette, Jouer, activité, informations, jeux similaires.
  import { hideGame, openFolder, uninstallGame, updateGame } from '../actions';
  import { api } from '../api';
  import { art } from '../art.svelte';
  import ActivityChart from '../components/ActivityChart.svelte';
  import Cover from '../components/Cover.svelte';
  import FavButton from '../components/FavButton.svelte';
  import GameCard from '../components/GameCard.svelte';
  import Icon from '../components/Icon.svelte';
  import PlayButton from '../components/PlayButton.svelte';
  import StoreLogo from '../components/StoreLogo.svelte';
  import { STORE_LOGOS } from '../store-logos';
  import { STORES } from '../stores-meta';
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';
  import { generatedBackground } from '../util/color';
  import { dateLabel, formatNumber, hoursLabel, relativeDay, sizeLabel } from '../util/format';

  let { game }: { game: Game } = $props();

  const st = $derived(STORES[game.store]);
  const t = $derived(library.totals(game.id));
  const name = $derived(library.name(game));
  const hero = $derived(art.hero(game));
  const cover = $derived(art.cover(game));
  const banner = $derived(hero || cover?.src || null);
  const running = $derived(runner.isRunning(game.id));
  const sessions = $derived(library.state.sessions.filter((s) => s.gameId === game.id));
  const added = $derived(library.addedAt(game));
  const genre = $derived(library.genre(game));
  const location = $derived(game.notInstalled ? 'Non installé' : game.installDir || game.launch.target);
  const via = $derived(game.notInstalled ? "S'installe via" : 'Se lance via');

  const similar = $derived(
    library.installed
      .filter((x) => x.id !== game.id && (x.store === game.store || (!!genre && library.genre(x) === genre)))
      .slice(0, 9)
  );

  let size = $state<number | null | undefined>(undefined);

  $effect(() => {
    const dir = game.installDir;
    size = undefined;
    if (game.sizeBytes) {
      size = game.sizeBytes;
      return;
    }
    if (!dir) {
      size = null;
      return;
    }
    let alive = true;
    api
      .folderSize(dir)
      .then((b) => alive && (size = b))
      .catch(() => alive && (size = null));
    return () => {
      alive = false;
    };
  });

  $effect(() => {
    ui.ambient = hero ?? cover?.src ?? null;
  });
</script>

<div class="screen scroll page" onscroll={(e) => (ui.pageScrolled = e.currentTarget.scrollTop > 40)}>
  <section class="banner">
    {#if banner}
      {#key banner}
        <img src={banner} alt="" class:blurred={!hero} />
      {/key}
    {:else}
      <!-- Ni bannière ni jaquette : le dégradé de la jaquette générée, flouté. -->
      <div class="fallback" aria-hidden="true" style:background={generatedBackground(game.id)}></div>
    {/if}
    <div class="shade" aria-hidden="true"></div>
  </section>

  <div class="top">
    <div class="lcover cw">
      <div class="cv">
        <Cover {game} fontSize={28} padding={18} eager alt="Jaquette de {name}" />
      </div>
    </div>
    <div class="headline">
      <div class="pill">
        <StoreLogo store={game.store} size={14} />{st.label}{genre ? ` · ${genre}` : ''}
      </div>
      <h1 class:long={name.length > 36} title={name}>{name}</h1>
      <div class="actions">
        {#if running}
          <span class="live num"><span class="pulse dotg"></span>En cours · {runner.elapsed(game.id)}</span>
          <button class="ghost stop" onclick={() => { ui.modal = { kind: 'stop', gameId: game.id }; }}>Arrêter</button>
        {:else}
          <PlayButton gameId={game.id} large />
        {/if}
        <FavButton gameId={game.id} variant="ghost" size={52} />
        <span class="via">{via} {#if STORE_LOGOS[game.store]}<StoreLogo store={game.store} size={14} />{/if} {game.launcherName}</span>
      </div>
    </div>
  </div>

  <div class="cards">
    <section class="card-section activity">
      <h2>Activité</h2>
      <div class="tiles">
        <div class="tile"><div class="k">Temps de jeu</div><div class="v num">{hoursLabel(t.playMs)}</div></div>
        <div class="tile">
          <div class="k">Dernière session</div>
          <div class="v">{t.lastPlayed ? relativeDay(t.lastPlayed) : 'Jamais'}</div>
        </div>
        <div class="tile"><div class="k">Lancements</div><div class="v num">{formatNumber(t.launches)}</div></div>
        <div class="tile">
          <div class="k">Taille</div>
          <div class="v num">{size === undefined ? '…' : sizeLabel(size)}</div>
        </div>
      </div>
      <div class="chart-head"><span>14 derniers jours</span><span class="unit">heures par jour</span></div>
      <ActivityChart {sessions} now={runner.now} />
    </section>
    <section class="card-section info">
      <h2>Informations</h2>
      <dl>
        <dt>Emplacement</dt>
        <dd class="path">{location}</dd>
        <dt>Lanceur</dt>
        <dd>{#if STORE_LOGOS[game.store]}<StoreLogo store={game.store} size={14} />{/if} {game.launcherName}</dd>
        <dt>Ajouté</dt>
        <dd>{added ? dateLabel(added) : '-'}</dd>
        {#if game.updatePending}
          <dt>Mise à jour</dt>
          <dd>En attente{game.updateBytes ? ` · ${sizeLabel(game.updateBytes)}` : ''}</dd>
        {/if}
      </dl>
      <div class="sep"></div>
      <button class="act" disabled={!game.installDir} onclick={() => openFolder(game.id)}
        ><Icon name="folder" size={17} />Ouvrir le dossier</button
      >
      <button class="act" onclick={() => { ui.modal = { kind: 'collections', gameId: game.id }; }}
        ><Icon name="layers" size={17} />Collections</button
      >
      <button class="act" onclick={() => { ui.modal = { kind: 'rename', gameId: game.id }; }}
        ><Icon name="edit" size={17} />Renommer</button
      >
      <button class="act" onclick={() => { ui.modal = { kind: 'cover', gameId: game.id }; }}
        ><Icon name="image" size={17} />Changer la jaquette</button
      >
      {#if !game.notInstalled}
        <button class="act" onclick={() => updateGame(game.id)}
          ><Icon name="refresh" size={17} />{game.updatePending ? 'Mettre à jour' : 'Rechercher des mises à jour'}</button
        >
        <button class="act" onclick={() => uninstallGame(game.id)}
          ><Icon name="package" size={17} />Désinstaller</button
        >
      {/if}
      <button class="act red" onclick={() => hideGame(game.id)}
        ><Icon name="eyeOff" size={17} />Masquer de la bibliothèque</button
      >
    </section>
  </div>

  {#if similar.length}
    <h2 class="sim">Aussi dans ta bibliothèque</h2>
    <div class="row">
      {#each similar as g, i (g.id)}
        <GameCard game={g} index={i} width={150} variant="small" fav={false} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .page {
    flex: 1;
    padding: 0 28px 48px;
    margin-top: -64px;
  }

  .banner {
    position: relative;
    height: 420px;
    margin: 0 -28px;
    overflow: hidden;
    isolation: isolate;
    /* Fondu vers le fond (lumière d'ambiance comprise) : pas de bord visible. */
    mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
  }

  .banner img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    animation:
      hgFade 0.6s ease both,
      hgKen 14s ease-out forwards;
  }

  .banner img.blurred {
    filter: blur(30px) saturate(1.4) brightness(0.8);
  }

  .fallback {
    position: absolute;
    inset: -60px;
    filter: blur(50px) saturate(1.2) brightness(0.55);
    animation: hgFade 0.6s ease both;
  }

  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(0deg, var(--bg) 0%, rgb(var(--glass) / 0.55) 45%, rgb(var(--glass) / 0.25) 100%);
  }

  .top {
    position: relative;
    display: flex;
    gap: 34px;
    flex-wrap: wrap;
    margin-top: -190px;
    z-index: 2;
  }

  .cw {
    width: 230px;
    flex-shrink: 0;
  }

  .cv {
    position: relative;
    width: 100%;
    aspect-ratio: 2 / 3;
    border-radius: var(--r-cover);
    overflow: hidden;
    background: var(--cover-bg);
    box-shadow:
      0 40px 80px -20px rgba(0, 0, 0, 0.9),
      0 0 0 1px rgb(var(--ink) / 0.1);
  }

  .headline {
    flex: 1 1 420px;
    min-width: 0;
    padding-top: 70px;
  }

  .pill {
    letter-spacing: 0;
  }

  h1 {
    margin: 14px 0 22px;
    font-size: 52px;
    line-height: 1;
    font-weight: 800;
    letter-spacing: -1.6px;
    overflow-wrap: anywhere;
    /* Nom très long : 3 lignes au plus. */
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    padding-bottom: 0.06em;
  }

  h1.long {
    font-size: 40px;
    letter-spacing: -1px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .live {
    height: 52px;
    padding: 0 22px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border-radius: 16px;
    background: rgba(52, 211, 153, 0.12);
    border: 1px solid rgba(52, 211, 153, 0.35);
    color: var(--success-text);
    font-weight: 650;
    font-size: 15px;
  }

  .dotg {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
  }

  .stop {
    height: 52px;
    padding: 0 20px;
    border-radius: 16px;
    background: var(--border-2);
  }

  .via {
    color: var(--text-3);
    font-size: 13px;
    margin-left: 6px;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 18px;
    margin-top: 34px;
  }

  .activity {
    grid-column: span 2;
  }

  @media (max-width: 1100px) {
    .activity {
      grid-column: auto;
    }
  }

  .activity h2 {
    margin-bottom: 18px;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .tile {
    padding: 14px;
    border-radius: 14px;
    background: rgb(var(--ink) / 0.04);
    min-width: 0;
  }

  .k {
    font-size: 12px;
    color: var(--muted);
  }

  .v {
    font-size: 24px;
    font-weight: 700;
    margin-top: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chart-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 22px 0 10px;
    font-size: 13px;
    color: var(--text-2);
  }

  .unit {
    font-size: 12px;
    color: var(--muted);
  }

  .info h2 {
    margin-bottom: 14px;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px 16px;
    font-size: 13px;
  }

  dt {
    color: var(--muted);
  }

  dd {
    color: var(--text-soft);
    user-select: text;
  }

  .path {
    word-break: break-all;
  }

  .sep {
    height: 1px;
    background: rgb(var(--ink) / 0.06);
    margin: 16px 0 8px;
  }

  .act {
    width: 100%;
    height: 42px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 14px;
    border-radius: 11px;
    color: var(--text-soft);
    font-size: 14px;
    text-align: left;
    transition: background 0.15s;
  }

  .act:hover:not(:disabled) {
    background: rgb(var(--ink) / 0.06);
  }

  .act:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .act.red {
    color: var(--danger-text);
  }

  .sim {
    margin: 34px 0 16px;
    font-size: 19px;
    font-weight: 700;
  }
</style>
