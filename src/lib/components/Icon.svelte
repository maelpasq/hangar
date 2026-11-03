<script lang="ts" module>
  export type IconName =
    | 'home'
    | 'grid'
    | 'star'
    | 'sliders'
    | 'back'
    | 'search'
    | 'refresh'
    | 'gear'
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
    | 'user'
    | 'upload';
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
  {:else if name === 'gear'}
    <circle cx="12" cy="12" r="3" /><path
      d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
    />
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
  {:else if name === 'user'}
    <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
  {:else if name === 'upload'}
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  {/if}
</svg>
