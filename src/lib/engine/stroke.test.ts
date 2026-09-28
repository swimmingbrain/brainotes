import { describe, expect, it } from 'vitest';
import { curveBetween, mapPressure } from './stroke';

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
