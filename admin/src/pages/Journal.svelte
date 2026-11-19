<script lang="ts">
  // Journal : toutes les actions du dashboard, des plus récentes aux plus anciennes.
  import Icon from '../../../src/lib/components/Icon.svelte';
  import { api, type LogRow } from '../api';
  import PageHeader from '../components/PageHeader.svelte';
  import Pill from '../components/Pill.svelte';
  import { badgeOf } from '../badges.svelte';
  import { actionColor, logDetail, when } from '../format';
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

  const targetLabel = (l: LogRow) =>
    l.targetName ??
    (l.targetId?.startsWith('bug:')
      ? `#${l.targetId.slice(4)} (supprimé)`
      : l.targetId?.startsWith('badge:')
        ? `Badge ${badgeOf(l.targetId.slice(6), typeof l.detail?.name === 'string' ? l.detail.name : undefined).name}`
        : 'Compte supprimé');
</script>

<PageHeader title="Journal" sub="Toutes les actions faites depuis le dashboard : qui, quoi, sur quel compte, quand.">
  {#snippet actions()}
    <button class="btn" type="button" disabled={loading} onclick={() => load()}><Icon name="refresh" size={16} />Actualiser</button>
  {/snippet}
</PageHeader>

{#if failed && !rows}
  <p class="error">Impossible de charger le journal.</p>
{:else}
  <section class="card log">
    {#if !rows}
      <p class="empty">Chargement…</p>
    {:else if !rows.length}
      <p class="empty">Aucune action pour l’instant.</p>
    {:else}
      <div class="wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Quand</th>
              <th scope="col">Action</th>
              <th scope="col">Cible</th>
              <th scope="col">Détail</th>
              <th scope="col">Par</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as l (l.id)}
              <tr>
                <td class="when">{when(l.at)}</td>
                <td><Pill color={actionColor(l.action)} label={l.action} dot={false} /></td>
                <td>
                  {#if l.targetId}
                    <a class="target" href={href.target(l.targetId)}>{targetLabel(l)}</a>
                  {/if}
                </td>
                <td class="detail">{logDetail(l)}</td>
                <td class="actor">{l.actor}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if more || failed}
        <div class="foot">
          {#if failed}<p class="error">Impossible de charger la suite.</p>{/if}
          {#if more}
            <button class="btn" type="button" disabled={loading} onclick={() => load(rows?.at(-1)?.at)}>
              {loading ? 'Chargement…' : 'Charger 50 lignes de plus'}
            </button>
          {/if}
        </div>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .log {
    padding: 18px 8px 8px;
  }

  .wrap {
    overflow-x: auto;
  }

  table {
    min-width: 760px;
  }

  .when {
    white-space: nowrap;
    color: var(--text-3);
    font-size: 13px;
  }

  .target {
    color: var(--text);
    text-decoration: none;
    font-weight: 500;
  }

  .target:hover {
    color: var(--accent-text);
  }

  .detail {
    color: var(--text-2);
    font-size: 13.5px;
  }

  .actor {
    color: var(--muted);
    font-size: 13px;
  }

  .foot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 14px 0 8px;
  }
</style>
