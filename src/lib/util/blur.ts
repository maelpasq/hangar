// Flou calculé une seule fois par image : réduite par moitiés successives (chaque réduction
// lissée moyenne les pixels, comme un flou) jusqu'à quelques pixels, puis agrandie par le
// navigateur, qui lisse l'agrandissement. Aucun `filter: blur()` recalculé à chaque image :
// rapide sur tous les systèmes, y compris Linux (WebKitGTK) sans accélération graphique.
// La toile n'est jamais relue (getImageData), donc une image d'une autre origine convient.

const cache = new Map<string, Promise<HTMLCanvasElement | null>>();
const MAX_CACHE = 200;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Réduit `src` à `size` pixels sur son plus grand côté (résultat partagé, ne pas modifier). */
function shrink(src: string, size: number): Promise<HTMLCanvasElement | null> {
  const key = `${size}|${src}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      try {
        await img.decode();
      } catch {
        return null;
      }
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (!w || !h) return null;
      let from: CanvasImageSource = img;
      // Moitiés successives : une seule grosse réduction sauterait des pixels (scintillement).
      while (Math.max(w, h) > size * 2) {
        const c = canvas(w / 2, h / 2);
        const ctx = c.getContext('2d')!;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(from, 0, 0, c.width, c.height);
        from = c;
        w = c.width;
        h = c.height;
      }
      const k = size / Math.max(w, h);
      const out = canvas(w * k, h * k);
      const ctx = out.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(from, 0, 0, out.width, out.height);
      return out;
    })();
    cache.set(key, p);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/**
 * Dessine dans `target` la version floutée de `src`, assombrie (`brightness` < 1).
 * Renvoie faux si l'image n'a pas pu être lue (la toile reste vide).
 */
export async function drawBlurred(target: HTMLCanvasElement, src: string, size: number, brightness = 1): Promise<boolean> {
  const small = await shrink(src, size);
  if (!small) return false;
  target.width = small.width;
  target.height = small.height;
  const ctx = target.getContext('2d')!;
  ctx.drawImage(small, 0, 0);
  if (brightness < 1) {
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - brightness})`;
    ctx.fillRect(0, 0, target.width, target.height);
  }
  return true;
}
