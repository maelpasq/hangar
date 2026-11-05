<script lang="ts" module>
  export type IconName =
    | 'home'
    | 'grid'
    | 'star'
    | 'sliders'
    | 'back'
    | 'search'
    | 'refresh'
    | 'plus'
    | 'play'
    | 'folder'
    | 'edit'
    | 'image'
    | 'eyeOff'
    | 'eye'
    | 'trash'
    | 'x'
    | 'stop'
    | 'check'
    | 'alert'
    | 'sun'
    | 'moon'
    | 'monitor'
    | 'upload'
    | 'download'
    | 'globe'
    | 'flag'
    | 'target'
    | 'crosshair'
    | 'crown'
    | 'flame'
    | 'cube'
    | 'bolt'
    | 'users'
    | 'bulb'
    | 'gamepad'
    | 'layers'
    | 'package';
</script>

<script lang="ts">
  // Icônes au trait de la maquette (chemins exacts), 24 x 24.
  let {
    name,
    size = 18,
    stroke = 1.8,
    class: cls = ''
  }: { name: IconName; size?: number; stroke?: number; class?: string } = $props();

  const filled = $derived(name === 'play');
</script>

<svg
  class={cls}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? 'currentColor' : 'none'}
  stroke={filled ? 'none' : 'currentColor'}
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'home'}
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  {:else if name === 'grid'}
    <rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect
      x="3"
      y="14"
      width="7"
      height="7"
      rx="2"
    /><rect x="14" y="14" width="7" height="7" rx="2" />
  {:else if name === 'star'}
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
  {:else if name === 'sliders'}
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle
      cx="10"
      cy="12"
      r="2"
    /><circle cx="18" cy="18" r="2" />
  {:else if name === 'back'}
    <path d="M15 18l-6-6 6-6" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  {:else if name === 'refresh'}
    <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 4v5h-5" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'play'}
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
  {:else if name === 'folder'}
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  {:else if name === 'edit'}
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  {:else if name === 'image'}
    <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" />
  {:else if name === 'eyeOff'}
    <path
      d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9M6.6 6.6A16.6 16.6 0 0 0 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.4-1.6"
    />
  {:else if name === 'eye'}
    <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" /><circle cx="12" cy="12" r="3" />
  {:else if name === 'trash'}
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  {:else if name === 'x'}
    <path d="M6 6l12 12M18 6 6 18" />
  {:else if name === 'stop'}
    <rect x="6" y="6" width="12" height="12" rx="2" />
  {:else if name === 'check'}
    <path d="m5 12 5 5 9-10" />
  {:else if name === 'alert'}
    <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h0" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  {:else if name === 'moon'}
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  {:else if name === 'monitor'}
    <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />
  {:else if name === 'upload'}
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  {:else if name === 'download'}
    <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
  {:else if name === 'globe'}
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  {:else if name === 'flag'}
    <path d="M5 21V4h11l-2 4 2 4H5" />
  {:else if name === 'target'}
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
  {:else if name === 'crosshair'}
    <circle cx="12" cy="12" r="8" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
  {:else if name === 'crown'}
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
  {:else if name === 'flame'}
    <path d="M12 3s5 5 5 10a5 5 0 0 1-10 0c0-2 1-4 2-5 0 2 1 3 2 3 0-3 1-6 1-8z" />
  {:else if name === 'cube'}
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />
  {:else if name === 'bolt'}
    <path d="M13 3 5 14h6l-1 7 8-11h-6z" />
  {:else if name === 'users'}
    <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" />
  {:else if name === 'bulb'}
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  {:else if name === 'gamepad'}
    <path d="M7 7h10a5 5 0 0 1 4.9 6l-.8 4a2.5 2.5 0 0 1-4.3 1.2L14.5 16h-5l-2.3 2.2a2.5 2.5 0 0 1-4.3-1.2l-.8-4A5 5 0 0 1 7 7z" /><path d="M8 10v4M6 12h4M15.5 11.5h0M17.5 13h0" />
  {:else if name === 'layers'}
    <path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" />
  {:else if name === 'package'}
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M9 11l3 3 3-3M12 8v6" />
  {/if}
</svg>
