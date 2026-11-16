import { describe, expect, it } from 'vitest';
import { clampView, cropRect, initialView, MAX_ZOOM, zoomAt } from './avatar';

describe('recadrage', () => {
  it('part de la plus grande zone possible, au centre', () => {
    expect(cropRect(1920, 1080, 1, initialView(1920, 1080))).toEqual({ x: 420, y: 0, w: 1080, h: 1080 });
    expect(cropRect(3000, 3000, 3, initialView(3000, 3000))).toEqual({ x: 0, y: 1000, w: 3000, h: 1000 });
    expect(cropRect(4000, 1000, 3, initialView(4000, 1000))).toEqual({ x: 500, y: 0, w: 3000, h: 1000 });
  });

  it('garde la zone dans l\'image', () => {
    expect(cropRect(1920, 1080, 1, { cx: 0, cy: 0, zoom: 1 })).toEqual({ x: 0, y: 0, w: 1080, h: 1080 });
    expect(cropRect(1920, 1080, 1, { cx: 5000, cy: 540, zoom: 2 })).toEqual({ x: 1380, y: 270, w: 540, h: 540 });
    expect(clampView(1000, 1000, 1, { cx: 0, cy: 1000, zoom: 9 })).toEqual({ cx: 100, cy: 900, zoom: MAX_ZOOM });
    expect(clampView(1000, 1000, 1, { cx: 500, cy: 500, zoom: 0.2 }).zoom).toBe(1);
  });

  it('zoome autour du point visé', () => {
    const v = zoomAt(1000, 1000, 1, initialView(1000, 1000), 2, { x: 250, y: 250 });
    expect(v).toEqual({ cx: 375, cy: 375, zoom: 2 });
    expect(zoomAt(1000, 1000, 1, v, 1)).toEqual({ cx: 500, cy: 500, zoom: 1 });
  });
});
