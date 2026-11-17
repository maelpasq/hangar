<script lang="ts">
  // Signalements de comptes et de messages faits depuis l'app : à traiter ou rejeter. La sanction
  // se donne depuis la fiche du compte visé. Pas de maquette : composants des autres écrans.
  import { untrack } from 'svelte';
  import { api, type Report, type ReportList, type ReportStatus } from '../api';
  import Avatar from '../components/Avatar.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import Pill from '../components/Pill.svelte';
  import ReportBox from '../components/ReportBox.svelte';
  import { ago } from '../format';
  import { REPORT_STATUSES, kindLabel, reportStatusOf } from '../moderation';
  import { href, replace } from '../router.svelte';
  import { loadStats } from '../stats.svelte';

  let { statut }: { statut: string } = $props();

  let rows = $state<Report[] | null>(null);
  let counts = $state<ReportList['counts']>({});
  let more = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let busy = $state<string | null>(null);
  let seq = 0;

  async function load(s: string, before?: number) {
    const mine = ++seq;
    loading = true;
    failed = false;
    try {
      const res = await api.reports(s, before);
      if (mine !== seq) return;
      rows = before ? [...(rows ?? []), ...res.reports] : res.reports;
      counts = res.counts;
      more = res.more;
    } catch {
      if (mine === seq) failed = true;
    } finally {
      if (mine === seq) loading = false;
    }
  }

  $effect(() => {
    const s = statut;
    untrack(() => load(s));
  });

  async function set(r: Report, status: ReportStatus) {
    busy = r.id;
    try {
      await api.setReport(r.id, status);
      await load(statut);
      loadStats();
    } catch {
      failed = true;
    } finally {
      busy = null;
    }
  }

  const filters = [...REPORT_STATUSES.map((s) => ({ id: s.id as string, label: s.label })), { id: 'tous', label: 'Tous' }];
  const countOf = (id: string) =>
    id === 'tous' ? Object.values(counts).reduce((n, v) => n + (v ?? 0), 0) : (counts[id as ReportStatus] ?? 0);
</script>

<PageHeader title="Signalements" sub="Comptes et messages signalés depuis l’app. La sanction se donne depuis la fiche du compte." />

<div class="chips" role="tablist" aria-label="Filtrer par statut">
  {#each filters as f (f.id)}
    <button
      type="button"
      role="tab"
      class="chip"
      class:on={statut === f.id}
      aria-selected={statut === f.id}
      onclick={() => replace(href.signalements(f.id))}
    >
      {f.label}<span class="n">{countOf(f.id)}</span>
    </button>
  {/each}
</div>

{#if failed && !rows}
  <p class="error">Impossible de charger les signalements.</p>
{:else}
  <section class="card list" aria-label="Signalements">
    {#if !rows}
      <p class="empty">Chargement…</p>
    {:else}
      {#each rows as r (r.id)}
        {@const s = reportStatusOf(r.status)}
        <article class="item">
          <div class="head">
            <Avatar name={r.targetName ?? '?'} seed={r.targetId} size={38} />
            <div class="who">
              <span class="name">
                <a href={href.compte(r.targetId)}>{r.targetName ?? 'Compte supprimé'}</a>
                {#each r.targetSanctions as k (k)}
                  <Pill color="var(--danger)" label={kindLabel(k)} dot={false} />
                {/each}
              </span>
              <span class="meta">Signalé {ago(r.at)}</span>
            </div>
            <Pill color={s.color} label={s.label} />
          </div>
          <ReportBox reason={r.reason} excerpt={r.excerpt}>
            {#snippet meta()}
              par <a href={href.compte(r.reporterId)}>{r.reporterName ?? 'compte supprimé'}</a>
            {/snippet}
          </ReportBox>
          <div class="actions">
            <a class="btn" href={href.compte(r.targetId)}>Voir le compte</a>
            {#if r.status === 'ouvert'}
              <button class="btn" type="button" disabled={busy === r.id} onclick={() => set(r, 'traite')}>Marquer traité</button>
              <button class="btn" type="button" disabled={busy === r.id} onclick={() => set(r, 'rejete')}>Rejeter</button>
            {:else}
              <button class="btn" type="button" disabled={busy === r.id} onclick={() => set(r, 'ouvert')}>Rouvrir</button>
            {/if}
          </div>
        </article>
      {:else}
        <p class="empty">Aucun signalement pour ce filtre.</p>
      {/each}
      {#if failed}<p class="error">Le signalement n’a pas été modifié.</p>{/if}
      {#if more}
        <div class="foot">
          <button class="btn" type="button" disabled={loading} onclick={() => load(statut, rows?.at(-1)?.at)}>
            {loading ? 'Chargement…' : 'Charger les plus anciens'}
          </button>
        </div>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .list {
    padding: 8px 24px;
    display: flex;
    flex-direction: column;
  }

  .item {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px 0;
  }

  .item + .item {
    border-top: 1px solid var(--border-1);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .name {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 500;
  }

  .name a {
    color: var(--text);
    text-decoration: none;
  }

  .name a:hover {
    color: var(--accent-text);
  }

  .meta {
    font-size: 12px;
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .foot {
    display: flex;
    justify-content: center;
    padding: 14px 0 16px;
  }
</style>
