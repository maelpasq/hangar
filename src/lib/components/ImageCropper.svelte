<script lang="ts">
  // Recadrage d'une image (avatar rond ou bannière 3:1) : glisser pour déplacer, molette ou curseur
  // pour zoomer, flèches et +/- au clavier. La zone hors du cadre reste visible, assombrie.
  import { onDestroy } from 'svelte';
  import {
    clampView,
    cropImage,
    cropRatio,
    cropRect,
    initialView,
    MAX_ZOOM,
    zoomAt,
    type CropShape,
    type CropView
  } from '../util/avatar';

  let { file, shape, onerror }: { file: File; shape: CropShape; onerror?: () => void } = $props();

  // svelte-ignore state_referenced_locally
  const url = URL.createObjectURL(file);
  onDestroy(() => URL.revokeObjectURL(url));

  const ratio = $derived(cropRatio(shape));
  let iw = $state(0);
  let ih = $state(0);
  let view = $state<CropView>({ cx: 0, cy: 0, zoom: 1 });
  let sw = $state(0);
  let sh = $state(0);
  let dragging = $state(false);

  // Cadre centré dans la scène, avec une marge pour voir l'image autour.
  const frame = $derived.by(() => {
    const pad = 28;
    let w = Math.max(0, sw - pad * 2);
    let h = w / ratio;
    if (h > sh - pad * 2) {
      h = Math.max(0, sh - pad * 2);
      w = h * ratio;
    }
    return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
  });
  const rect = $derived(iw ? cropRect(iw, ih, ratio, view) : null);
  const scale = $derived(rect && rect.w ? frame.w / rect.w : 1);

  function loaded(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    iw = img.naturalWidth;
    ih = img.naturalHeight;
    if (!iw || !ih) return onerror?.();
    view = initialView(iw, ih);
  }

  const set = (v: CropView) => (view = clampView(iw, ih, ratio, v));
  const zoomTo = (z: number, at?: { x: number; y: number }) => (view = zoomAt(iw, ih, ratio, view, z, at));

  // Glisser : la souris, le doigt ou le stylet déplacent l'image sous le cadre.
  let start: { px: number; py: number; cx: number; cy: number } | null = null;
  function down(e: PointerEvent) {
    if (!rect || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start = { px: e.clientX, py: e.clientY, cx: view.cx, cy: view.cy };
    dragging = true;
  }
  function move(e: PointerEvent) {
    if (!start) return;
    set({ cx: start.cx - (e.clientX - start.px) / scale, cy: start.cy - (e.clientY - start.py) / scale, zoom: view.zoom });
  }
  function up() {
    start = null;
    dragging = false;
  }

  // Molette : zoom autour du point visé (écouteur non passif pour ne pas faire défiler la fenêtre).
  function wheel(node: HTMLElement) {
    const on = (e: WheelEvent) => {
      if (!rect) return;
      e.preventDefault();
      const box = node.getBoundingClientRect();
      const at = {
        x: rect.x + (e.clientX - box.left - frame.x) / scale,
        y: rect.y + (e.clientY - box.top - frame.y) / scale
      };
      zoomTo(view.zoom * Math.exp(-e.deltaY * 0.0015), at);
    };
    node.addEventListener('wheel', on, { passive: false });
    return { destroy: () => node.removeEventListener('wheel', on) };
  }

  function key(e: KeyboardEvent) {
    if (!rect) return;
    const step = (e.shiftKey ? 40 : 10) / scale;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    };
    if (moves[e.key]) set({ cx: view.cx + moves[e.key][0], cy: view.cy + moves[e.key][1], zoom: view.zoom });
    else if (e.key === '+' || e.key === '=') zoomTo(view.zoom * 1.15);
    else if (e.key === '-') zoomTo(view.zoom / 1.15);
    else if (e.key === '0') view = initialView(iw, ih);
    else return;
    e.preventDefault();
  }

  /** L'image recadrée, prête à envoyer. */
  export function result(): Promise<Uint8Array> {
    if (!rect) return Promise.reject(new Error('image'));
    return cropImage(file, shape, rect);
  }
</script>

<div class="crop">
  <!-- Zone pilotée au clavier (flèches, +/-) et au pointeur : une « application » au sens ARIA. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="stage {shape}"
    class:dragging
    class:ready={!!rect}
    bind:clientWidth={sw}
    bind:clientHeight={sh}
    role="application"
    tabindex="0"
    aria-label="Zone de recadrage. Flèches pour déplacer l'image, plus et moins pour zoomer, zéro pour recentrer."
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
    use:wheel
  >
    <img
      src={url}
      alt=""
      draggable="false"
      onload={loaded}
      onerror={() => onerror?.()}
      style:left="{rect ? frame.x - rect.x * scale : 0}px"
      style:top="{rect ? frame.y - rect.y * scale : 0}px"
      style:width="{iw * scale}px"
      style:height="{ih * scale}px"
    />
    {#if rect}
      <div
        class="frame"
        aria-hidden="true"
        style:left="{frame.x}px"
        style:top="{frame.y}px"
        style:width="{frame.w}px"
        style:height="{frame.h}px"
      >
        <span class="grid"></span>
      </div>
    {/if}
  </div>
  <div class="zoom">
    <label for="crop-zoom">Zoom</label>
    <button type="button" class="zbtn" aria-label="Dézoomer" disabled={!rect || view.zoom <= 1} onclick={() => zoomTo(view.zoom / 1.25)}
      >−</button
    >
    <input
      id="crop-zoom"
      type="range"
      min="1"
      max={MAX_ZOOM}
      step="0.01"
      disabled={!rect}
      value={view.zoom}
      oninput={(e) => zoomTo(Number((e.currentTarget as HTMLInputElement).value))}
      style:--fill="{((view.zoom - 1) / (MAX_ZOOM - 1)) * 100}%"
    />
    <button type="button" class="zbtn" aria-label="Zoomer" disabled={!rect || view.zoom >= MAX_ZOOM} onclick={() => zoomTo(view.zoom * 1.25)}
      >+</button
    >
    <button type="button" class="btn-reset" disabled={!rect} onclick={() => (view = initialView(iw, ih))}>Recentrer</button>
  </div>
  <p class="hint">Glisse l'image pour la placer dans le cadre, zoome avec la molette ou le curseur.</p>
</div>

<style>
  .crop {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stage {
    position: relative;
    overflow: hidden;
    border-radius: 14px;
    background:
      repeating-conic-gradient(rgb(var(--ink) / 0.06) 0% 25%, transparent 0% 50%) 0 0 / 18px 18px,
      var(--bg-deep);
    border: 1px solid var(--border-2);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .stage.avatar {
    height: 300px;
  }

  .stage.banner {
    height: 230px;
  }

  .stage.dragging {
    cursor: grabbing;
  }

  .stage:focus-visible {
    outline: 2px solid var(--accent-ring);
    outline-offset: 2px;
  }

  .stage img {
    position: absolute;
    max-width: none;
    pointer-events: none;
    opacity: 0;
  }

  .stage.ready img {
    opacity: 1;
  }

  .frame {
    position: absolute;
    pointer-events: none;
    box-shadow:
      0 0 0 9999px rgb(0 0 0 / 0.62),
      inset 0 0 0 2px rgb(255 255 255 / 0.92);
    border-radius: 10px;
  }

  .avatar .frame {
    border-radius: 50%;
  }

  /* Repères des tiers, seulement pendant le déplacement. */
  .grid {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    opacity: 0;
    transition: opacity 0.15s;
    background:
      linear-gradient(to right, transparent calc(33.33% - 0.5px), rgb(255 255 255 / 0.35) 0 calc(33.33% + 0.5px), transparent 0 calc(66.66% - 0.5px), rgb(255 255 255 / 0.35) 0 calc(66.66% + 0.5px), transparent 0),
      linear-gradient(to bottom, transparent calc(33.33% - 0.5px), rgb(255 255 255 / 0.35) 0 calc(33.33% + 0.5px), transparent 0 calc(66.66% - 0.5px), rgb(255 255 255 / 0.35) 0 calc(66.66% + 0.5px), transparent 0);
  }

  .dragging .grid {
    opacity: 1;
  }

  .zoom {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .zoom label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-3);
    margin-right: 2px;
  }

  .zbtn {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--surface-3);
    color: var(--text-2);
    font-size: 17px;
    line-height: 1;
  }

  .zbtn:hover:not(:disabled) {
    background: var(--surface-4);
    color: var(--strong);
  }

  .zbtn:disabled,
  .btn-reset:disabled {
    opacity: 0.4;
  }

  input[type='range'] {
    flex: 1;
    min-width: 0;
    height: 4px;
    appearance: none;
    border-radius: 99px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--surface-4) var(--fill));
    cursor: pointer;
  }

  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 0 0 3px var(--accent),
      0 2px 6px rgb(0 0 0 / 0.35);
  }

  input[type='range']:focus-visible {
    outline: 2px solid var(--accent-ring);
    outline-offset: 6px;
  }

  .btn-reset {
    margin-left: 4px;
    padding: 6px 11px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-2);
    background: var(--surface-3);
  }

  .btn-reset:hover:not(:disabled) {
    background: var(--surface-4);
    color: var(--strong);
  }

  .hint {
    font-size: 12.5px;
    color: var(--muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .grid {
      transition: none;
    }
  }
</style>
