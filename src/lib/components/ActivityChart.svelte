<script lang="ts">
  // Histogramme des 14 derniers jours (heures par jour), alimenté par les vraies sessions.
  import type { Session } from '../types';
  import { DAY_MS } from '../util/format';

  let { sessions, now = Date.now() }: { sessions: Session[]; now?: number } = $props();

  const LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

  const days = $derived.by(() => {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const out: { start: number; ms: number; letter: string; label: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + DAY_MS;
      let ms = 0;
      for (const s of sessions) ms += Math.max(0, Math.min(s.end, end) - Math.max(s.start, start));
      out.push({
        start,
        ms,
        letter: LETTERS[d.getDay()],
        label: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      });
    }
    return out;
  });

  const max = $derived(Math.max(1, ...days.map((d) => d.ms)));
</script>

<div class="chart" role="img" aria-label="Temps de jeu des 14 derniers jours">
  {#each days as d, i (d.start)}
    {@const h = d.ms > 0 ? Math.round(18 + (d.ms / max) * 82) : 4}
    <div class="col" title="{d.label} : {nf.format(d.ms / 3_600_000)} h">
      <div
        class="bar"
        class:played={d.ms > 0}
        class:today={i === days.length - 1}
        style:height="{h}%"
      ></div>
      <span>{d.letter}</span>
    </div>
  {/each}
</div>

<style>
  .chart {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 110px;
  }

  .col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    height: 100%;
    justify-content: flex-end;
  }

  .bar {
    width: 100%;
    max-width: 30px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    transition: height 0.6s var(--ease);
  }

  .bar.played {
    background: rgba(255, 255, 255, 0.22);
  }

  .bar.today {
    background: var(--accent);
  }

  span {
    font-size: 10.5px;
    color: var(--muted-2);
  }
</style>
