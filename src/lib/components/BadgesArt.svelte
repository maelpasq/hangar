<script lang="ts">
  // Illustration animée de la vitrine « badges » (fenêtre des nouveautés) : une carte de profil
  // au centre dont les badges apparaissent un à un, et les emblèmes en grand qui flottent autour.
  // Personnage inventé, aucun compte réel. Tout est décoratif (aria-hidden).
  import ArchEmblem from './ArchEmblem.svelte';
  import BadgeIcon from './BadgeIcon.svelte';
  import type { BadgeIcon as Icon } from '../util/badges';
  import { TIERS } from '../util/seniority';

  // Repère de 600 x 220 (même rapport que le bandeau).
  const W = 600;
  const H = 220;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  const ACCENT = 'var(--accent)';
  const diamond = TIERS.find((t) => t.id === 'diamant') ?? TIERS[TIERS.length - 1];
  const gold = TIERS.find((t) => t.id === 'or') ?? TIERS[0];

  /** Emblèmes en orbite : position, taille, couleur. `arch` : l'arche d'ancienneté. */
  type Floater = { x: number; y: number; size: number; icon: Icon | 'arch'; color: string };
  const floaters: Floater[] = [
    { x: 78, y: 74, size: 58, icon: 'arch', color: diamond.colors[1] },
    { x: 524, y: 72, size: 50, icon: 'seal', color: ACCENT },
    { x: 146, y: 178, size: 34, icon: 'clock', color: '#e9b52c' },
    { x: 456, y: 180, size: 36, icon: 'stack', color: '#aab3c2' },
    { x: 34, y: 158, size: 28, icon: 'flag', color: '#f08a3c' },
    { x: 570, y: 162, size: 28, icon: 'grid', color: '#4f8ff7' },
    { x: 214, y: 30, size: 24, icon: 'shield', color: '#8d70ff' },
    { x: 388, y: 28, size: 24, icon: 'flask', color: '#22b8a6' },
    { x: 300, y: 196, size: 22, icon: 'bug', color: '#3fb950' }
  ];

  /** Badges de la carte de profil, dans l'ordre du profil. */
  const row: { icon: Icon | 'arch'; color: string }[] = [
    { icon: 'seal', color: ACCENT },
    { icon: 'flag', color: '#f08a3c' },
    { icon: 'stack', color: '#e9b52c' },
    { icon: 'clock', color: '#aab3c2' },
    { icon: 'grid', color: '#4f8ff7' },
    { icon: 'arch', color: '' }
  ];

  const sparks = [
    [40, 30], [120, 20], [176, 120], [262, 18], [338, 210], [420, 110], [486, 16], [590, 100], [12, 100], [250, 160], [560, 210]
  ];
</script>

<div class="art on-dark" aria-hidden="true">
  <div class="glow"></div>
  <div class="rays"></div>

  {#each sparks as [x, y], i (i)}
    <svg class="spark" style:left={pct(x, W)} style:top={pct(y, H)} style:animation-delay="{(i * 0.41) % 3.2}s" viewBox="0 0 20 20"
      ><path d="M10 0 Q11 9 20 10 Q11 11 10 20 Q9 11 0 10 Q9 9 10 0 Z" /></svg
    >
  {/each}

  {#each floaters as f, i (i)}
    <span
      class="float"
      style:left={pct(f.x, W)}
      style:top={pct(f.y, H)}
      style:--c={f.color}
      style:--s="{f.size}px"
      style:animation-delay="{0.15 + i * 0.07}s, {(i * 0.53) % 3}s"
    >
      <span class="halo"></span>
      <span class="emblem" style:color={f.color}>
        {#if f.icon === 'arch'}
          <ArchEmblem tier={diamond} size={f.size} shine />
        {:else}
          <BadgeIcon icon={f.icon} size={f.size} />
        {/if}
      </span>
    </span>
  {/each}

  <span class="tip" style:left={pct(524, W)} style:top={pct(14, H)}>Compte certifié</span>
  <span class="tip arch-tip" style:left={pct(78, W)} style:top={pct(16, H)}>Arche de diamant</span>

  <div class="card" style:left={pct(300, W)} style:top={pct(108, H)}>
    <span class="av">N</span>
    <span class="who">
      <span class="name">Nova</span>
      <span class="row">
        {#each row as b, i (i)}
          <span class="mini" style:color={b.color} style:animation-delay="{0.7 + i * 0.16}s">
            {#if b.icon === 'arch'}
              <ArchEmblem tier={gold} size={17} />
            {:else}
              <BadgeIcon icon={b.icon} size={17} />
            {/if}
          </span>
        {/each}
      </span>
    </span>
    <span class="shine"></span>
  </div>
</div>

<style>
  .art {
    position: relative;
    flex-shrink: 0;
    aspect-ratio: 600 / 220;
    overflow: hidden;
    background: linear-gradient(180deg, #15131f 0%, #0c0d13 100%);
    border-bottom: 1px solid var(--border-2);
    isolation: isolate;
  }

  .glow {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 49%, color-mix(in srgb, var(--accent) 40%, transparent) 0%, transparent 36%),
      radial-gradient(circle at 13% 34%, color-mix(in srgb, #4fc6f0 22%, transparent) 0%, transparent 22%),
      radial-gradient(circle at 87% 33%, color-mix(in srgb, var(--accent) 24%, transparent) 0%, transparent 22%),
      radial-gradient(ellipse at 50% 125%, color-mix(in srgb, var(--accent) 28%, transparent) 0%, transparent 60%);
    animation: baBreath 5s ease-in-out infinite;
  }

  /* Rayons lents derrière la carte, comme un trophée. */
  .rays {
    position: absolute;
    left: 50%;
    top: 49%;
    width: 520px;
    height: 520px;
    margin: -260px 0 0 -260px;
    background: repeating-conic-gradient(
      from 0deg,
      color-mix(in srgb, var(--accent) 16%, transparent) 0deg 6deg,
      transparent 6deg 22deg
    );
    mask-image: radial-gradient(circle, #000 0%, transparent 62%);
    opacity: 0.55;
    animation: baSpin 60s linear infinite;
  }

  .spark {
    position: absolute;
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    fill: #fff;
    opacity: 0.15;
    animation: baTwinkle 3.2s ease-in-out infinite;
  }

  .float {
    position: absolute;
    width: var(--s);
    height: var(--s);
    margin: calc(var(--s) / -2) 0 0 calc(var(--s) / -2);
    animation:
      hgPopIn 0.5s var(--ease-pop) both,
      baBob 4.2s ease-in-out infinite;
  }

  .halo {
    position: absolute;
    inset: -45%;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--c) 38%, transparent) 0%, transparent 65%);
  }

  .emblem {
    position: relative;
    display: block;
    filter: drop-shadow(0 4px 10px rgb(0 0 0 / 0.45));
  }

  .tip {
    position: absolute;
    transform: translateX(-50%);
    padding: 4px 9px;
    border-radius: 8px;
    background: rgb(20 20 30 / 0.92);
    border: 1px solid rgb(255 255 255 / 0.14);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    opacity: 0;
    animation: baTip 6s 1.4s var(--ease) infinite;
  }

  .arch-tip {
    animation-delay: 4.4s;
  }

  .card {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px 12px 12px;
    transform: translate(-50%, -50%);
    border-radius: 16px;
    background: linear-gradient(180deg, rgb(38 36 54 / 0.95), rgb(22 21 32 / 0.95));
    border: 1px solid rgb(255 255 255 / 0.12);
    box-shadow:
      0 18px 40px rgb(0 0 0 / 0.5),
      0 0 46px var(--accent-glow);
    overflow: hidden;
    animation: baCard 0.6s var(--ease-pop) both;
  }

  .av {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border-radius: 50%;
    background: linear-gradient(135deg, #a855f7, #ec4899);
    color: #fff;
    font-weight: 700;
    font-size: 19px;
    box-shadow: 0 0 0 3px rgb(255 255 255 / 0.08);
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .name {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.2px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mini {
    display: inline-flex;
    animation: hgPopIn 0.45s var(--ease-pop) both;
  }

  /* Reflet qui balaie la carte de temps en temps. */
  .shine {
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 35%, rgb(255 255 255 / 0.14) 50%, transparent 65%);
    transform: translateX(-120%);
    animation: baShine 5s 2s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes baCard {
    from {
      opacity: 0;
      transform: translate(-50%, -40%) scale(0.92);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  @keyframes baBob {
    0%,
    100% {
      translate: 0 0;
    }
    50% {
      translate: 0 -5px;
    }
  }

  @keyframes baShine {
    0%,
    60% {
      transform: translateX(-120%);
    }
    85%,
    100% {
      transform: translateX(120%);
    }
  }

  @keyframes baTip {
    0%,
    100% {
      opacity: 0;
      transform: translate(-50%, 4px);
    }
    8%,
    40% {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    50% {
      opacity: 0;
      transform: translate(-50%, -3px);
    }
  }

  @keyframes baTwinkle {
    0%,
    100% {
      opacity: 0.12;
      transform: scale(0.7);
    }
    50% {
      opacity: 0.75;
      transform: scale(1.1);
    }
  }

  @keyframes baBreath {
    0%,
    100% {
      opacity: 0.85;
    }
    50% {
      opacity: 1;
    }
  }

  @keyframes baSpin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .art *,
    .art::before,
    .art::after {
      animation: none !important;
    }

    .shine,
    .tip {
      display: none;
    }
  }
</style>
