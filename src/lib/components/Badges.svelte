<script lang="ts" module>
  /** Rosette à 10 pointes du badge certifié, centrée dans un carré de 24. */
  export const SEAL = Array.from({ length: 20 }, (_, i) => {
    const a = (i * Math.PI) / 10 - Math.PI / 2;
    const r = i % 2 ? 9.3 : 11.2;
    return `${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
</script>

<script lang="ts">
  // Badges d'un compte, à droite de son pseudo (profil) : ceux donnés par l'administrateur,
  // ceux calculés d'après le profil (`util/badges.ts`, selon sa confidentialité), puis l'ancienneté.
  import { badgeViews, type BadgeSource } from '../util/badges';
  import SeniorityBadge from './SeniorityBadge.svelte';

  let { profile, name, size = 22 }: { profile: BadgeSource; name: string; size?: number } = $props();

  const items = $derived(badgeViews(profile));
</script>

{#if items.length || profile.since}
  <span class="badges">
    {#each items as b (b.id)}
      <span class="badge" role="img" aria-label={b.label} data-tip={b.label} style:color={b.color}>
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          {#if b.icon === 'seal'}
            <polygon class="fill" points={SEAL} stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
            <path class="mark" d="M8.1 12.3l2.7 2.7 5.2-5.4" />
          {:else if b.icon === 'shield'}
            <path class="fill" d="M12 2.2l8 3.1v6.1c0 4.9-3.3 8.9-8 10.4-4.7-1.5-8-5.5-8-10.4V5.3z" />
            <path class="white" d="M12 7.2l1.4 2.9 3.2.4-2.3 2.2.6 3.1-2.9-1.5-2.9 1.5.6-3.1-2.3-2.2 3.2-.4z" />
          {:else if b.icon === 'flask'}
            <path class="fill" d="M9.3 2.8h5.4v5.6l5.2 9a2.3 2.3 0 0 1-2 3.4H6.1a2.3 2.3 0 0 1-2-3.4l5.2-9z" />
            <path class="mark" d="M7.4 15h9.2" />
            <circle class="white" cx="10.6" cy="17.6" r="1" /><circle class="white" cx="14" cy="18.2" r=".8" />
          {:else if b.icon === 'bug'}
            <path class="leg" d="M4 9.5l3.4 1.6M3.6 14.4h3.6M4.4 19.6l3.2-2.2M20 9.5l-3.4 1.6M20.4 14.4h-3.6M19.6 19.6l-3.2-2.2" />
            <circle class="fill" cx="12" cy="6.4" r="2.9" />
            <ellipse class="fill" cx="12" cy="14.4" rx="5.4" ry="6.6" />
            <path class="mark" d="M12 9.6v10.6" />
          {:else if b.icon === 'flag'}
            <path class="leg" d="M5.6 21.2V3" />
            <path class="fill" d="M6.6 3.6h12.6l-2.9 4.6 2.9 4.6H6.6z" />
          {:else if b.icon === 'stack'}
            <rect class="fill back" x="8" y="2.4" width="12.4" height="15.6" rx="2.2" />
            <rect class="fill" x="3.6" y="6" width="12.4" height="15.6" rx="2.2" />
            <path class="white" d="M8.3 10.6v6.4l5.2-3.2z" />
          {:else if b.icon === 'clock'}
            <circle class="fill" cx="12" cy="13" r="9" />
            <path class="leg" d="M9.6 2.2h4.8" />
            <path class="mark" d="M12 8.2V13l3.3 2.1" />
          {:else}
            <rect class="fill" x="3" y="3" width="8" height="8" rx="2" />
            <rect class="fill" x="13" y="3" width="8" height="8" rx="2" />
            <rect class="fill" x="3" y="13" width="8" height="8" rx="2" />
            <rect class="fill" x="13" y="13" width="8" height="8" rx="2" />
          {/if}
        </svg>
      </span>
    {/each}
    {#if profile.since}<SeniorityBadge since={profile.since} {name} />{/if}
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

  .fill {
    fill: currentColor;
  }

  .back {
    opacity: 0.5;
  }

  .white {
    fill: #fff;
  }

  .mark {
    fill: none;
    stroke: #fff;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .leg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
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
