<script lang="ts">
  // Journal : toutes les actions du dashboard, des plus récentes aux plus anciennes.
  import { api, type LogRow } from '../api';
  import { actionLabel, dateTime } from '../format';
  import { href } from '../router.svelte';

  let rows = $state<LogRow[] | null>(null);
  let more = $state(false);
  let loading = $state(false);
  let failed = $state(false);

  async function load(before?: number) {
    loading = true;
    failed = false;
    try {
      const res = await api.log(before);
      rows = [...(before ? (rows ?? []) : []), ...res.log];
      more = res.more;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }
  load();
</script>

<header>
  <h1>Journal</h1>
  <p class="muted">Chaque action faite depuis ce dashboard.</p>
</header>

{#if failed && !rows}
  <p class="error">Impossible de charger le journal.</p>
{:else if !rows}
  <p class="muted">Chargement…</p>
{:else if !rows.length}
  <p class="empty">Aucune action pour l'instant.</p>
{:else}
  <div class="card list">
    <ul>
      {#each rows as l (l.id)}
        <li>
          <span class="when muted">{dateTime(l.at)}</span>
          <span class="what">
            {actionLabel(l)}
            {#if l.targetId}
              ·
              <a href={href.target(l.targetId)}>{l.targetName ?? (l.targetId.startsWith('bug:') ? 'bug supprimé' : 'compte supprimé')}</a>
            {/if}
          </span>
          <span class="actor muted">{l.actor}</span>
        </li>
      {/each}
    </ul>
  </div>
  {#if more}
    <button class="btn more" type="button" disabled={loading} onclick={() => load(rows?.at(-1)?.at)}>
      {loading ? 'Chargement…' : 'Plus ancien'}
    </button>
  {/if}
  {#if failed}<p class="error">Impossible de charger la suite.</p>{/if}
{/if}

<style>
  header {
    margin-bottom: 20px;
  }

  header p {
    margin: 6px 0 0;
  }

  .list {
    padding: 4px 18px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr) auto;
    gap: 16px;
    padding: 11px 0;
    border-top: 1px solid var(--border-1);
  }

  li:first-child {
    border-top: 0;
  }

  .what {
    color: var(--text-soft);
  }

  .what a {
    color: var(--strong);
    font-weight: 550;
  }

  .when,
  .actor {
    font-size: 12.5px;
  }

  .more {
    margin-top: 14px;
  }

  @media (max-width: 760px) {
    li {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }
</style>
