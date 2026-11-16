// Avatar du compte Hangar : l'image choisie est recadrée au centre et réduite ici, avant l'envoi.

/** Côté de l'avatar envoyé (il s'affiche au plus en 72 px, net sur un écran haute densité). */
export const AVATAR_SIZE = 256;
/** Image choisie trop lourde pour valoir la peine d'être décodée. */
const MAX_INPUT = 20 * 1024 * 1024;

/** Carré centré (source) qui remplit l'avatar : le côté le plus court, au milieu de l'autre. */
export function centerSquare(w: number, h: number): { x: number; y: number; side: number } {
  const side = Math.min(w, h);
  return { x: Math.round((w - side) / 2), y: Math.round((h - side) / 2), side };
}

/** Recadre et réduit l'image en un carré WebP (PNG si le WebP n'est pas pris en charge). */
export async function squareAvatar(file: File): Promise<Uint8Array> {
  if (!file.type.startsWith('image/') || file.size > MAX_INPUT) throw new Error('image');
  const bmp = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('image');
    ctx.imageSmoothingQuality = 'high';
    const { x, y, side } = centerSquare(bmp.width, bmp.height);
    ctx.drawImage(bmp, x, y, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.88));
    if (!blob) throw new Error('image');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bmp.close();
  }
}

/** Bannière du profil : 1500 × 500 (3:1), recadrée au centre. */
export const BANNER_W = 1500;
export const BANNER_H = 500;

/** Rectangle centré (source) au format de la bannière. */
export function centerWide(w: number, h: number, ratio = BANNER_W / BANNER_H): { x: number; y: number; w: number; h: number } {
  const cw = Math.min(w, Math.round(h * ratio));
  const ch = Math.min(h, Math.round(cw / ratio));
  return { x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: cw, h: ch };
}

/** Recadre et réduit l'image en bannière WebP (1 Mo au plus côté serveur). */
export async function wideBanner(file: File): Promise<Uint8Array> {
  if (!file.type.startsWith('image/') || file.size > MAX_INPUT) throw new Error('image');
  const bmp = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = BANNER_W;
    canvas.height = BANNER_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('image');
    ctx.imageSmoothingQuality = 'high';
    const r = centerWide(bmp.width, bmp.height);
    ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, BANNER_W, BANNER_H);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.82));
    if (!blob) throw new Error('image');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bmp.close();
  }
}
