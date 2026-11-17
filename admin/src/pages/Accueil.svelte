<script lang="ts">
  // Accueil : chiffres clés, inscriptions des 30 derniers jours, badges donnés, derniers bugs et actions.
  import Icon, { type IconName } from '../../../src/lib/components/Icon.svelte';
  import { api, envName, type BugRow, type LogRow } from '../api';
  import { BADGES, TINTS } from '../badges';
  import { SYSTEMS, statusOf } from '../bug-status';
  import PageHeader from '../components/PageHeader.svelte';
  import Pill from '../components/Pill.svelte';
  import { ago, logText, num, shortDate } from '../format';
  import { href } from '../router.svelte';
  import { loadStats, stats } from '../stats.svelte';

  let bugs = $state<BugRow[]>([]);
  let fresh = $state(0);
  let log = $state<LogRow[]>([]);
  let now = $state(Date.now());

  function load() {
    api.bugs('ouverts', '').then((r) => {
      bugs = r.bugs.slice(0, 4);
      fresh = r.counts.nouveau ?? 0;
    });
    api.log().then((r) => (log = r.log.slice(0, 4)));
  }
  load();

  async function refresh() {
    load();
    await loadStats();
    now = Date.now();
  }

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  const other = envName === 'Prod' ? { label: "Ouvrir l'admin Test", url: 'https://hangar-admin-test.pamalstudio.fr' } : { label: "Ouvrir l'admin Prod", url: 'https://hangar-admin.pamalstudio.fr' };

  const s = $derived(stats.data);
  const tiles = $derived<{ label: string; icon: IconName; color: string; value: number }[]>(
    s
      ? [
          { label: 'Comptes', icon: 'users', color: 'var(--success)', value: s.users },
          { label: 'Actifs sur 7 jours', icon: 'clock', color: TINTS.info, value: s.activeWeek },
          { label: 'Amis activés', icon: 'heart', color: TINTS.social, value: s.friendsOn },
          { label: 'Signalements', icon: 'flag', color: 'var(--star)', value: s.reports }
        ]
      : []
  );

  // Histogramme : 158 px pour le plus haut jour (190 px moins 28 px de marge haute et 4 px de base).
  const PLOT = 158;
  const max = $derived(s ? Math.max(1, ...s.signups.map((d) => d.n)) : 1);
  const total = $derived(s ? s.signups.reduce((n, d) => n + d.n, 0) : 0);
  const given = $derived(s ? BADGES.map((b) => ({ ...b, n: s.badges[b.id] ?? 0 })).sort((a, b) => b.n - a.n) : []);
  const givenMax = $derived(Math.max(1, ...given.map((b) => b.n)));
  const givenTotal = $derived(given.reduce((n, b) => n + b.n, 0));

  const isBug = (l: LogRow) => l.action.startsWith('bug.');
  const isBadge = (l: LogRow) => l.action.startsWith('badge.');
</script>

<PageHeader title="Accueil" sub={`Le compte Hangar en un coup d’oeil.${stats.at ? ` Mis à jour ${ago(stats.at, now)}.` : ''}`}>
  {#snippet actions()}
    <button class="btn" type="button" onclick={refresh}><Icon name="refresh" size={16} />Actualiser</button>
    <a class="btn" href={other.url}><Icon name="external" size={16} />{other.label}</a>
  {/snippet}
</PageHeader>

{#if stats.failed && !s}
  <p class="error">Impossible de charger les chiffres.</p>
{:else if !s}
  <p class="muted">Chargement…</p>
{:else}
  <section class="kpis" aria-label="Chiffres clés">
    <a href={href.bugs()} class="card kpi hot">
      <div class="kpi-head">
        <span class="kpi-label">Bugs ouverts</span>
        <span class="kpi-icon"><Icon name="bug" size={16} /></span>
      </div>
      <span class="kpi-value">{num(s.bugsOpen)}</span>
      <span class="kpi-note">
        {fresh > 1 ? `${num(fresh)} nouveaux à trier` : fresh === 1 ? '1 nouveau à trier' : 'Rien à trier'}
        <Icon name="chevronRight" size={14} />
      </span>
    </a>
    {#each tiles as t (t.label)}
      <div class="card kpi">
        <div class="kpi-head">
          <span class="kpi-label">{t.label}</span>
          <span class="tint kpi-icon" style:--c={t.color}><Icon name={t.icon} size={16} /></span>
        </div>
        <span class="kpi-value">{num(t.value)}</span>
        <span class="kpi-note">
          {#if t.label === 'Comptes'}
            <b class="up">+{num(s.newWeek)}</b> sur 7 jours
          {:else if t.label === 'Actifs sur 7 jours'}
            {num(Math.round((s.activeWeek / Math.max(1, s.users)) * 100))} % des comptes
          {:else if t.label === 'Amis activés'}
            <span class="online"><i></i>{num(s.online)} en ligne</span>
          {:else}
            <b class="warn">+{num(s.reportsWeek)}</b> sur 7 jours
          {/if}
        </span>
      </div>
    {/each}
  </section>

  <section class="blocks">
    <div class="card chart">
      <div class="card-head top">
        <div>
          <h2>Inscriptions par jour</h2>
          <p class="card-sub">30 derniers jours</p>
        </div>
        <div class="total">
          <span class="total-n">{num(total)}</span>
          <span class="card-sub">inscriptions</span>
        </div>
      </div>
      <div class="plot" role="img" aria-label={`Histogramme des inscriptions sur 30 jours : ${num(total)} au total, au plus ${num(max)} en un jour`}>
        <div class="guide" style:top="28px" aria-hidden="true"></div>
        <div class="guide" style:top="109px" aria-hidden="true"></div>
        {#each s.signups as d, i (d.day)}
          {@const h = Math.max(4, Math.round((d.n / max) * PLOT))}
          <div class="barcol" aria-hidden="true">
            <span class="tip" style:bottom="{h + 6}px">{num(d.n)} le {shortDate(d.day)}</span>
            <div class="bar" class:today={i === s.signups.length - 1} style:height="{h}px"></div>
          </div>
        {/each}
      </div>
      <div class="axis" aria-hidden="true">
        <span>{shortDate(s.signups[0].day)}</span>
        <span>{shortDate(s.signups[Math.floor(s.signups.length / 2)].day)}</span>
        <span>Aujourd’hui</span>
      </div>
    </div>

    <div class="card given">
      <div class="card-head">
        <div>
          <h2>Badges donnés</h2>
          <p class="card-sub">{num(givenTotal)} au total</p>
        </div>
      </div>
      <ul>
        {#each given as b (b.id)}
          <li>
            <div class="given-line">
              <span class="tint given-icon" style:--c={b.color}><Icon name="shieldCheck" size={14} /></span>
              <span class="given-label">{b.label}</span>
              <span class="given-n">{num(b.n)}</span>
            </div>
            <div class="track" style:--c={b.color}><div style:width="{Math.round((b.n / givenMax) * 100)}%"></div></div>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="blocks">
    <div class="card list">
      <div class="card-head list-head">
        <h2>Derniers bugs</h2>
        <a class="card-link" href={href.bugs()}>Tout voir</a>
      </div>
      {#each bugs as b (b.id)}
        {@const st = statusOf(b.status)}
        <a class="row" href={href.bug(b.id)}>
          <span class="mono row-num">#{b.id}</span>
          <span class="row-body">
            <span class="row-title">{b.title}</span>
            <span class="row-meta">{b.version} · {SYSTEMS[b.os] ?? b.os} · {ago(b.createdAt, now)}</span>
          </span>
          <Pill color={st.color} label={st.label} />
        </a>
      {:else}
        <p class="empty">Aucun bug ouvert.</p>
      {/each}
    </div>

    <div class="card list">
      <div class="card-head list-head">
        <h2>Dernières actions</h2>
        <a class="card-link" href={href.journal}>Journal</a>
      </div>
      {#each log as l (l.id)}
        <div class="row">
          <span
            class="tint log-icon"
            style:--c={isBug(l) ? 'var(--accent)' : isBadge(l) ? 'var(--star)' : 'var(--danger)'}
          >
            <Icon name={isBug(l) ? 'bug' : isBadge(l) ? 'shieldCheck' : 'flag'} size={16} />
          </span>
          <span class="row-body">
            <span class="row-title log-text">{logText(l)}</span>
            <span class="row-meta">{ago(l.at, now)} · {l.actor}</span>
          </span>
        </div>
      {:else}
        <p class="empty">Aucune action pour l’instant.</p>
      {/each}
    </div>
  </section>
{/if}

<style>
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 14px;
  }

  .kpi-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .kpi-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-3);
  }

  .kpi-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
  }

  .kpi-value {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -1px;
    color: var(--strong);
    font-variant-numeric: tabular-nums;
  }

  .kpi-note {
    font-size: 12.5px;
    color: var(--muted);
  }

  .kpi-note b {
    font-weight: 600;
  }

  .up {
    color: var(--success-text);
  }

  .warn {
    color: var(--star);
  }

  .online {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .online i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
  }

  /* Le chiffre qui demande une action */
  .hot {
    background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent) 5%, transparent));
    border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  }

  .hot .kpi-label {
    color: var(--text-soft);
  }

  .hot .kpi-icon {
    display: grid;
    place-items: center;
    background: rgb(var(--ink) / 0.12);
    color: var(--strong);
  }

  .hot .kpi-note {
    display: flex;
    align-items: center;
    gap: 6px;
    color: color-mix(in srgb, var(--accent) 30%, var(--strong));
  }

  .blocks {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
    gap: 14px;
  }

  .chart {
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    grid-column: span 2;
  }

  .top {
    align-items: flex-start;
  }

  .total {
    display: flex !important;
    flex-direction: row !important;
    align-items: baseline;
    gap: 8px !important;
  }

  .total-n {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.6px;
    color: var(--strong);
    font-variant-numeric: tabular-nums;
  }

  .plot {
    position: relative;
    height: 190px;
    display: flex;
    align-items: flex-end;
    gap: 5px;
    padding-top: 28px;
    border-bottom: 1px solid var(--border-2);
  }

  .guide {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed rgb(var(--ink) / 0.06);
  }

  .barcol {
    position: relative;
    flex: 1;
    height: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .bar {
    width: 100%;
    max-width: 22px;
    border-radius: 6px 6px 3px 3px;
    background: color-mix(in srgb, var(--accent) 42%, transparent);
    transition:
      height 0.6s var(--ease),
      background 0.15s;
  }

  .bar.today {
    background: var(--accent);
  }

  .barcol:hover .bar {
    background: var(--accent-text);
  }

  .tip {
    position: absolute;
    padding: 3px 7px;
    border-radius: 7px;
    background: rgb(var(--popover));
    border: 1px solid rgb(var(--ink) / 0.1);
    font-size: 11.5px;
    color: var(--strong);
    white-space: nowrap;
    pointer-events: none;
    z-index: 2;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .barcol:hover .tip {
    opacity: 1;
  }

  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--muted-2);
  }

  .given {
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .given ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .given li {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .given-line {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .given-icon {
    width: 26px;
    height: 26px;
    border-radius: 8px;
  }

  .given-label {
    font-size: 13.5px;
    color: var(--text-soft);
  }

  .given-n {
    margin-left: auto;
    font-size: 13px;
    font-weight: 600;
    color: var(--strong);
    font-variant-numeric: tabular-nums;
  }

  .track {
    height: 6px;
    border-radius: 6px;
    background: rgb(var(--ink) / 0.06);
    overflow: hidden;
  }

  .track div {
    height: 100%;
    border-radius: 6px;
    background: color-mix(in srgb, var(--c) 55%, var(--strong));
  }

  .list {
    padding: 22px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .list-head {
    padding: 0 8px 4px;
  }

  .log-icon {
    width: 34px;
    height: 34px;
    border-radius: 11px;
  }

  .log-text {
    font-size: 13.5px;
    color: var(--text-soft);
  }

  @media (max-width: 900px) {
    .chart {
      grid-column: auto;
    }
  }
</style>
