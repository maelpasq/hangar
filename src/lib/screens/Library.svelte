<script lang="ts">
  // Bibliothèque / Favoris / À installer / filtre store : tri, puces, grille (virtualisée au-delà de 150 jeux).
  import Chip from '../components/Chip.svelte';
  import StoreLogo from '../components/StoreLogo.svelte';
  import GameCard from '../components/GameCard.svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { STORES } from '../stores-meta';
  import { library, presentStores } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game, SortKey, StoreId } from '../types';
  import { formatNumber, hours, plural } from '../util/format';

  const VIRTUAL_FROM = 150;
  const MIN_CARD = 172;
  const GAP_X = 20;
  const GAP_Y = 26;
  /** Hauteur du nom + méta sous la jaquette. */
  const INFO_H = 48;

  const base = $derived(ui.favOnly ? library.favorites : ui.toInstall ? library.toInstall : library.installed);
  const counts = $derived.by(() => {
    const c: Partial<Record<StoreId, number>> = {};
    for (const g of base) c[g.store] = (c[g.store] ?? 0) + 1;
    return c;
  });
  const sort = $derived(library.state.sort);

  const list = $derived.by(() => {
    const l = ui.store === 'all' ? base : base.filter((g) => g.store === ui.store);
    const name = (g: Game) => library.name(g);
    const t = (g: Game) => library.totals(g.id);
    return [...l].sort((a, b) =>
      sort === 'az'
        ? name(a).localeCompare(name(b), 'fr')
        : sort === 'hours'
          ? t(b).playMs - t(a).playMs || name(a).localeCompare(name(b), 'fr')
          : t(b).lastPlayed - t(a).lastPlayed || name(a).localeCompare(name(b), 'fr')
    );
  });

  const title = $derived(
    ui.favOnly ? 'Favoris' : ui.toInstall ? 'À installer' : ui.store === 'all' ? 'Bibliothèque' : STORES[ui.store].label
  );
  const totalHours = $derived(hours(list.reduce((a, g) => a + library.totals(g.id).playMs, 0)));

  function setSort(s: SortKey) {
    library.state.sort = s;
    library.save();
  }

  // Virtualisation
  let scroller: HTMLDivElement | undefined = $state();
  let gridEl: HTMLDivElement | undefined = $state();
  let width = $state(0);
  let scrollTop = $state(0);
  let viewH = $state(800);
  let gridTop = $state(0);

  const virtual = $derived(list.length > VIRTUAL_FROM && width > 0);
  const cols = $derived(Math.max(1, Math.floor((width + GAP_X) / (MIN_CARD + GAP_X))));
  const cardW = $derived((width - (cols - 1) * GAP_X) / cols);
  const rowH = $derived(cardW * 1.5 + INFO_H + GAP_Y);
  const rows = $derived(Math.ceil(list.length / cols));
  const range = $derived.by(() => {
    if (!virtual) return { from: 0, to: list.length, padTop: 0, padBottom: 0 };
    const rel = scrollTop - gridTop;
    const first = Math.max(0, Math.floor(rel / rowH) - 2);
    const last = Math.min(rows, Math.ceil((rel + viewH) / rowH) + 2);
    return {
      from: first * cols,
      to: Math.min(list.length, last * cols),
      padTop: first * rowH,
      padBottom: Math.max(0, (rows - last) * rowH)
    };
  });

  $effect(() => {
    void list.length;
    if (gridEl && scroller) gridTop = gridEl.offsetTop;
  });
</script>

<div
  class="screen scroll page"
  bind:this={scroller}
  bind:clientHeight={viewH}
  onscroll={(e) => (scrollTop = (e.currentTarget as HTMLElement).scrollTop)}
>
  <div class="head">
    <div>
      <h1>{#if !ui.favOnly && !ui.toInstall && ui.store !== 'all'}<StoreLogo store={ui.store} size={26} glow />{/if} {title}</h1>
      {#if ui.toInstall}
        <p>{plural(list.length, 'jeu', 'jeux')} de tes launchers, prêts à installer</p>
      {:else}
        <p>{plural(list.length, 'jeu', 'jeux')} · {formatNumber(totalHours)} {totalHours > 1 ? 'heures' : 'heure'} de jeu au total</p>
      {/if}
    </div>
    <span class="grow"></span>
    <Segmented
      label="Trier"
      value={sort}
      onchange={setSort}
      options={[
        { value: 'recent', label: 'Récents' },
        { value: 'az', label: 'A-Z' },
        { value: 'hours', label: 'Temps de jeu' }
      ]}
    />
  </div>

  {#if base.length}
    <div class="chips" role="group" aria-label="Filtrer par store">
      <Chip on={ui.store === 'all'} color="var(--strong)" count={base.length} onclick={() => (ui.store = 'all')}>Tous</Chip>
      {#each presentStores(counts) as s (s)}
        <Chip on={ui.store === s} store={s} count={counts[s]} onclick={() => (ui.store = s)}
          >{STORES[s].label}</Chip
        >
      {/each}
    </div>
  {/if}

  {#if list.length}
    <div
      class="grid"
      bind:this={gridEl}
      bind:clientWidth={width}
      style:padding-top="{range.padTop}px"
      style:padding-bottom="{range.padBottom}px"
    >
      {#each list.slice(range.from, range.to) as g, i (g.id)}
        <GameCard game={g} index={virtual ? 0 : i} animate={!virtual || range.from === 0} />
      {/each}
    </div>
  {:else if ui.favOnly && !library.favorites.length}
    <div class="empty">
      <Icon name="star" size={28} />
      <strong>Aucun favori pour l'instant</strong>
      <span>Clique sur l'étoile d'une jaquette pour épingler un jeu ici.</span>
    </div>
  {:else if ui.toInstall}
    <div class="empty">
      <Icon name="download" size={28} />
      <strong>Rien à installer</strong>
      <span>Tous les jeux trouvés dans tes launchers sont déjà installés.</span>
    </div>
  {:else if !library.installed.length}
    <div class="empty">
      <strong>Ta bibliothèque est vide</strong>
      <span>Ajoute un jeu à la main ou un dossier qui contient tes jeux.</span>
      <button class="btn primary" onclick={() => { ui.modal = { kind: 'add' }; }}
        ><Icon name="plus" size={16} stroke={2} />Ajouter un jeu</button
      >
    </div>
  {:else}
    <div class="empty">
      <strong>Aucun jeu ici</strong>
      <span>Aucun jeu ne correspond à ce filtre.</span>
      <button class="btn" onclick={() => (ui.store = 'all')}>Voir tous les jeux</button>
    </div>
  {/if}
</div>

<style>
  .page {
    flex: 1;
    padding: 8px 28px 48px;
  }

  .head {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }

  h1 {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.9px;
  }

  .head p {
    margin-top: 6px;
    color: var(--muted);
  }

  .grow {
    flex: 1;
  }

  .chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 26px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
    gap: 26px 20px;
  }
</style>
