import { describe, expect, it } from 'vitest';
import { cutStroke, distToSegment, inkNear, itemAt, lassoHits, pointInPolygon, segmentsDistance, strokeNear } from './hit';
import type { Item } from './types';

// a straight line from x = 0 to x = 100 at y = 0, one point every 10 units
function line(): Float32Array {
  const pts: number[] = [];
  for (let x = 0; x <= 100; x += 10) pts.push(x, 0, 0.5);
  return new Float32Array(pts);
}

function xs(piece: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < piece.length; i += 3) out.push(Math.round(piece[i] * 100) / 100);
  return out;
}

describe('distances', () => {
  it('measures from a point to a segment', () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(distToSegment(-4, 3, 0, 0, 10, 0)).toBe(5);
    expect(distToSegment(13, 4, 0, 0, 10, 0)).toBe(5);
    expect(distToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
  });

  it('measures between two segments', () => {
    expect(segmentsDistance(0, 0, 10, 10, 0, 10, 10, 0)).toBe(0);
    expect(segmentsDistance(0, 0, 10, 0, 0, 5, 10, 5)).toBe(5);
    expect(segmentsDistance(0, 0, 10, 0, 13, 4, 20, 4)).toBe(5);
  });

  it('finds a line near the eraser path', () => {
    const pts = line();
    expect(strokeNear(pts, 50, 4, 50, 4, 5)).toBe(true);
    expect(strokeNear(pts, 50, 6, 50, 6, 5)).toBe(false);
    // the eraser crossed the line between two of its samples
    expect(strokeNear(pts, 45, -20, 45, 20, 1)).toBe(true);
  });
});

describe('point in polygon', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10];
  const ell = [0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10];

  it('tells inside from outside', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(2, 8, ell)).toBe(true);
    expect(pointInPolygon(8, 8, ell)).toBe(false);
  });
});

describe('area erasing', () => {
  it('leaves the line alone when the eraser misses it', () => {
    expect(cutStroke(line(), 50, 20, 60, 20, 5)).toBeNull();
  });

  it('cuts a gap out of the middle', () => {
    const pieces = cutStroke(line(), 50, 0, 50, 0, 5)!;
    expect(pieces).toHaveLength(2);
    expect(xs(pieces[0])).toEqual([0, 10, 20, 30, 40, 45]);
    expect(xs(pieces[1])).toEqual([55, 60, 70, 80, 90, 100]);
  });

  it('cuts the end off', () => {
    const pieces = cutStroke(line(), 100, 0, 100, 0, 15)!;
    expect(pieces).toHaveLength(1);
    expect(xs(pieces[0])).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 85]);
  });

  it('cuts between two samples when the eraser crosses there', () => {
    const pieces = cutStroke(line(), 45, -20, 45, 20, 2)!;
    expect(pieces).toHaveLength(2);
    expect(xs(pieces[0])).toEqual([0, 10, 20, 30, 40, 43]);
    expect(xs(pieces[1])).toEqual([47, 50, 60, 70, 80, 90, 100]);
  });

  it('erases all of a line it covers', () => {
    expect(cutStroke(line(), 0, 0, 100, 0, 5)).toEqual([]);
  });

  it('erases a dot it touches and keeps the pressure along the cut', () => {
    expect(cutStroke(new Float32Array([5, 5, 0.5]), 5, 6, 5, 6, 2)).toEqual([]);
    const ramp = new Float32Array([0, 0, 0, 10, 0, 1]);
    const pieces = cutStroke(ramp, 10, 0, 10, 0, 5)!;
    expect(pieces[0][5]).toBeCloseTo(0.5, 2);
  });
});

function stroke(id: string, pts: number[]): Item {
  return { id, type: 'stroke', pen: 'ballpoint', color: '#000', size: 2, pts: new Float32Array(pts) };
}

// a row of points from (x0, y) to (x1, y)
function row(x0: number, x1: number, y: number): number[] {
  const pts: number[] = [];
  for (let x = x0; x <= x1; x += 5) pts.push(x, y, 0.5);
  return pts;
}

describe('picking items', () => {
  const ink = stroke('ink', row(0, 100, 50));
  const box: Item = { id: 'box', type: 'shape', kind: 'rect', x1: 200, y1: 0, x2: 300, y2: 100, color: '#000', size: 2 };
  const pic: Item = { id: 'pic', type: 'image', assetId: 'a', x: 400, y: 0, w: 100, h: 80 };
  const note: Item = { id: 'note', type: 'text', x: 0, y: 200, w: 120, text: 'hello', size: 20, color: '#000' };
  const items = [ink, box, pic, note];

  it('finds a stroke on its line, not next to it', () => {
    expect(itemAt(items, 52, 51, 3)).toBe(ink);
    expect(itemAt(items, 52, 60, 3)).toBeNull();
  });

  it('finds a box on its edge but not in the middle', () => {
    expect(itemAt(items, 201, 50, 3)).toBe(box);
    expect(itemAt(items, 250, 50, 3)).toBeNull();
  });

  it('finds pictures and text anywhere in their box', () => {
    expect(itemAt(items, 450, 40, 3)).toBe(pic);
    expect(itemAt(items, 60, 210, 3)).toBe(note);
  });

  it('takes the topmost item first', () => {
    const over = stroke('over', row(380, 520, 40));
    expect(itemAt([...items, over], 450, 40, 3)).toBe(over);
    expect(itemAt([over, ...items], 450, 40, 3)).toBe(pic);
  });

  it('erases shapes on their outline', () => {
    expect(inkNear(box, 300, 120, 300, 90, 2)).toBe(true);
    expect(inkNear(box, 250, 40, 250, 60, 2)).toBe(false);
  });
});

describe('lasso', () => {
  const a = stroke('a', row(10, 90, 20));
  const b = stroke('b', row(10, 90, 60));
  // half in, half out of the loop below
  const c = stroke('c', row(60, 200, 40));
  const line: Item = { id: 'line', type: 'shape', kind: 'line', x1: 20, y1: 80, x2: 80, y2: 85, color: '#000', size: 2 };
  const pic: Item = { id: 'pic', type: 'image', assetId: 'x', x: 30, y: 30, w: 20, h: 20 };
  const far: Item = { id: 'far', type: 'text', x: 500, y: 500, w: 40, text: 'far', size: 12, color: '#000' };
  // a rough loop around x 0..130, y 0..100
  const loop = [0, 0, 60, -5, 130, 0, 135, 50, 130, 100, 60, 105, 0, 100, -5, 50];

  it('selects what it goes around', () => {
    expect(lassoHits([a, b, line, pic, far], loop)).toEqual([a, b, line, pic]);
  });

  it('needs at least half of a stroke inside', () => {
    expect(lassoHits([c], loop)).toEqual([c]);
    expect(lassoHits([stroke('d', row(100, 300, 40))], loop)).toEqual([]);
  });

  it('needs a real loop', () => {
    expect(lassoHits([a], [0, 0, 100, 100])).toEqual([]);
  });
});
