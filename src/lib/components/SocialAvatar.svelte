<script lang="ts">
  // Avatar d'un compte Hangar (image, sinon initiale sur fond d'accent) avec pastille de statut.
  import { social } from '../stores/social.svelte';
  import type { Presence } from '../types';

  let {
    id,
    name,
    version,
    size = 36,
    presence = null
  }: { id: string; name: string; version: string | null; size?: number; presence?: Presence | null } = $props();

  const src = $derived(social.image('avatar', id, version));
  const dot = $derived(presence && presence.state !== 'hidden' ? presence.state : null);
</script>

<span class="av" style:--s="{size}px" aria-hidden="true">
  {#if src}<img {src} alt="" />{:else}{name.charAt(0).toUpperCase()}{/if}
  {#if dot}<span class="dot {dot}"></span>{/if}
</span>

<style>
  .av {
    position: relative;
    width: var(--s);
    height: var(--s);
    flex-shrink: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--accent) 70%, #000);
    color: #fff;
    font-weight: 700;
    font-size: calc(var(--s) * 0.42);
  }

  img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  .dot {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: max(10px, calc(var(--s) * 0.28));
    height: max(10px, calc(var(--s) * 0.28));
    border-radius: 50%;
    border: 2.5px solid var(--bg);
    background: var(--muted);
  }

  .dot.online {
    background: var(--accent);
  }

  .dot.playing {
    background: var(--success);
  }
</style>
