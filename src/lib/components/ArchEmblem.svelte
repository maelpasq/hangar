<script lang="ts">
  // Emblème d'ancienneté : l'arche du logo de Hangar (même tracé que Logo.svelte), dans la
  // matière du palier, avec l'étoile violette de la marque. `shine` : reflet qui passe sur l'arche.
  import type { Tier } from '../util/seniority';

  let { tier, size = 20, locked = false, shine = false }: { tier: Tier; size?: number; locked?: boolean; shine?: boolean } =
    $props();
  const uid = $props.id();
</script>

<svg class="arch" class:locked width={size} height={size} viewBox="15 -53 900 900" aria-hidden="true">
  <defs>
    <linearGradient id="{uid}-m" x1="0" y1="42" x2="0" y2="682" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color={tier.colors[0]} />
      <stop offset="0.45" stop-color={tier.colors[1]} />
      <stop offset="1" stop-color={tier.colors[2]} />
    </linearGradient>
    <linearGradient id="{uid}-s" x1="0" y1="345" x2="0" y2="575" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#8b5cff" />
      <stop offset="1" stop-color="#652cee" />
    </linearGradient>
    <linearGradient id="{uid}-r" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0" />
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.75" />
      <stop offset="1" stop-color="#fff" stop-opacity="0" />
    </linearGradient>
    <path
      id="{uid}-p"
      d="M50 682 L50 315 Q50 275 84.9 255.4 L430.1 61.6 Q465 42 499.9 61.6 L845.1 255.4 Q880 275 880 315 L880 682 L725 612 L725 359 Q725 345 712.8 338.1 L477.2 204.9 Q465 198 452.8 204.9 L217.2 338.1 Q205 345 205 359 L205 612 Z"
    />
    <clipPath id="{uid}-c"><use href="#{uid}-p" /></clipPath>
  </defs>
  <use href="#{uid}-p" fill="url(#{uid}-m)" stroke={tier.colors[2]} stroke-width="22" stroke-linejoin="round" />
  <!-- Arête claire en haut de l'arche : relief de la matière. -->
  <path
    d="M110 300 L445 112 Q465 101 485 112 L820 300"
    fill="none"
    stroke={tier.colors[0]}
    stroke-opacity="0.85"
    stroke-width="26"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  {#if shine}
    <g clip-path="url(#{uid}-c)"><rect class="shine" x="-420" y="-60" width="260" height="900" fill="url(#{uid}-r)" /></g>
  {/if}
  <path d="M467 345 Q477 450 627 460 Q477 470 467 575 Q457 470 310 460 Q457 450 467 345 Z" fill="url(#{uid}-s)" />
</svg>

<style>
  .arch {
    display: block;
    overflow: visible;
  }

  .locked {
    filter: grayscale(1) brightness(0.55);
    opacity: 0.45;
  }

  .shine {
    transform: skewX(-18deg) translateX(0);
    animation: shine 3.6s ease-in-out 0.4s infinite;
  }

  @keyframes shine {
    0% {
      transform: skewX(-18deg) translateX(0);
    }
    45%,
    100% {
      transform: skewX(-18deg) translateX(1500px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shine {
      animation: none;
      display: none;
    }
  }
</style>
