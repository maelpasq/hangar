<script lang="ts">
  // Badge d'ancienneté (à droite du pseudo) : l'arche du palier atteint. Un clic ouvre une carte
  // avec la date exacte d'arrivée sur Hangar, la durée, l'arche suivante et toute l'échelle.
  import ArchEmblem from './ArchEmblem.svelte';
  import { dateLabel } from '../util/format';
  import { durationLabel, seniority, tierAge, TIERS } from '../util/seniority';

  let { since, name }: { since: number; name: string } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  // Relu à chaque ouverture : la carte reste juste si l'app tourne depuis longtemps.
  let now = $state(Date.now());

  const s = $derived(seniority(since, now));
  const tip = $derived(`${s.tier.title} · sur Hangar depuis ${durationLabel(since, now)}`);
  const vars = $derived(`--t0: ${s.tier.colors[0]}; --t1: ${s.tier.colors[1]}; --t2: ${s.tier.colors[2]}`);

  function toggle() {
    now = Date.now();
    open = !open;
  }

  function close(focus = false) {
    open = false;
    if (focus) trigger?.focus();
  }

  // Fermée par un clic ailleurs ou par Échap.
  $effect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (root && !root.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  });

  /** Étoiles à 4 branches du ciel de la carte (position en %, taille, délai). */
  const STARS = [
    [12, 22, 9, 0],
    [28, 62, 6, 1.2],
    [74, 18, 7, 0.6],
    [86, 58, 10, 1.8],
    [60, 74, 5, 2.4],
    [40, 14, 5, 3]
  ];
</script>

<span class="sb" bind:this={root} style={vars}>
  <button
    bind:this={trigger}
    class="badge"
    class:open
    type="button"
    aria-label="{s.tier.title}, ancienneté de {name}"
    aria-expanded={open}
    aria-haspopup="dialog"
    data-tip={tip}
    onclick={toggle}><ArchEmblem tier={s.tier} size={22} /></button
  >
  {#if open}
    <div class="card" role="dialog" aria-label="Ancienneté de {name}">
      <div class="sky" aria-hidden="true">
        {#each STARS as [x, y, size, delay], i (i)}
          <svg class="star" style="left: {x}%; top: {y}%; width: {size}px; height: {size}px; animation-delay: {delay}s" viewBox="0 0 20 20"
            ><path d="M10 0 Q11 9 20 10 Q11 11 10 20 Q9 11 0 10 Q9 9 10 0 Z" /></svg
          >
        {/each}
        <span class="halo"></span>
        <span class="hero"><ArchEmblem tier={s.tier} size={84} shine /></span>
      </div>
      <div class="body">
        <p class="eyebrow">Ancienneté</p>
        <h3>{s.tier.title}</h3>
        <p class="date">Sur Hangar depuis le<br /><strong>{dateLabel(since)}</strong></p>
        <p class="dur">Ça fait {durationLabel(since, now)}.</p>

        {#if s.next && s.nextAt}
          <div class="next">
            <div class="nrow">
              <span class="nname"><ArchEmblem tier={s.next} size={16} />{s.next.title}</span>
              <span class="nat">le {dateLabel(s.nextAt)}</span>
            </div>
            <div
              class="bar"
              role="progressbar"
              aria-label="Avancée vers l'{s.next.title.toLowerCase()}"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(s.progress * 100)}
            >
              <span style="width: {Math.max(3, s.progress * 100)}%; --n0: {s.next.colors[0]}; --n1: {s.next.colors[1]}"></span>
            </div>
            <p class="left">Encore {durationLabel(now, s.nextAt)}</p>
          </div>
        {:else}
          <p class="top">La plus belle arche de Hangar. Respect.</p>
        {/if}

        <ol class="ladder" aria-label="Arches d'ancienneté">
          {#each TIERS as t, i (t.id)}
            <li class:cur={i === s.index} title="{t.title} : {tierAge(t).toLowerCase()}">
              <ArchEmblem tier={t} size={22} locked={i > s.index} />
              <span class="sr">{t.title}, {tierAge(t).toLowerCase()}{i <= s.index ? ', obtenue' : ''}</span>
            </li>
          {/each}
        </ol>
      </div>
    </div>
  {/if}
</span>

<style>
  .sb {
    position: relative;
    display: inline-flex;
  }

  .badge {
    position: relative;
    display: inline-flex;
    padding: 2px;
    margin: -2px;
    border: 0;
    border-radius: 6px;
    background: none;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .badge:hover,
  .badge.open {
    transform: translateY(-1px) scale(1.08);
  }

  .badge:focus-visible {
    outline: 2px solid var(--accent-ring);
    outline-offset: 2px;
  }

  /* Bulle au survol (comme le badge certifié), cachée quand la carte est ouverte. */
  .badge::after {
    content: attr(data-tip);
    position: absolute;
    left: 50%;
    bottom: calc(100% + 8px);
    transform: translate(-50%, 4px);
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--panel);
    border: 1px solid var(--border-3);
    color: var(--text);
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition:
      opacity 0.12s ease,
      transform 0.12s ease;
    z-index: 5;
  }

  .badge:hover:not(.open)::after {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  .card {
    position: absolute;
    top: calc(100% + 12px);
    left: -18px;
    width: 300px;
    z-index: 30;
    border-radius: 18px;
    overflow: hidden;
    background: var(--panel);
    border: 1px solid color-mix(in srgb, var(--t1) 35%, var(--border-3));
    box-shadow:
      0 18px 50px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(0, 0, 0, 0.2),
      0 0 40px -10px color-mix(in srgb, var(--t1) 45%, transparent);
    letter-spacing: 0;
    font-weight: 400;
    text-align: left;
    transform-origin: 30px -10px;
    animation: pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.94);
    }
  }

  /* Ciel de nuit au-dessus de l'arche, étoiles à 4 branches comme dans le logo. */
  .sky {
    position: relative;
    height: 128px;
    display: grid;
    place-items: center;
    background:
      radial-gradient(120% 90% at 50% 110%, color-mix(in srgb, var(--t1) 38%, transparent), transparent 62%),
      linear-gradient(180deg, #120e24, #1b1638 70%, #231b46);
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
  }

  .halo {
    position: absolute;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--t0) 45%, transparent), transparent 65%);
    filter: blur(6px);
    animation: halo 3.2s ease-in-out infinite;
  }

  @keyframes halo {
    50% {
      transform: scale(1.12);
      opacity: 0.75;
    }
  }

  .hero {
    position: relative;
    filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.45)) drop-shadow(0 0 12px color-mix(in srgb, var(--t1) 55%, transparent));
    animation: rise 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.25) both;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.85);
    }
  }

  .star {
    position: absolute;
    fill: #fff;
    opacity: 0.25;
    animation: twinkle 3.4s ease-in-out infinite;
  }

  @keyframes twinkle {
    50% {
      opacity: 0.95;
      transform: scale(1.25) rotate(45deg);
    }
  }

  .body {
    padding: 14px 18px 16px;
  }

  .eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--t1) 70%, var(--text));
  }

  h3 {
    margin-top: 2px;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.4px;
    color: var(--text);
  }

  .date {
    margin-top: 10px;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.45;
  }

  .date strong {
    font-size: 17px;
    font-weight: 700;
    color: var(--text);
  }

  .dur {
    margin-top: 2px;
    font-size: 13px;
    color: var(--text-3);
  }

  .next {
    margin-top: 14px;
    padding: 12px;
    border-radius: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
  }

  .nrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12.5px;
  }

  .nname {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    color: var(--text);
  }

  .nat {
    color: var(--muted);
  }

  .bar {
    margin-top: 9px;
    height: 6px;
    border-radius: 99px;
    background: var(--surface-4);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--t1), var(--n1));
    box-shadow: 0 0 10px color-mix(in srgb, var(--n0) 60%, transparent);
    animation: fill 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both 0.15s;
    transform-origin: left;
  }

  @keyframes fill {
    from {
      transform: scaleX(0);
    }
  }

  .left {
    margin-top: 7px;
    font-size: 12px;
    color: var(--muted);
  }

  .top {
    margin-top: 14px;
    font-size: 13px;
    font-weight: 600;
    color: color-mix(in srgb, var(--t1) 70%, var(--text));
  }

  .ladder {
    display: flex;
    justify-content: space-between;
    margin-top: 14px;
    padding: 0;
    list-style: none;
  }

  .ladder li {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
  }

  .ladder li.cur {
    background: color-mix(in srgb, var(--t1) 18%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--t1) 55%, transparent);
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .card,
    .hero,
    .halo,
    .star,
    .bar span {
      animation: none;
    }

    .badge {
      transition: none;
    }
  }
</style>
