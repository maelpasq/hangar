<script lang="ts">
  // Bugs signalés depuis Hangar : filtre par statut (avec leur nombre), recherche, liste.
  import { untrack } from 'svelte';
  import Icon from '../../../src/lib/components/Icon.svelte';
  import { api, type BugList, type BugRow } from '../api';
  import { FILTERS, OPEN_IDS, SYSTEMS, statusOf } from '../bug-status';
  import { ago } from '../format';
  import { href, replace } from '../router.svelte';

  let { statut, q }: { statut: string; q: string } = $props();

  let text = $state(untrack(() => q));
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
    timer = setTimeout(() => replace(href.bugs(statut, text.trim())), 250);
  }

  const countOf = (id: string) =>
    id === 'tous'
      ? Object.values(counts).reduce((n, v) => n + (v ?? 0), 0)
      : id === 'ouverts'
        ? OPEN_IDS.reduce((n, s) => n + (counts[s] ?? 0), 0)
        : (counts[id as keyof typeof counts] ?? 0);
</script>

<header>
  <h1>Bugs</h1>
  <p class="muted">Signalés depuis le bouton insecte de Hangar.</p>
</header>

<div class="tools">
  <div class="filters" role="group" aria-label="Filtrer par statut">
    {#each FILTERS as f (f.id)}
      <button
        type="button"
        class="chip"
        class:on={statut === f.id}
        aria-pressed={statut === f.id}
        onclick={() => replace(href.bugs(f.id, text.trim()))}
      >
        {f.label}
        <span class="n">{countOf(f.id)}</span>
      </button>
    {/each}
  </div>
  <form class="search" role="search" onsubmit={(e) => e.preventDefault()}>
    <label for="bq" class="sr-only">Chercher un bug</label>
    <Icon name="search" size={16} />
    <input id="bq" type="search" placeholder="Numéro ou mots" autocomplete="off" bind:value={text} oninput={onInput} />
  </form>
</div>

{#if failed && !rows}
  <p class="error">Impossible de charger les bugs.</p>
{:else if !rows}
  <p class="muted">Chargement…</p>
{:else if !rows.length}
  <p class="empty">Aucun bug ici.</p>
{:else}
  <div class="card list">
    <table>
      <thead>
        <tr>
          <th scope="col">N°</th>
          <th scope="col">Titre</th>
          <th scope="col">Statut</th>
          <th scope="col">Version</th>
          <th scope="col">Système</th>
          <th scope="col">Signalé</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as b (b.id)}
          {@const s = statusOf(b.status)}
          <tr>
            <td class="num">#{b.id}</td>
            <td class="title">
              <a href={href.bug(b.id)}>{b.title}</a>
              {#if b.capture}
                <span class="shot" title="Capture jointe"><Icon name="image" size={14} /></span>
                <span class="sr-only">(capture jointe)</span>
              {/if}
            </td>
            <td>
              <span class="pill" style:--c={s.color}>{s.label}{b.fixedIn ? ` · ${b.fixedIn}` : ''}</span>
            </td>
            <td class="soft">{b.version}</td>
            <td class="soft">{SYSTEMS[b.os] ?? b.os}</td>
            <td class="soft">{ago(b.createdAt)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if more}
    <button class="btn more" type="button" disabled={loading} onclick={() => load(statut, q.trim(), rows?.at(-1)?.id)}>
      {loading ? 'Chargement…' : 'Plus anciens'}
    </button>
  {/if}
  {#if failed}<p class="error">Impossible de charger la suite.</p>{/if}
{/if}

<style>
  header {
    margin-bottom: 18px;
  }

  header p {
    margin: 6px 0 0;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 12px;
    border-radius: 99px;
    border: 1px solid var(--border-2);
    background: var(--surface-1);
    color: var(--text-3);
    cursor: pointer;
    font-weight: 500;
  }

  .chip:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .chip.on {
    background: var(--accent-soft);
    border-color: var(--accent-ring);
    color: var(--strong);
  }

  .n {
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 260px;
    height: 36px;
    padding: 0 12px;
    border-radius: var(--r-btn);
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--muted);
  }

  .search:focus-within {
    border-color: var(--accent-ring);
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    outline: none;
    color: var(--text);
  }

  .list {
    padding: 6px 8px;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    padding: 10px 12px;
  }

  td {
    padding: 10px 12px;
    border-top: 1px solid var(--border-1);
    white-space: nowrap;
  }

  tbody tr:hover {
    background: var(--surface-1);
  }

  .num {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .title {
    white-space: normal;
    min-width: 260px;
  }

  .title a {
    color: var(--strong);
    font-weight: 550;
    text-decoration: none;
  }

  .title a:hover {
    text-decoration: underline;
  }

  .shot {
    display: inline-flex;
    vertical-align: -2px;
    margin-left: 6px;
    color: var(--muted);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border-radius: 99px;
    font-size: 12px;
    font-weight: 550;
    color: var(--text-soft);
    background: color-mix(in srgb, var(--c) 16%, transparent);
  }

  .pill::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
  }

  .soft {
    color: var(--text-3);
  }

  .more {
    margin-top: 14px;
  }

  @media (max-width: 760px) {
    .search {
      width: 100%;
    }
  }
</style>
