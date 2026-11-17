<script lang="ts">
  // Accueil : chiffres clés, inscriptions des 30 derniers jours, badges donnés.
  import BadgeIcon from '../../../src/lib/components/BadgeIcon.svelte';
  import { GIVEN_BADGES, givenView } from '../../../src/lib/util/badges';
  import { api, type Stats } from '../api';
  import { date, num } from '../format';
  import { href } from '../router.svelte';

  let stats = $state<Stats | null>(null);
  let failed = $state(false);
  let hover = $state<number | null>(null);

  api
    .stats()
    .then((s) => (stats = s))
    .catch(() => (failed = true));

  const tiles = $derived<{ label: string; value: number; note: string; to?: string }[]>(
    stats
      ? [
          { label: 'Bugs ouverts', value: stats.bugsOpen, note: 'nouveaux, confirmés ou en cours', to: href.bugs() },
          { label: 'Comptes', value: stats.users, note: `+${num(stats.newWeek)} cette semaine` },
          { label: 'Actifs sur 7 jours', value: stats.activeWeek, note: 'au moins un poste connecté' },
          { label: 'Amis activés', value: stats.friendsOn, note: `${num(stats.online)} en ligne maintenant` },
          {
            label: 'Signalements à traiter',
            value: stats.reportsOpen,
            note: `${num(stats.reportsWeek)} reçu(s) cette semaine`,
            to: href.signalements()
          }
        ]
      : []
  );

  const max = $derived(stats ? Math.max(1, ...stats.signups.map((d) => d.n)) : 1);
  const total = $derived(stats ? stats.signups.reduce((n, d) => n + d.n, 0) : 0);
  const BAR_GAP = 2;
</script>

<header>
  <h1>Accueil</h1>
</header>

{#if failed}
  <p class="error">Impossible de charger les chiffres.</p>
{:else if !stats}
  <p class="muted">Chargement…</p>
{:else}
  <section class="tiles" aria-label="Chiffres clés">
    {#each tiles as t (t.label)}
      <svelte:element this={t.to ? 'a' : 'div'} href={t.to} class="card tile" class:link={!!t.to}>
        <span class="label">{t.label}</span>
        <span class="value">{num(t.value)}</span>
        <span class="note">{t.note}</span>
      </svelte:element>
    {/each}
  </section>

  <div class="row">
    <section class="card chart">
      <div class="head">
        <h2>Inscriptions, 30 derniers jours</h2>
        <span class="muted">{num(total)} au total</span>
      </div>
      <div class="plot" role="img" aria-label={`Inscriptions par jour, ${total} sur 30 jours, au plus ${max} en un jour`}>
        <div class="grid" aria-hidden="true">
          <span>{num(max)}</span>
          <span>0</span>
        </div>
        <div class="bars" style:gap="{BAR_GAP}px" onmouseleave={() => (hover = null)} role="presentation">
          {#each stats.signups as d, i (d.day)}
            <div class="slot" onmouseenter={() => (hover = i)} role="presentation">
              <div class="bar" class:dim={hover !== null && hover !== i} style:height="{(d.n / max) * 100}%"></div>
            </div>
          {/each}
          {#if hover !== null}
            {@const d = stats.signups[hover]}
            <div class="tip" style:left="{((hover + 0.5) / stats.signups.length) * 100}%">
              <b>{num(d.n)}</b> inscription{d.n > 1 ? 's' : ''}<br /><span>{date(d.day)}</span>
            </div>
          {/if}
        </div>
      </div>
      <div class="axis" aria-hidden="true">
        <span>{date(stats.signups[0].day)}</span>
        <span>aujourd'hui</span>
      </div>
      <table class="sr-only">
        <caption>Inscriptions par jour</caption>
        <tbody>
          {#each stats.signups as d (d.day)}
            <tr><th scope="row">{date(d.day)}</th><td>{d.n}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="card">
      <h2>Badges donnés</h2>
      <ul class="badges">
        {#each GIVEN_BADGES as b (b)}
          {@const v = givenView(b)}
          <li>
            <span class="emblem" style:color={v.color}><BadgeIcon icon={v.icon} size={20} /></span>
            <span class="name">{v.label}</span>
            <span class="count">{num(stats.badges[b] ?? 0)}</span>
          </li>
        {/each}
      </ul>
    </section>
  </div>
{/if}

<style>
  header {
    margin-bottom: 22px;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 14px;
    margin-bottom: 14px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-decoration: none;
  }

  .tile.link {
    transition: border-color 0.15s var(--ease), background 0.15s var(--ease);
  }

  .tile.link:hover {
    border-color: var(--accent-ring);
    background: var(--surface-2);
  }

  .label {
    color: var(--text-3);
    font-size: 13px;
  }

  .value {
    color: var(--strong);
    font-size: 30px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .note {
    color: var(--muted);
    font-size: 12.5px;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
    gap: 14px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 16px;
  }

  .plot {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    height: 170px;
  }

  .grid {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 11.5px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .bars {
    position: relative;
    display: flex;
    align-items: flex-end;
    border-bottom: 1px solid var(--border-2);
    background: linear-gradient(var(--border-1) 1px, transparent 1px) top / 100% 50%;
  }

  .slot {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: flex-end;
    cursor: default;
  }

  .bar {
    width: 100%;
    min-height: 2px;
    border-radius: 4px 4px 0 0;
    background: var(--accent);
    transition: opacity 0.15s var(--ease);
  }

  .bar.dim {
    opacity: 0.45;
  }

  .tip {
    position: absolute;
    bottom: calc(100% + 6px);
    transform: translateX(-50%);
    padding: 7px 10px;
    border-radius: 9px;
    background: rgb(var(--popover));
    border: 1px solid var(--border-2);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
    font-size: 12.5px;
    color: var(--text);
    white-space: nowrap;
    pointer-events: none;
  }

  .tip span {
    color: var(--muted);
  }

  .axis {
    display: flex;
    justify-content: space-between;
    margin: 8px 0 0 calc(10px + 2ch);
    font-size: 11.5px;
    color: var(--muted);
  }

  .badges {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .badges li {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 8px 4px;
  }

  .emblem {
    display: inline-flex;
  }

  .name {
    flex: 1;
    color: var(--text-soft);
  }

  .count {
    color: var(--strong);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 980px) {
    .row {
      grid-template-columns: 1fr;
    }
  }
</style>
