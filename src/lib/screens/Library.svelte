<script lang="ts">
  // Bibliothèque / Favoris / À installer / Mises à jour / collection / filtre store : tri, filtres, grille (virtualisée au-delà de 150 jeux).
  import Chip from '../components/Chip.svelte';
  import Dropdown from '../components/Dropdown.svelte';
  import StoreLogo from '../components/StoreLogo.svelte';
  import GameCard from '../components/GameCard.svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { STORES } from '../stores-meta';
  import { library, presentStores } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game, SortKey, StoreId } from '../types';
  import { formatNumber, hours, plural, sizeLabel } from '../util/format';
  import { isLinux } from '../util/platform';
  const VIRTUAL_FROM = 150;
  const MIN_CARD = 172;
  const GAP_X = 20;
  const GAP_Y = 26;
  /** Hauteur du nom + méta sous la jaquette. */
  const INFO_H = 48;

  const coll = $derived(library.collection(ui.collection));
  const base = $derived(
    ui.favOnly
      ? library.favorites
      : ui.toInstall
        ? library.toInstall
        : ui.updates
          ? library.updates
        : ui.collection
          ? library.inCollection(ui.collection)
          : library.installed
  );

  // Filtres de genre et de temps de jeu (le genre est cherché une fois par jeu, en cache).
  type PlayFilter = 'all' | 'never' | 'lt10' | 'gt10';
  let genre = $state('');
  let play = $state<PlayFilter>('all');
  const genres = $derived(
    [...new Set(base.map((g) => library.genre(g)).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'fr'))
  );
  const PLAY_FILTERS: { value: PlayFilter; label: string }[] = [
    { value: 'all', label: 'Tout temps de jeu' },
    { value: 'never', label: 'Jamais joué' },
    { value: 'lt10', label: 'Moins de 10 h' },
    { value: 'gt10', label: '10 h et plus' }
  ];
  function playOk(g: Game): boolean {
    const t = library.totals(g.id);
    const h = t.playMs / 3_600_000;
    if (play === 'never') return !t.playMs && !t.launches;
    if (play === 'lt10') return h > 0 && h < 10;
    if (play === 'gt10') return h >= 10;
    return true;
  }
  // Sous Linux, « À installer » peut ne montrer que les jeux qui y tournent.
  let linuxOnly = $state(false);
  const linuxFilter = $derived(isLinux && ui.toInstall && linuxOnly);
  const filtering = $derived(!!genre || play !== 'all' || linuxFilter);
  const counts = $derived.by(() => {
    const c: Partial<Record<StoreId, number>> = {};
    for (const g of base) c[g.store] = (c[g.store] ?? 0) + 1;
    return c;
  });
  const sort = $derived(library.state.sort);
  const updBytes = $derived(ui.updates ? base.reduce((n, g) => n + (g.updateBytes ?? 0), 0) : 0);

  const list = $derived.by(() => {
    const l = base.filter(
      (g) =>
        (ui.store === 'all' || g.store === ui.store) &&
        (!genre || library.genre(g) === genre) &&
        playOk(g) &&
        (!linuxFilter || !!g.linux)
    );
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
    ui.favOnly
      ? 'Favoris'
      : ui.toInstall
        ? 'À installer'
        : ui.updates
          ? 'Mises à jour'
        : coll
          ? coll.name
          : ui.store === 'all'
            ? 'Bibliothèque'
            : STORES[ui.store].label
  );

  // Collection : renommer sur place, supprimer avec annulation.
  let renaming = $state(false);
  let newName = $state('');
  function startRename() {
    newName = coll?.name ?? '';
    renaming = true;
  }
  function saveRename(e: Event) {
    e.preventDefault();
    if (coll) library.renameCollection(coll.id, newName);
    renaming = false;
  }
  function deleteColl() {
    if (!coll) return;
    const c = $state.snapshot(coll);
    library.deleteCollection(c.id);
    ui.libraryAll();
    ui.toast(`Collection « ${c.name} » supprimée`, {
      action: {
        label: 'Annuler',
        run: () => {
          library.state.collections = [...library.state.collections, c];
          library.save();
        }
      }
    });
  }
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
      {#if renaming}
        <form class="rename" onsubmit={saveRename}>
          <label class="sr-only" for="coll-name">Nom de la collection</label>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            id="coll-name"
            bind:value={newName}
            maxlength="60"
            autofocus
            onkeydown={(e) => e.key === 'Escape' && (renaming = false)}
          />
          <button class="btn primary" type="submit">Enregistrer</button>
          <button class="btn" type="button" onclick={() => (renaming = false)}>Annuler</button>
        </form>
      {:else}
        <h1>
          {#if coll}<Icon name="layers" size={26} />{:else if !ui.favOnly && !ui.toInstall && !ui.updates && ui.store !== 'all'}<StoreLogo
              store={ui.store}
              size={26}
              glow
            />{/if}
          {title}
        </h1>
      {/if}
      {#if ui.toInstall}
        <p>{plural(list.length, 'jeu', 'jeux')} de tes launchers, prêts à installer</p>
      {:else if ui.updates}
        <p>{plural(list.length, 'jeu', 'jeux')} à mettre à jour{updBytes ? ` · ${sizeLabel(updBytes)} à télécharger` : ''}</p>
      {:else}
        <p>{plural(list.length, 'jeu', 'jeux')} · {formatNumber(totalHours)} {totalHours > 1 ? 'heures' : 'heure'} de jeu au total</p>
      {/if}
    </div>
    <span class="grow"></span>
    {#if coll && !renaming}
      <button class="btn" onclick={startRename}><Icon name="edit" size={15} />Renommer</button>
      <button class="btn danger" onclick={deleteColl}><Icon name="trash" size={15} />Supprimer</button>
    {/if}
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
    <div class="filters">
      <div class="chips" role="group" aria-label="Filtrer par store">
        <Chip on={ui.store === 'all'} color="var(--strong)" count={base.length} onclick={() => (ui.store = 'all')}>Tous</Chip>
        {#each presentStores(counts) as s (s)}
          <Chip on={ui.store === s} store={s} count={counts[s]} onclick={() => (ui.store = s)}
            >{STORES[s].label}</Chip
          >
        {/each}
      </div>
      <span class="grow"></span>
      {#if isLinux && ui.toInstall}
        <Chip on={linuxOnly} color="var(--success)" count={base.filter((g) => g.linux).length} onclick={() => (linuxOnly = !linuxOnly)}
          >Compatibles Linux</Chip
        >
      {/if}
      {#if genres.length}
        <Dropdown label="Genre" bind:value={genre} options={[{ value: '', label: 'Tous les genres' }, ...genres.map((g) => ({ value: g, label: g }))]} />
      {/if}
      {#if !ui.toInstall}
        <Dropdown label="Temps de jeu" bind:value={play} options={PLAY_FILTERS} />
      {/if}
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
  {:else if coll && !base.length}
    <div class="empty">
      <Icon name="layers" size={28} />
      <strong>Collection vide</strong>
      <span>Fais un clic droit sur un jeu, puis « Collections », pour l'ajouter ici.</span>
    </div>
  {:else if filtering && base.length}
    <div class="empty">
      <strong>Aucun jeu ici</strong>
      <span>Aucun jeu ne correspond à ces filtres.</span>
      <button
        class="btn"
        onclick={() => {
          genre = '';
          play = 'all';
          linuxOnly = false;
          ui.store = 'all';
        }}>Retirer les filtres</button
      >
    </div>
  {:else if ui.updates}
    <div class="empty">
      <Icon name="refresh" size={28} />
      <strong>Tout est à jour</strong>
      <span>Aucun jeu n'attend de mise à jour dans tes launchers.</span>
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

  .filters {
    display: flex;
    align-items: center;
    gap: 10px 16px;
    flex-wrap: wrap;
    margin-bottom: 26px;
  }

  .chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .rename {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .rename input {
    height: 44px;
    min-width: 280px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid var(--border-3);
    background: var(--surface-2);
    color: var(--strong);
    font: inherit;
    font-size: 22px;
    font-weight: 700;
  }

  h1 {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
    gap: 26px 20px;
  }
</style>
