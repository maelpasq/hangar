<script lang="ts" module>
  export { SEAL } from './BadgeIcon.svelte';
</script>

<script lang="ts">
  // Badges d'un compte, à droite de son pseudo (profil) : ceux donnés par l'administrateur,
  // ceux calculés d'après le profil (`util/badges.ts`, selon sa confidentialité), puis l'ancienneté.
  import { badgeViews, type BadgeSource } from '../util/badges';
  import BadgeIcon from './BadgeIcon.svelte';
  import SeniorityBadge from './SeniorityBadge.svelte';

  let { profile, name, size = 22 }: { profile: BadgeSource; name: string; size?: number } = $props();

  const items = $derived(badgeViews(profile));
</script>

{#if items.length || profile.since}
  <span class="badges">
    {#each items as b (b.id)}
      <span class="badge" role="img" aria-label={b.label} data-tip={b.label} style:color={b.color}>
        <BadgeIcon icon={b.icon} {size} />
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
