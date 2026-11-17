<script lang="ts">
  // Bugs signalés depuis Hangar : filtre par statut (avec leur nombre), recherche, liste et fiche
  // du bug choisi à côté (le premier de la liste tant qu'aucun n'est choisi).
  import { untrack } from 'svelte';
  import Icon from '../../../src/lib/components/Icon.svelte';
  import { api, type BugList, type BugRow } from '../api';
  import { FILTERS, OPEN_IDS, SYSTEMS, statusOf } from '../bug-status';
  import PageHeader from '../components/PageHeader.svelte';
  import Pill from '../components/Pill.svelte';
  import { ago } from '../format';
  import { href, replace, type Route } from '../router.svelte';
  import { loadStats } from '../stats.svelte';
  import Bug from './Bug.svelte';

  let { route }: { route: Extract<Route, { page: 'bugs' | 'bug' }> } = $props();

  const statut = $derived(route.statut);
  const q = $derived(route.q);
  let text = $state(untrack(() => route.q));
  let rows = $state<BugRow[] | null>(null);
  let counts = $state<BugList['counts']>({});
  let more = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let seq = 0;

  async function load(s: string, query: string, before?: number) {
    const mine = ++seq;
    loading = true;
    failed = false;
    try {
      const res = await api.bugs(s, query, before);
      if (mine !== seq) return;
      rows = before ? [...(rows ?? []), ...res.bugs] : res.bugs;
      counts = res.counts;
      more = res.more;
    } catch {
      if (mine === seq) failed = true;
    } finally {
      if (mine === seq) loading = false;
    }
  }

  // L'adresse mène : filtre et recherche y sont, la liste suit.
  $effect(() => {
    const s = statut;
    const query = q.trim();
    untrack(() => load(s, query));
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(() => replace(href.bugs(statut, text.trim(), route.page === 'bug' ? route.id : undefined)), 250);
  }

  const countOf = (id: string) =>
    id === 'tous'
      ? Object.values(counts).reduce((n, v) => n + (v ?? 0), 0)
      : id === 'ouverts'
        ? OPEN_IDS.reduce((n, s) => n + (counts[s] ?? 0), 0)
        : (counts[id as keyof typeof counts] ?? 0);

  const selected = $derived(route.page === 'bug' ? route.id : (rows?.[0]?.id ?? null));

  // Après un enregistrement : la liste, les compteurs et la barre latérale suivent.
  function onSaved() {
    load(statut, q.trim());
    loadStats();
  }
</script>

<PageHeader title="Bugs" sub="Signalements envoyés par le bouton insecte de l’app.">
  {#snippet actions()}
    <form class="search" role="search" onsubmit={(e) => e.preventDefault()}>
      <Icon name="search" size={17} />
      <label for="bq" class="sr-only">Rechercher un bug</label>
      <input id="bq" type="search" placeholder="Numéro ou mots-clés" autocomplete="off" bind:value={text} oninput={onInput} />
    </form>
  {/snippet}
</PageHeader>

<div class="chips" role="tablist" aria-label="Filtrer par statut">
  {#each FILTERS as f (f.id)}
    <button
      type="button"
      role="tab"
      class="chip"
      class:on={statut === f.id}
      aria-selected={statut === f.id}
      onclick={() => replace(href.bugs(f.id, text.trim()))}
    >
      {f.label}<span class="n">{countOf(f.id)}</span>
    </button>
  {/each}
</div>

{#if failed && !rows}
  <p class="error">Impossible de charger les bugs.</p>
{:else}
  <div class="split">
    <section class="card list" aria-label="Liste des bugs">
      {#if !rows}
        <p class="empty">Chargement…</p>
      {:else}
        {#each rows as b (b.id)}
          {@const s = statusOf(b.status)}
          <a
            class="row"
            class:on={b.id === selected}
            href={href.bug(b.id, statut, q)}
            aria-current={b.id === selected ? 'true' : undefined}
          >
            <span class="mono num">#{b.id}</span>
            <span class="row-body">
              <span class="row-title">{b.title}</span>
              <span class="meta">
                <span>{b.version}</span><span aria-hidden="true">·</span><span>{SYSTEMS[b.os] ?? b.os}</span><span
                  aria-hidden="true">·</span
                ><span>{ago(b.createdAt)}</span>
                {#if b.capture}
                  <span class="shot" title="Capture jointe"><Icon name="image" size={13} /></span>
                  <span class="sr-only">(capture jointe)</span>
                {/if}
              </span>
            </span>
            <Pill color={s.color} label={s.label} />
          </a>
        {:else}
          <p class="empty">Aucun bug pour ce filtre.</p>
        {/each}
        {#if more}
          <button class="btn more" type="button" disabled={loading} onclick={() => load(statut, q.trim(), rows?.at(-1)?.id)}>
            {loading ? 'Chargement…' : 'Charger les plus anciens'}
          </button>
        {/if}
        {#if failed}<p class="error">Impossible de charger la suite.</p>{/if}
      {/if}
    </section>

    <section class="card fiche" aria-label="Fiche du bug">
      {#if selected !== null}
        {#key selected}
          <Bug id={selected} {onSaved} />
        {/key}
      {:else if rows}
        <p class="empty">Aucun bug à afficher.</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .search {
    width: 300px;
    max-width: 100%;
  }

  .split {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
  }

  .list {
    flex: 1 1 400px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .fiche {
    flex: 1.25 1 460px;
    padding: 24px;
  }

  .num {
    width: 36px;
    color: var(--muted-2);
  }

  .list .row-body {
    gap: 4px;
  }

  .list .row-title {
    font-weight: 500;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
    white-space: nowrap;
    font-size: 12px;
    color: var(--muted);
  }

  .shot {
    display: inline-flex;
    color: var(--text-3);
  }

  .more {
    align-self: center;
    margin: 8px 0 4px;
  }
</style>
