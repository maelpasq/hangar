<script lang="ts">
  // Accueil : carrousel, Reprendre, Favoris, Les plus joués.
  import { art } from '../art.svelte';
  import GameCard from '../components/GameCard.svelte';
  import HeroCarousel from '../components/HeroCarousel.svelte';
  import Icon from '../components/Icon.svelte';
  import TopPlayedList from '../components/TopPlayedList.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';
  import { plural } from '../util/format';

  const MAX_FEATURED = 8;

  const vis = $derived(library.visible);
  const played = $derived(
    vis
      .filter((g) => library.totals(g.id).lastPlayed > 0)
      .sort((a, b) => library.totals(b.id).lastPlayed - library.totals(a.id).lastPlayed)
  );
  const byHours = $derived(
    vis
      .filter((g) => library.totals(g.id).playMs > 0)
      .sort((a, b) => library.totals(b.id).playMs - library.totals(a.id).playMs)
  );

  // Candidats du carrousel : derniers lancés, favoris, plus joués (ou alphabétique au premier lancement).
  const candidates = $derived.by(() => {
    const list: Game[] = played.length
      ? [...played, ...library.favorites, ...byHours]
      : [...vis].sort((a, b) => library.name(a).localeCompare(library.name(b), 'fr'));
    const seen = new Set<string>();
    return list.filter((g) => art.mayHaveHero(g) && !seen.has(g.id) && seen.add(g.id));
  });

  // On n'ajoute un jeu qu'une fois les bannières des précédents connues : l'ordre reste stable.
  const hero = $derived.by(() => {
    const out: Game[] = [];
    let pending = false;
    for (const g of candidates) {
      if (out.length >= MAX_FEATURED) break;
      const h = art.hero(g);
      if (h === undefined) {
        pending = true;
        break;
      }
      if (h) out.push(g);
    }
    return { games: out, pending };
  });
  const featured = $derived(hero.games);

  $effect(() => {
    if (!featured.length && !hero.pending) ui.ambient = null;
  });

  const recent = $derived(played.slice(0, 9));
  const top = $derived(byHours.slice(0, 6));
</script>

<div class="screen scroll page">
  {#if !vis.length}
    <div class="empty first">
      {#if library.scanning || !library.ready}
        <Icon name="refresh" size={28} class="spin" />
        <strong>Recherche de tes jeux…</strong>
        <span>Hangar parcourt tes launchers, ça ne prend que quelques secondes.</span>
      {:else}
        <strong>Ta bibliothèque est vide</strong>
        <span>Aucun jeu n'a été trouvé. Ajoute un jeu ou un dossier de jeux.</span>
        <button class="btn primary" onclick={() => { ui.modal = { kind: 'add' }; }}
          ><Icon name="plus" size={16} stroke={2} />Ajouter un jeu</button
        >
      {/if}
    </div>
  {:else}
    {#if featured.length}
      <HeroCarousel games={featured} />
    {:else if hero.pending}
      <div class="hero-ph" aria-hidden="true"></div>
    {/if}

    {#if recent.length}
      <div class="section-head first-head">
        <h2>Reprendre</h2>
        <span class="sub">Tes dernières sessions</span>
      </div>
      <div class="row">
        {#each recent as g, i (g.id)}
          <GameCard game={g} index={i} width={158} meta="last" variant="row" />
        {/each}
      </div>
    {/if}

    {#if library.favorites.length}
      <div class="section-head" class:first-head={!recent.length}>
        <h2>Favoris</h2>
        <span class="sub">{plural(library.favorites.length, 'jeu épinglé', 'jeux épinglés')}</span>
      </div>
      <div class="row">
        {#each library.favorites as g, i (g.id)}
          <GameCard game={g} index={i} width={158} meta="store" variant="row" />
        {/each}
      </div>
    {/if}

    {#if top.length}
      <div class="section-head center">
        <h2>Les plus joués</h2>
        <span class="grow"></span>
        <button class="link" onclick={() => ui.libraryAll()}>Toute la bibliothèque</button>
      </div>
      <TopPlayedList games={top} />
    {:else}
      <div class="section-head center" class:first-head={!recent.length && !library.favorites.length}>
        <h2>Ta bibliothèque</h2>
        <span class="grow"></span>
        <button class="link" onclick={() => ui.libraryAll()}>Toute la bibliothèque</button>
      </div>
      <div class="row">
        {#each vis.slice(0, 12) as g, i (g.id)}
          <GameCard game={g} index={i} width={158} meta="store" variant="row" />
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    flex: 1;
    padding: 4px 28px 48px;
  }

  .first-head {
    margin-top: 38px;
  }

  .center {
    align-items: center;
  }

  .grow {
    flex: 1;
  }

  .hero-ph {
    height: 440px;
    border-radius: var(--r-hero);
    background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.025) 50%, transparent 70%) #12141b;
    background-size: 200% 100%;
    animation: hgShimmer 1.8s linear infinite;
  }

  .first {
    height: 100%;
    justify-content: center;
  }
</style>
