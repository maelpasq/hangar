<script lang="ts" module>
  import { hue } from '../../../src/lib/util/color';

  /** Couleur stable d'un compte : teintes écartées (angle d'or) même pour des identifiants voisins. */
  export const avatarColor = (seed: string) => `hsl(${(hue(seed) * 137.5) % 360} 70% 58%)`;
</script>

<script lang="ts">
  // Avatar d'un compte : photo si elle existe, sinon l'initiale sur une couleur stable tirée de l'identifiant.

  let {
    name,
    seed,
    size = 38,
    online = false,
    src = null
  }: { name: string; seed: string; size?: number; online?: boolean; src?: string | null } = $props();

  let broken = $state(false);
  const big = $derived(size >= 60);
</script>

<span
  class="av"
  class:big
  style:width="{size}px"
  style:height="{size}px"
  style:--av={avatarColor(seed)}
  aria-hidden="true"
>
  {#if src && !broken}
    <img {src} alt="" onerror={() => (broken = true)} />
  {:else}
    {name.slice(0, 1).toUpperCase()}
  {/if}
  {#if online}<span class="on"></span>{/if}
</span>

<style>
  .av {
    position: relative;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: var(--av);
    color: white;
    font-size: 15px;
    font-weight: 700;
  }

  .big {
    border-radius: 22px;
    font-size: 30px;
    box-shadow:
      0 16px 34px -14px rgb(0 0 0 / 0.9),
      inset 0 0 0 1px rgb(255 255 255 / 0.15);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
  }

  .on {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 2.5px var(--panel);
  }
</style>
