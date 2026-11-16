<script lang="ts">
  // Fiche d'un jeu : bannière, jaquette, Jouer, activité, informations, jeux similaires.
  import { hideGame, openFolder, uninstallGame, updateGame } from '../actions';
  import { attachElsewhere } from '../ghosts';
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
  import { cloud } from '../stores/cloud.svelte';
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Achievements, Game } from '../types';
  import { generatedBackground } from '../util/color';
  import { linkDomain } from '../util/sync';
  import { dateLabel, formatNumber, hoursLabel, relativeDay, sizeLabel } from '../util/format';
  import BlurImage from '../components/BlurImage.svelte';

  let { game }: { game: Game } = $props();

  const st = $derived(STORES[game.store]);
  const t = $derived(library.totals(game.id));
  const name = $derived(library.name(game));
  const hero = $derived(art.hero(game));
  const cover = $derived(art.cover(game));
  const banner = $derived(hero || cover?.src || null);
  const running = $derived(runner.isRunning(game.id));
  const sessions = $derived(library.state.sessions.filter((s) => s.gameId === game.id));
  /** Sessions d'autres PC du compte Hangar dans l'histogramme. */
  const allDevices = $derived(sessions.some((s) => s.deviceId));
  /** Temps de jeu par PC du compte Hangar (vide : un seul PC, ou temps compté par le store). */
  const perDevice = $derived(
    library.deviceTimes(game.id).map((d) => {
      const here = d.deviceId === library.state.deviceId;
      const known = cloud.status.devices.find((x) => (here ? x.current : x.id === d.deviceId));
      return { ...d, here, name: known?.name ?? (here ? 'Ce PC' : 'Autre PC') };
    })
  );
  const added = $derived(library.addedAt(game));
  const genre = $derived(library.genre(game));
  const location = $derived(
    game.elsewhere ? 'Sur un autre PC' : game.notInstalled ? 'Non installé' : game.installDir || game.launch.target
  );
  /** Jeu hors store : page où le retrouver (lien d'installation), modifiable. */
  const offStore = $derived(game.store === 'local' || game.store === 'manual');
  const link = $derived(library.installLink(game));
  const via = $derived(game.elsewhere ? 'Sur un autre PC, se lance via' : game.notInstalled ? "S'installe via" : 'Se lance via');

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

  // Succès : donnés avec la liste du compte Xbox, ou demandés ici pour Steam (compte Steam relié
  // seulement, le backend répond null sinon).
  let steamAch = $state<Achievements | null>(null);
  const achievements = $derived(game.achievements ?? steamAch);
  /** Progression en % : par le nombre de succès, sinon par le Gamerscore (Xbox). */
  const achPct = $derived.by(() => {
    const a = achievements;
    if (!a) return 0;
    if (a.total) return Math.round((a.unlocked / a.total) * 100);
    return a.gamerscoreTotal ? Math.round(((a.gamerscore ?? 0) / a.gamerscoreTotal) * 100) : 0;
  });
  $effect(() => {
    const id = game.id;
    steamAch = null;
    if (!game.steamAppId || game.achievements) return;
    let alive = true;
    api
      .steamAchievements(id)
      .then((a) => alive && (steamAch = a))
      .catch(() => {});
    return () => {
      alive = false;
    };
  });
</script>

<div class="screen scroll page" onscroll={(e) => (ui.pageScrolled = e.currentTarget.scrollTop > 40)}>
  <section class="banner">
    {#if banner}
      {#key banner}
        {#if hero}<img src={banner} alt="" />{:else}<BlurImage src={banner} size={48} brightness={0.8} />{/if}
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
          <PlayButton gameId={game.id} large update />
          {#if game.id in runner.progress}
            <button class="ghost stop" onclick={() => runner.showInSteam(game.id)}>Afficher dans Steam</button>
          {/if}
          {#if game.updatePending && !game.notInstalled}
            <button class="ghost stop" onclick={() => runner.play(game.id)}><Icon name="play" size={15} />Jouer</button>
          {/if}
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
      {#if perDevice.length}
        <ul class="per-device" aria-label="Temps de jeu par PC">
          {#each perDevice as d (d.deviceId)}
            <li>
              <Icon name="monitor" size={15} />
              <span class="pd-name">{d.name}{#if d.here}<span class="pd-here"> · ce PC</span>{/if}</span>
              <span class="pd-last">{d.lastPlayed ? relativeDay(d.lastPlayed) : 'Jamais'}</span>
              <span class="pd-time num">{hoursLabel(d.playMs)}</span>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="chart-head">
        <span>14 derniers jours</span><span class="unit">heures par jour{allDevices ? ', tous tes PC' : ''}</span>
      </div>
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
        {#if link}
          <dt>Page du jeu</dt>
          <dd>
            <button
              class="link"
              title="Ouvrir {link} dans le navigateur"
              onclick={() => api.openGameLink(link).catch((e) => ui.toast(String(e), { error: true }))}
              ><Icon name="globe" size={14} />{linkDomain(link)}</button
            >
          </dd>
        {/if}
        {#if game.developer}
          <dt>Développeur</dt>
          <dd>{game.developer}</dd>
        {/if}
        {#if game.publisher && game.publisher !== game.developer}
          <dt>Éditeur</dt>
          <dd>{game.publisher}</dd>
        {/if}
        {#if game.released}
          <dt>Sortie</dt>
          <dd>{dateLabel(game.released)}</dd>
        {/if}
        {#if achievements}
          <dt>Succès</dt>
          <dd class="ach">
            <span class="num"
              >{#if achievements.total}{formatNumber(achievements.unlocked)} sur {formatNumber(achievements.total)}{:else}{formatNumber(
                  achievements.unlocked
                )} débloqué{achievements.unlocked > 1 ? 's' : ''}{/if}{#if achievements.gamerscoreTotal}
                · {formatNumber(achievements.gamerscore ?? 0)} G sur {formatNumber(achievements.gamerscoreTotal)}{/if} · {achPct} %</span
            >
            <span
              class="ach-bar"
              role="progressbar"
              aria-label="Succès débloqués"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={achPct}><span style:width="{achPct}%"></span></span
            >
          </dd>
        {/if}
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
      {#if offStore}
        <button class="act" onclick={() => { ui.modal = { kind: 'installLink', gameId: game.id }; }}
          ><Icon name="globe" size={17} />{link ? "Modifier le lien d'installation" : "Ajouter un lien d'installation"}</button
        >
      {/if}
      {#if !game.notInstalled}
        <button class="act" onclick={() => updateGame(game.id)}
          ><Icon name="refresh" size={17} />{game.updatePending ? 'Mettre à jour' : 'Rechercher des mises à jour'}</button
        >
        <button class="act" onclick={() => uninstallGame(game.id)}
          ><Icon name="package" size={17} />Désinstaller</button
        >
      {/if}
      {#if game.elsewhere}
        <button class="act" onclick={() => attachElsewhere(game.id)}
          ><Icon name="folder" size={17} />J'ai déjà ce jeu : choisir l'exécutable</button
        >
      {/if}
      <button class="act red" onclick={() => hideGame(game.id)}
        ><Icon name="eyeOff" size={17} />{game.elsewhere ? 'Masquer sur ce PC' : 'Masquer de la bibliothèque'}</button
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

  .banner img,
  .banner :global(canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    animation:
      hgFade 0.6s ease both,
      hgKen 14s ease-out forwards;
  }

  .fallback {
    position: absolute;
    inset: 0;
    filter: saturate(1.2) brightness(0.55);
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

  .per-device {
    list-style: none;
    margin: 12px 0 0;
    padding: 4px 14px;
    border-radius: 14px;
    background: rgb(var(--ink) / 0.04);
  }

  .per-device li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    font-size: 13px;
    color: var(--muted);
  }

  .per-device li + li {
    border-top: 1px solid rgb(var(--ink) / 0.06);
  }

  .pd-name {
    flex: 1;
    min-width: 0;
    color: var(--text);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pd-here {
    font-weight: 400;
    color: var(--muted);
  }

  .pd-time {
    min-width: 64px;
    text-align: right;
    color: var(--text);
    font-weight: 700;
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

  .link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--accent-text, var(--accent));
    font-size: 13px;
    text-align: left;
    word-break: break-all;
  }

  .link:hover {
    text-decoration: underline;
  }

  .ach-bar {
    display: block;
    height: 4px;
    margin-top: 7px;
    border-radius: 999px;
    background: rgb(var(--ink) / 0.1);
    overflow: hidden;
  }

  .ach-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
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
