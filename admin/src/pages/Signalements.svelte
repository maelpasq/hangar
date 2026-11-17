<script lang="ts">
  // Signalements de comptes et de messages faits depuis l'app : à traiter ou rejeter. La sanction
  // se donne depuis la fiche du compte visé.
  import { untrack } from 'svelte';
  import { api, type Report, type ReportList, type ReportStatus } from '../api';
  import { dateTime } from '../format';
  import { REPORT_STATUSES, kindLabel, reportStatusOf } from '../moderation';
  import { href, replace } from '../router.svelte';

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

<header>
  <h1>Signalements</h1>
  <p class="muted">Comptes et messages signalés depuis l'app. La sanction se donne depuis la fiche du compte.</p>
</header>

<div class="filters" role="group" aria-label="Filtrer par statut">
  {#each filters as f (f.id)}
    <button type="button" class="chip" class:on={statut === f.id} aria-pressed={statut === f.id} onclick={() => replace(href.signalements(f.id))}>
      {f.label}
      <span class="n">{countOf(f.id)}</span>
    </button>
  {/each}
</div>

{#if failed && !rows}
  <p class="error">Impossible de charger les signalements.</p>
{:else if !rows}
  <p class="muted">Chargement…</p>
{:else if !rows.length}
  <p class="empty">Aucun signalement ici.</p>
{:else}
  <ul class="list">
    {#each rows as r (r.id)}
      {@const s = reportStatusOf(r.status)}
      <li class="card">
        <div class="top">
          <div class="who">
            <a class="target" href={href.compte(r.targetId)}>{r.targetName ?? 'Compte supprimé'}</a>
            {#each r.targetSanctions as k (k)}
              <span class="tag">{kindLabel(k)}</span>
            {/each}
            <span class="muted">
              signalé par
              <a href={href.compte(r.reporterId)}>{r.reporterName ?? 'compte supprimé'}</a>,
              {dateTime(r.at)}
            </span>
          </div>
          <span class="pill" style:--c={s.color}>{s.label}</span>
        </div>
        <p class="reason">{r.reason}</p>
        {#if r.excerpt}<blockquote>{r.excerpt}</blockquote>{/if}
        <div class="actions">
          <a class="btn" href={href.compte(r.targetId)}>Voir le compte</a>
          {#if r.status === 'ouvert'}
            <button class="btn" type="button" disabled={busy === r.id} onclick={() => set(r, 'traite')}>Marquer traité</button>
            <button class="btn" type="button" disabled={busy === r.id} onclick={() => set(r, 'rejete')}>Rejeter</button>
          {:else}
            <button class="btn" type="button" disabled={busy === r.id} onclick={() => set(r, 'ouvert')}>Rouvrir</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
  {#if more}
    <button class="btn more" type="button" disabled={loading} onclick={() => load(statut, rows?.at(-1)?.at)}>
      {loading ? 'Chargement…' : 'Plus anciens'}
    </button>
  {/if}
  {#if failed}<p class="error">Le signalement n'a pas été modifié.</p>{/if}
{/if}

<style>
  header {
    margin-bottom: 18px;
  }

  header p {
    margin: 6px 0 0;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
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
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .who {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 10px;
  }

  .target {
    color: var(--strong);
    font-weight: 600;
    text-decoration: none;
  }

  .target:hover {
    text-decoration: underline;
  }

  .tag {
    padding: 1px 8px;
    border-radius: 99px;
    font-size: 11.5px;
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    color: var(--danger-text);
  }

  .pill {
    flex: none;
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

  .reason {
    margin: 10px 0 0;
    color: var(--text);
  }

  blockquote {
    margin: 8px 0 0;
    padding-left: 10px;
    border-left: 2px solid var(--border-3);
    color: var(--text-3);
    white-space: pre-wrap;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  .actions a.btn {
    text-decoration: none;
  }

  .more {
    margin-top: 14px;
  }
</style>
