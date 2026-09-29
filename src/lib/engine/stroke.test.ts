import { describe, expect, it } from 'vitest';
import { curveBetween, mapPressure, MIN_PRESSURE, outlineOf, PF_SCALE } from './stroke';

describe('stroke input', () => {
  it('fills a long gap with points on a curve, a short one not at all', () => {
    const out: number[][] = [];
    curveBetween([0, 0, 0.5], [0, 0, 0.5], [10, 0, 0.5], [20, 0, 0.5], 2, out);
    expect(out).toHaveLength(4);
    for (const p of out) {
      expect(p[0]).toBeGreaterThan(0);
      expect(p[0]).toBeLessThan(10);
      expect(p[1]).toBeCloseTo(0);
    }
    const none: number[][] = [];
    curveBetween([0, 0, 0.5], [0, 0, 0.5], [1, 0, 0.5], [2, 0, 0.5], 2, none);
    expect(none).toHaveLength(0);
  });

  it('bends the filled points the way the neighbours go, without overshoot', () => {
    // four samples of a circle of radius 10, the gap between the middle two
    // should bulge outwards and stay close to the circle
    const at = (deg: number) => [Math.cos((deg * Math.PI) / 180) * 10, Math.sin((deg * Math.PI) / 180) * 10, 0.5];
    const out: number[][] = [];
    curveBetween(at(0), at(60), at(120), at(180), 1, out);
    for (const p of out) {
      const r = Math.hypot(p[0], p[1]);
      expect(r).toBeGreaterThan(9.2);
      expect(r).toBeLessThan(10.4);
    }
  });

  it('blends the pressure along the gap', () => {
    const out: number[][] = [];
    curveBetween([0, 0, 0], [0, 0, 0], [10, 0, 1], [10, 0, 1], 5, out);
    expect(out[0][2]).toBeCloseTo(0.5);
  });

  it('maps pen pressure so light writing looks normal', () => {
    expect(mapPressure(1, 0.5)).toBe(1);
    expect(mapPressure(0.3, 0.5)).toBeGreaterThan(0.4);
    // no sensitivity means every pressure looks the same
    expect(mapPressure(0.1, 0)).toBe(0.5);
    expect(mapPressure(0.9, 0)).toBe(0.5);
    // more sensitivity spreads it out
    expect(mapPressure(0.2, 1)).toBeLessThan(mapPressure(0.2, 0.5));
  });
});

const PENS_ALL = ['ballpoint', 'fountain', 'marker', 'pencil'] as const;

// a line along x in page units, scaled like the pen tool gives it
function line(from: number, to: number, step: number, pressure = 0.5): number[][] {
  const pts: number[][] = [];
  for (let x = from; x <= to + 1e-9; x += step) pts.push([x * PF_SCALE, 0, pressure]);
  return pts;
}

// half the width of the outline across x
function halfWidthAt(outline: number[][], x: number): number {
  let best = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const ax = a[0] / PF_SCALE;
    const bx = b[0] / PF_SCALE;
    if ((ax - x) * (bx - x) > 0 || ax === bx) continue;
    const t = (x - ax) / (bx - ax);
    best = Math.max(best, Math.abs(a[1] + (b[1] - a[1]) * t) / PF_SCALE);
  }
  return best;
}

describe('stroke outline', () => {
  it('makes a round dot of a tap with every pen', () => {
    for (const pen of PENS_ALL) {
      const outline = outlineOf([[10 * PF_SCALE, 10 * PF_SCALE, 0.3]], pen, 2.5);
      expect(outline.length).toBeGreaterThan(8);
      const r = outline.map((p) => Math.hypot(p[0] / PF_SCALE - 10, p[1] / PF_SCALE - 10));
      expect(Math.min(...r)).toBeGreaterThan(0.4);
      expect(Math.max(...r) - Math.min(...r)).toBeLessThan(0.05);
    }
  });

  it('shows a tick of a little more than a point', () => {
    for (const pen of PENS_ALL) {
      const outline = outlineOf(line(0, 1.2, 0.3), pen, 2.5);
      const xs = outline.map((p) => p[0] / PF_SCALE);
      expect(Math.min(...xs)).toBeLessThan(-0.4);
      expect(Math.max(...xs)).toBeGreaterThan(1.6);
      expect(halfWidthAt(outline, 0.6)).toBeGreaterThan(0.35);
    }
  });

  it('starts at the first point and ends at the last', () => {
    const outline = outlineOf(line(0, 30, 0.4), 'ballpoint', 2.5);
    const xs = outline.map((p) => p[0] / PF_SCALE);
    // the round caps reach out half a pen width past the ends
    expect(Math.min(...xs)).toBeCloseTo(-halfWidthAt(outline, 15), 1);
    expect(Math.max(...xs)).toBeCloseTo(30 + halfWidthAt(outline, 15), 1);
  });

  it('ends round, no wider than the line, when a slow end jitters on the spot', () => {
    const pts = line(0, 20, 0.25);
    // the pen nearly stops before the lift, the hand still shakes a little
    const jitter = [0.06, -0.05, 0.08, -0.07, 0.04, -0.08, 0.07, -0.04, 0.05, -0.06];
    for (let i = 0; i < jitter.length; i++) pts.push([(20 + i * 0.02) * PF_SCALE, jitter[i] * PF_SCALE, 0.5]);
    pts.push([20.1 * PF_SCALE, 0, 0.5]);
    const outline = outlineOf(pts, 'ballpoint', 2.5);
    const body = halfWidthAt(outline, 10);
    const cap = outline.filter((p) => p[0] / PF_SCALE > 19);
    expect(Math.max(...cap.map((p) => Math.abs(p[1] / PF_SCALE)))).toBeLessThan(body * 1.1);
    expect(Math.max(...cap.map((p) => p[0] / PF_SCALE))).toBeLessThan(20.1 + body * 1.1);
    expect(halfWidthAt(outline, 18.5)).toBeGreaterThan(body * 0.9);
  });

  it('gives a light start a sane width', () => {
    const light = outlineOf(line(0, 10, 0.5, mapPressure(0.01, 0.5)), 'ballpoint', 2.5);
    const normal = outlineOf(line(0, 10, 0.5, mapPressure(0.4, 0.5)), 'ballpoint', 2.5);
    expect(halfWidthAt(light, 5)).toBeGreaterThan(halfWidthAt(normal, 5) * 0.85);
    expect(mapPressure(0, 0.5)).toBe(MIN_PRESSURE);
  });

  it('keeps a short fountain pen mark from being all taper', () => {
    const outline = outlineOf(line(0, 4, 0.25), 'fountain', 3.5);
    expect(halfWidthAt(outline, 2)).toBeGreaterThan(3.5 * 0.25);
  });
});
