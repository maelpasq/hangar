<script lang="ts" module>
  /** Rosette à 10 pointes du badge certifié, centrée dans un carré de 24. */
  export const SEAL = Array.from({ length: 20 }, (_, i) => {
    const a = (i * Math.PI) / 10 - Math.PI / 2;
    const r = i % 2 ? 9.3 : 11.2;
    return `${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
</script>

<script lang="ts">
  // Emblème d'un badge (profil, vitrine des nouveautés), dans la couleur courante (`color`).
  import type { BadgeIcon } from '../util/badges';

  let { icon, size = 22 }: { icon: BadgeIcon; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
  {#if icon === 'seal'}
    <polygon class="fill" points={SEAL} stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    <path class="mark" d="M8.1 12.3l2.7 2.7 5.2-5.4" />
  {:else if icon === 'shield'}
    <path class="fill" d="M12 2.2l8 3.1v6.1c0 4.9-3.3 8.9-8 10.4-4.7-1.5-8-5.5-8-10.4V5.3z" />
    <path class="white" d="M12 7.2l1.4 2.9 3.2.4-2.3 2.2.6 3.1-2.9-1.5-2.9 1.5.6-3.1-2.3-2.2 3.2-.4z" />
  {:else if icon === 'flask'}
    <path class="fill" d="M9.3 2.8h5.4v5.6l5.2 9a2.3 2.3 0 0 1-2 3.4H6.1a2.3 2.3 0 0 1-2-3.4l5.2-9z" />
    <path class="mark" d="M7.4 15h9.2" />
    <circle class="white" cx="10.6" cy="17.6" r="1" /><circle class="white" cx="14" cy="18.2" r=".8" />
  {:else if icon === 'bug'}
    <path class="leg" d="M4 9.5l3.4 1.6M3.6 14.4h3.6M4.4 19.6l3.2-2.2M20 9.5l-3.4 1.6M20.4 14.4h-3.6M19.6 19.6l-3.2-2.2" />
    <circle class="fill" cx="12" cy="6.4" r="2.9" />
    <ellipse class="fill" cx="12" cy="14.4" rx="5.4" ry="6.6" />
    <path class="mark" d="M12 9.6v10.6" />
  {:else if icon === 'star'}
    <path class="fill" d="M12 2.4l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17l-5.8 3.2 1.2-6.5-4.8-4.5 6.5-.8z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
  {:else if icon === 'heart'}
    <path class="fill" d="M12 20.6C6.4 16.6 2.6 13.2 2.6 8.9 2.6 6 4.8 3.8 7.6 3.8c1.8 0 3.4.9 4.4 2.4 1-1.5 2.6-2.4 4.4-2.4 2.8 0 5 2.2 5 5.1 0 4.3-3.8 7.7-9.4 11.7z" />
  {:else if icon === 'trophy'}
    <path class="leg" d="M7 5.4H3.6v1.8a3.6 3.6 0 0 0 3.8 3.6M17 5.4h3.4v1.8a3.6 3.6 0 0 1-3.8 3.6" />
    <path class="fill" d="M6.4 3h11.2v5.6a5.6 5.6 0 0 1-11.2 0z" />
    <path class="fill" d="M10.6 13.6h2.8v3.6h-2.8z" />
    <rect class="fill" x="7" y="17.2" width="10" height="3.8" rx="1.2" />
    <path class="white" d="M12 4.9l.8 1.6 1.7.2-1.3 1.2.4 1.7-1.6-.9-1.6.9.4-1.7-1.3-1.2 1.7-.2z" />
  {:else if icon === 'crown'}
    <path class="fill" d="M3 7.2l4.6 4.2L12 4.4l4.4 7 4.6-4.2-1.8 11H4.8z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
    <rect class="fill" x="4.8" y="19.4" width="14.4" height="2.2" rx="1" />
    <circle class="white" cx="12" cy="14.2" r="1.5" />
  {:else if icon === 'rocket'}
    <path class="fill" d="M12 2c3.4 2.4 5 6 5 10.2V16H7v-3.8C7 8 8.6 4.4 12 2z" />
    <path class="fill" d="M7 12.4l-3 3.4V19l3-1.6zM17 12.4l3 3.4V19l-3-1.6z" />
    <path class="fill" d="M9.8 17.4h4.4L12 22z" />
    <circle class="white" cx="12" cy="9.4" r="2.1" />
  {:else if icon === 'bolt'}
    <path class="fill" d="M13.6 2L4.8 13.4h6.2L9.8 22l9.4-12h-6.4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
  {:else if icon === 'gem'}
    <path class="fill" d="M6.6 3.4h10.8L21.6 9 12 21 2.4 9z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
    <path class="mark" d="M3.2 9h17.6M9.4 9L12 18.6 14.6 9" style="stroke-width: 1.5" />
  {:else if icon === 'flame'}
    <path class="fill" d="M12 2c.8 3.4 3 4.8 4.6 6.8 1.6 2 2.4 3.9 2.4 6.1A7 7 0 0 1 12 22a7 7 0 0 1-7-7.1c0-2.6 1.2-4.6 3-6.2.2 1.8.9 3 2.2 3.8C10 8.6 10.6 5 12 2z" />
    <path class="white" d="M12 13.2c1.9 1.5 3 2.9 3 4.5a3 3 0 0 1-6 0c0-1.6 1.1-3 3-4.5z" />
  {:else if icon === 'gamepad'}
    <path class="fill" d="M7.4 6.4h9.2a5 5 0 0 1 4.9 4.1l.9 5.2a3 3 0 0 1-5.2 2.5l-2-2.2h-6.4l-2 2.2a3 3 0 0 1-5.2-2.5l.9-5.2a5 5 0 0 1 4.9-4.1z" />
    <path class="mark" d="M7.6 9.6v4M5.6 11.6h4" style="stroke-width: 1.9" />
    <circle class="white" cx="15.6" cy="10.4" r="1.2" /><circle class="white" cx="17.8" cy="12.8" r="1.2" />
  {:else if icon === 'brush'}
    <path class="leg" d="M19.8 4.2l-8 8" style="stroke-width: 3.4" />
    <path class="fill" d="M9.2 12.4l2.4 2.4c0 3.6-2.6 6.6-7.4 6.6-.6 0-.9-.6-.6-1.1.7-1 .9-2.2 1-3.4.2-2.6 2-4.5 4.6-4.5z" />
  {:else if icon === 'music'}
    <path class="fill" d="M9 5.4L20 3v12.4h-2.2V7.2L11.2 8.7v9.1H9z" />
    <ellipse class="fill" cx="6.8" cy="18" rx="3.4" ry="2.8" />
    <ellipse class="fill" cx="16.8" cy="15.6" rx="3.4" ry="2.8" />
  {:else if icon === 'chat'}
    <path class="fill" d="M4.6 3.6h14.8a2.4 2.4 0 0 1 2.4 2.4v9.2a2.4 2.4 0 0 1-2.4 2.4h-7.2L7 21.4v-3.8H4.6a2.4 2.4 0 0 1-2.4-2.4V6a2.4 2.4 0 0 1 2.4-2.4z" />
    <circle class="white" cx="8" cy="10.6" r="1.3" /><circle class="white" cx="12" cy="10.6" r="1.3" /><circle class="white" cx="16" cy="10.6" r="1.3" />
  {:else if icon === 'network'}
    <path class="leg" d="M6.2 12l11.6-6.6M6.2 12l11.6 6.6M17.8 5.4v13.2" />
    <circle class="fill" cx="6.2" cy="12" r="3.6" />
    <circle class="fill" cx="17.8" cy="5.4" r="3.2" />
    <circle class="fill" cx="17.8" cy="18.6" r="3.2" />
  {:else if icon === 'flag'}
    <path class="leg" d="M5.6 21.2V3" />
    <path class="fill" d="M6.6 3.6h12.6l-2.9 4.6 2.9 4.6H6.6z" />
  {:else if icon === 'stack'}
    <rect class="fill back" x="8" y="2.4" width="12.4" height="15.6" rx="2.2" />
    <rect class="fill" x="3.6" y="6" width="12.4" height="15.6" rx="2.2" />
    <path class="white" d="M8.3 10.6v6.4l5.2-3.2z" />
  {:else if icon === 'clock'}
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

<style>
  svg {
    display: block;
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
</style>
