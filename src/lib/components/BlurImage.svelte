<script lang="ts">
  // Image floutée sans filtre CSS (voir util/blur.ts) : apparaît en fondu une fois prête.
  import { drawBlurred } from '../util/blur';

  let {
    src,
    size = 24,
    brightness = 1,
    class: cls = ''
  }: { src: string; size?: number; brightness?: number; class?: string } = $props();

  let el: HTMLCanvasElement;
  let ready = $state(false);

  $effect(() => {
    const s = src;
    ready = false;
    drawBlurred(el, s, size, brightness).then((ok) => {
      if (ok && s === src) ready = true;
    });
  });
</script>

<canvas bind:this={el} class={cls} class:ready aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.4s ease;
  }

  canvas.ready {
    opacity: 1;
  }
</style>
