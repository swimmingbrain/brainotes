import { describe, expect, it } from 'vitest';
import { cutStroke, distToSegment, pointInPolygon, segmentsDistance, strokeNear } from './hit';

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
