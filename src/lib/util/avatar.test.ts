import { describe, expect, it } from 'vitest';
import { centerSquare } from './avatar';

describe('avatar', () => {
  it('recadre au centre, sur le côté le plus court', () => {
    expect(centerSquare(1920, 1080)).toEqual({ x: 420, y: 0, side: 1080 });
    expect(centerSquare(300, 500)).toEqual({ x: 0, y: 100, side: 300 });
    expect(centerSquare(256, 256)).toEqual({ x: 0, y: 0, side: 256 });
  });
});
