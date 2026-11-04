<script lang="ts">
  // Carrousel de l'accueil : fondu entre bannières, Ken Burns, défilement auto toutes les 6,5 s.
  import { art } from '../art.svelte';
  import { STORES } from '../stores-meta';
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';
  import { daysAgo, hoursLabel, relativeDay } from '../util/format';
  import Cover from './Cover.svelte';
  import FavButton from './FavButton.svelte';
  import PlayButton from './PlayButton.svelte';
  import StoreLogo from './StoreLogo.svelte';

  const PERIOD = 6500;

  let { games: all }: { games: Game[] } = $props();

  // Miniatures : 62 px + 10 px d'écart (48 px + 8 px en mode compact quand la place manque).
  // On garde au moins 440 px à gauche pour le titre et les boutons ; le carrousel ne montre
  // que les jeux dont la miniature tient, pour qu'aucune ne soit coupée.
  const COPY_MIN = 440;
  let width = $state(0);
  const room = $derived(width - 28 - 44 - COPY_MIN);
  const fitFor = (step: number, gap: number) => Math.max(1, Math.floor((room + gap) / step));
  const compact = $derived(!!width && fitFor(72, 10) < Math.min(5, all.length));
  const step = $derived(compact ? 56 : 72);
  const gap = $derived(compact ? 8 : 10);
  const fit = $derived(width ? fitFor(step, gap) : all.length);
  const games = $derived(all.slice(0, Math.min(all.length, fit)));
  const thumbsWidth = $derived(games.length * step - gap);
  const copyMax = $derived(
    width ? Math.max(360, Math.min(560, width - 44 - (games.length > 1 ? thumbsWidth + 28 + 32 : 44))) : 560
  );

  // Le jeu affiché est suivi par son identifiant : quand la liste se réordonne (un jeu vient
  // d'être lancé et devient le plus récent), le carrousel ne saute pas sur un autre jeu.
  let activeId = $state<string | null>(null);
  const idx = $derived(Math.max(0, games.findIndex((g) => g.id === activeId)));
  let hover = $state(false);
  let focusInside = $state(false);
  let progress = 0;

  const paused = $derived(hover || focusInside || !ui.windowFocused || !!ui.query || !!runner.launching);
  const active = $derived(games[idx]);

  // Ambiance : la bannière du jeu mis en avant.
  $effect(() => {
    if (active) ui.ambient = art.hero(active) ?? null;
  });

  $effect(() => {
    if (paused || games.length < 2) return;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      progress += now - last;
      last = now;
      if (progress >= PERIOD) {
        progress = 0;
        activeId = games[(idx + 1) % games.length].id;
      }
    }, 100);
    return () => clearInterval(t);
  });

  function pick(i: number) {
    progress = 0;
    activeId = games[i].id;
  }

  function meta(g: Game): string {
    const t = library.totals(g.id);
    const parts: string[] = [];
    const genre = library.genre(g);
    if (genre) parts.push(genre);
    if (t.playMs > 0) parts.push(`${hoursLabel(t.playMs)} de jeu`);
    if (t.lastPlayed) parts.push(`dernière session ${relativeDay(t.lastPlayed).toLowerCase()}`);
    else if (t.playMs <= 0) parts.push('Pas encore lancé avec Hangar');
    return parts.join(' · ');
  }
</script>

<section
  class="hero on-dark"
  class:paused
  aria-roledescription="carrousel"
  aria-label="Jeux mis en avant"
  bind:clientWidth={width}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => (hover = false)}
  onfocusin={() => (focusInside = true)}
  onfocusout={() => (focusInside = false)}
>
  {#each games as g, i (g.id)}
    {@const src = art.hero(g)}
    {#if src}
      <img class="heroimg" class:on={i === idx} {src} alt="" decoding="async" />
    {/if}
  {/each}
  <div class="shade" aria-hidden="true"></div>
  {#each games as g, i (g.id)}
    {@const t = library.totals(g.id)}
    {@const st = STORES[g.store]}
    <div class="copy" class:on={i === idx} aria-hidden={i !== idx} inert={i !== idx} style:max-width="{copyMax}px">
      <div class="pill">
        <StoreLogo store={g.store} size={14} />{st.label} · {!t.lastPlayed
          ? 'À découvrir'
          : daysAgo(t.lastPlayed) <= 2
            ? 'Reprendre'
            : 'À redécouvrir'}
      </div>
      <h1>{library.name(g)}</h1>
      <p>{meta(g)}</p>
      <div class="actions">
        <PlayButton gameId={g.id} label={runner.isRunning(g.id) ? 'En cours' : 'Jouer'} />
        <button class="ghost see" onclick={() => ui.open(g.id)}>Voir la fiche</button>
        <FavButton gameId={g.id} variant="ghost" />
      </div>
    </div>
  {/each}
  {#if games.length > 1}
  <div class="thumbs" class:compact role="tablist" aria-label="Choisir un jeu">
    {#each games as g, i (g.id)}
      <button
        class="thumb"
        class:on={i === idx}
        role="tab"
        aria-selected={i === idx}
        aria-label={library.name(g)}
        onclick={() => pick(i)}
      >
        <Cover game={g} showName={false} eager />
        <span class="bar"></span>
      </button>
    {/each}
  </div>
  {/if}
</section>

<style>
  .hero {
    position: relative;
    height: 440px;
    border-radius: var(--r-hero);
    overflow: hidden;
    background: #12141b;
    isolation: isolate;
    box-shadow: 0 30px 80px -40px rgba(0, 0, 0, 0.9);
  }

  .heroimg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 1.1s ease;
    transform: scale(1.04);
  }

  .heroimg.on {
    opacity: 1;
    animation: hgKen 9s ease-out forwards;
  }

  .shade {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(10, 11, 15, 0.94) 0%, rgba(10, 11, 15, 0.6) 42%, rgba(10, 11, 15, 0) 75%),
      linear-gradient(0deg, rgba(10, 11, 15, 0.85) 0%, rgba(10, 11, 15, 0) 50%);
  }

  .copy {
    position: absolute;
    left: 44px;
    bottom: 44px;
    max-width: 560px;
    opacity: 0;
    transform: translateY(14px);
    transition:
      opacity 0.6s ease,
      transform 0.7s var(--ease);
    pointer-events: none;
  }

  .copy.on {
    opacity: 1;
    transform: none;
    pointer-events: auto;
    transition-delay: 0.15s;
  }

  h1 {
    margin: 16px 0 10px;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    padding-bottom: 0.06em;
    font-size: 54px;
    line-height: 1;
    font-weight: 800;
    letter-spacing: -1.6px;
    text-wrap: balance;
  }

  p {
    margin: 0 0 24px;
    color: var(--text-2);
    font-size: 15px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .see {
    height: 50px;
    padding: 0 20px;
    border-radius: 15px;
  }

  .thumbs {
    position: absolute;
    right: 28px;
    bottom: 30px;
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }

  .thumb {
    position: relative;
    width: 62px;
    height: 88px;
    border-radius: 10px;
    overflow: hidden;
    opacity: 0.55;
    transition:
      opacity 0.25s,
      transform 0.25s,
      box-shadow 0.25s;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
  }

  .compact {
    gap: 8px;
  }

  .compact .thumb {
    width: 48px;
    height: 68px;
    border-radius: 8px;
  }

  .thumb:hover {
    opacity: 0.9;
    transform: translateY(-3px);
  }

  .thumb.on {
    opacity: 1;
    box-shadow: 0 0 0 2px #fff;
    transform: translateY(-4px);
  }

  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: 0;
    background: #fff;
  }

  .thumb.on .bar {
    animation: hgBar 6.5s linear forwards;
  }

  .paused .thumb.on .bar,
  .paused .heroimg.on {
    animation-play-state: paused;
  }

  @media (max-width: 1180px) {
    h1 {
      font-size: 44px;
    }
  }
</style>
