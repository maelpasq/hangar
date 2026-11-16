// Avatar et bannière du compte Hangar : l'image choisie est recadrée par l'utilisateur
// (ImageCropper.svelte), puis réduite ici avant l'envoi.

/** Côté de l'avatar envoyé (il s'affiche au plus en 72 px, net sur un écran haute densité). */
export const AVATAR_SIZE = 256;
/** Bannière du profil : 1600 × 400 (4:1). */
export const BANNER_W = 1600;
export const BANNER_H = 400;
/** Image choisie trop lourde pour valoir la peine d'être décodée. */
export const MAX_INPUT = 20 * 1024 * 1024;
/** Zoom maximal du recadrage (1 = la plus grande zone possible). */
export const MAX_ZOOM = 5;

export type CropShape = 'avatar' | 'banner';

/** Taille et qualité de l'image envoyée (1 Mo au plus côté serveur pour la bannière). */
export const CROP_OUT: Record<CropShape, { w: number; h: number; quality: number }> = {
  avatar: { w: AVATAR_SIZE, h: AVATAR_SIZE, quality: 0.88 },
  banner: { w: BANNER_W, h: BANNER_H, quality: 0.82 }
};

export const cropRatio = (shape: CropShape) => CROP_OUT[shape].w / CROP_OUT[shape].h;

/** Zone gardée, en pixels de l'image d'origine. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Réglage du recadrage : centre de la zone (pixels de l'image) et zoom. */
export interface CropView {
  cx: number;
  cy: number;
  zoom: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Zone gardée pour un réglage : au format voulu, toujours entièrement dans l'image. */
export function cropRect(iw: number, ih: number, ratio: number, v: CropView): CropRect {
  const bw = Math.min(iw, ih * ratio);
  const z = clamp(v.zoom, 1, MAX_ZOOM);
  const w = bw / z;
  const h = bw / ratio / z;
  return { x: clamp(v.cx - w / 2, 0, iw - w), y: clamp(v.cy - h / 2, 0, ih - h), w, h };
}

/** Réglage ramené dans les bornes (zoom permis, zone dans l'image). */
export function clampView(iw: number, ih: number, ratio: number, v: CropView): CropView {
  const r = cropRect(iw, ih, ratio, v);
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, zoom: clamp(v.zoom, 1, MAX_ZOOM) };
}

/** Réglage de départ : la plus grande zone possible, au centre. */
export const initialView = (iw: number, ih: number): CropView => ({ cx: iw / 2, cy: ih / 2, zoom: 1 });

/** Change le zoom en gardant fixe le point (pixels de l'image) sous le curseur, ou le centre. */
export function zoomAt(iw: number, ih: number, ratio: number, v: CropView, zoom: number, at?: { x: number; y: number }): CropView {
  const z = clamp(zoom, 1, MAX_ZOOM);
  if (!at) return clampView(iw, ih, ratio, { ...v, zoom: z });
  const k = v.zoom / z;
  return clampView(iw, ih, ratio, { cx: at.x + (v.cx - at.x) * k, cy: at.y + (v.cy - at.y) * k, zoom: z });
}

/** Vérifie l'image choisie avant de l'ouvrir dans le recadrage. */
export function acceptImage(file: File): boolean {
  return file.type.startsWith('image/') && file.size <= MAX_INPUT;
}

/** Découpe la zone et la réduit en WebP (PNG si le WebP n'est pas pris en charge). */
export async function cropImage(file: Blob, shape: CropShape, rect: CropRect): Promise<Uint8Array> {
  const out = CROP_OUT[shape];
  const bmp = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('image');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, rect.x, rect.y, rect.w, rect.h, 0, 0, out.w, out.h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', out.quality));
    if (!blob) throw new Error('image');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bmp.close();
  }
}
