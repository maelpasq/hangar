<script lang="ts" module>
  import type { Badge } from '../types';

  /** Nom de chaque badge (bulle au survol, lecteur d'écran). */
  export const BADGE_LABEL: Record<Badge, string> = {
    certifie: 'Compte certifié'
  };

  /** Rosette à 10 pointes du badge certifié, centrée dans un carré de 24. */
  export const SEAL = Array.from({ length: 20 }, (_, i) => {
    const a = (i * Math.PI) / 10 - Math.PI / 2;
    const r = i % 2 ? 9.3 : 11.2;
    return `${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
</script>

<script lang="ts">
  // Badges d'un compte, à droite de son pseudo (profil). Donnés seulement par l'administrateur.
  let { badges, size = 22 }: { badges: Badge[]; size?: number } = $props();
</script>

{#if badges.length}
  <span class="badges">
    {#each badges as b (b)}
      <span class="badge {b}" role="img" aria-label={BADGE_LABEL[b]} data-tip={BADGE_LABEL[b]}>
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <polygon class="seal" points={SEAL} />
          <path class="tick" d="M8.1 12.3l2.7 2.7 5.2-5.4" />
        </svg>
      </span>
    {/each}
  </span>
{/if}

<style>
  .badges {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .badge {
    position: relative;
    display: inline-flex;
  }

  .seal {
    fill: var(--accent);
    stroke: var(--accent);
    stroke-width: 1.6;
    stroke-linejoin: round;
  }

  .tick {
    fill: none;
    stroke: #fff;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Bulle au survol, comme les badges de Discord. */
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

  .badge:hover::after {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  @media (prefers-reduced-motion: reduce) {
    .badge::after {
      transition: none;
    }
  }
</style>
