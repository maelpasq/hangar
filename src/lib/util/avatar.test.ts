import { describe, expect, it } from 'vitest';
import { centerSquare, centerWide } from './avatar';

describe('avatar', () => {
  it('recadre au centre, sur le côté le plus court', () => {
    expect(centerSquare(1920, 1080)).toEqual({ x: 420, y: 0, side: 1080 });
    expect(centerSquare(300, 500)).toEqual({ x: 0, y: 100, side: 300 });
    expect(centerSquare(256, 256)).toEqual({ x: 0, y: 0, side: 256 });
  });
});

describe('bannière', () => {
  it('garde le format 3:1 au centre', () => {
    expect(centerWide(3000, 3000)).toEqual({ x: 0, y: 1000, w: 3000, h: 1000 });
    expect(centerWide(4000, 1000)).toEqual({ x: 500, y: 0, w: 3000, h: 1000 });
    expect(centerWide(1500, 500)).toEqual({ x: 0, y: 0, w: 1500, h: 500 });
  });
});
