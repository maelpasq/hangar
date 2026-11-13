<script lang="ts">
  // Logo de Hangar MC : l'arche et l'étoile de Hangar (design/brand/hangar-mark.svg) en pixels,
  // monochrome (couleur du texte). Même dessin que l'accueil du mod (`Home.MARK`, 17 x 13).
  let { size = 18 }: { size?: number } = $props();
  const MARK =
    'M7 0h3v1h-3zM5 1h7v1h-7zM3 2h11v1h-11zM2 3h6v1h-6zM9 3h6v1h-6zM1 4h5v1h-5zM11 4h5v1h-5zM0 5h5v1h-5zM12 5h5v1h-5zM0 6h3v1h-3zM8 6h1v1h-1zM14 6h3v1h-3zM0 7h3v1h-3zM7 7h3v1h-3zM14 7h3v1h-3zM0 8h3v1h-3zM5 8h7v1h-7zM14 8h3v1h-3zM0 9h3v1h-3zM7 9h3v1h-3zM14 9h3v1h-3zM0 10h3v1h-3zM8 10h1v1h-1zM14 10h3v1h-3zM0 11h3v1h-3zM14 11h3v1h-3zM0 12h2v1h-2zM15 12h2v1h-2z';
</script>

<svg width={size} height={size} viewBox="0 -2 17 17" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">
  <path d={MARK} />
</svg>
