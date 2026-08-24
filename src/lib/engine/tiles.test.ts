import { describe, expect, it } from 'vitest';
import { TILE, tileKey, tilesFor, visibleTiles } from './tiles';

describe('tile math', () => {
  it('gives every tile its own key, also left of and above the origin', () => {
    const keys = new Set<number>();
    for (let tx = -3; tx <= 3; tx++) {
      for (let ty = -3; ty <= 3; ty++) keys.add(tileKey(tx, ty));
    }
    expect(keys.size).toBe(49);
    expect(tileKey(-100000, 5)).not.toBe(tileKey(5, -100000));
  });

  it('covers a box with the tiles it touches', () => {
    // at scale 2 a tile is 256 units wide
    expect(tilesFor({ minX: 0, minY: 0, maxX: 255, maxY: 255 }, 2)).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
    expect(tilesFor({ minX: -1, minY: 100, maxX: 300, maxY: 600 }, 2)).toEqual({ x0: -1, y0: 0, x1: 1, y1: 2 });
  });

  it('finds the tiles on screen at the exact zoom', () => {
    // zoom 1 at dpr 1: a tile is 512 units, a 1024 x 600 view needs 2 x 2
    const r = visibleTiles({ x: 0, y: 0, zoom: 1 }, 1024, 600, 1);
    expect(r).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
    // half a tile in, one more column shows up
    const shifted = visibleTiles({ x: TILE / 2, y: -10, zoom: 1 }, 1024, 600, 1);
    expect(shifted).toEqual({ x0: 0, y0: -1, x1: 2, y1: 1 });
  });

  it('needs the same number of device pixels in tiles at any zoom', () => {
    for (const zoom of [0.25, 1, 3.5]) {
      for (const dpr of [1, 2]) {
        const r = visibleTiles({ x: 0, y: 0, zoom }, 1000, 800, zoom * dpr);
        const w = (r.x1 - r.x0 + 1) * TILE;
        const h = (r.y1 - r.y0 + 1) * TILE;
        expect(w).toBeGreaterThanOrEqual(1000 * dpr);
        expect(w).toBeLessThan(1000 * dpr + TILE);
        expect(h).toBeGreaterThanOrEqual(800 * dpr);
        expect(h).toBeLessThan(800 * dpr + TILE);
      }
    }
  });
});
