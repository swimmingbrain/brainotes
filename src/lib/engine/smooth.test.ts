import { describe, expect, it } from 'vitest';
import { euro, newEuro, refit, smoothingOf } from './smooth';

const STEP = 1000 / 240;

// a pen moving right at speed px/s with a jitter of size px that flips every sample
function run(speed: number, jitter: number, count: number, settings = smoothingOf(0.5)) {
  const f = newEuro(settings.min, settings.beta);
  const out: { x: number; y: number; px: number; py: number }[] = [];
  for (let i = 0; i < count; i++) {
    const px = (speed * i * STEP) / 1000;
    const py = i % 2 === 0 ? jitter : -jitter;
    euro(f, px, py, i * STEP);
    out.push({ x: f.x, y: f.y, px, py });
  }
  return out;
}

function wobble(list: { y: number }[]): number {
  return Math.sqrt(list.reduce((s, p) => s + p.y * p.y, 0) / list.length);
}

describe('pen filter', () => {
  it('takes the jitter out of a slow pen', () => {
    const out = run(20, 0.3, 120).slice(20);
    expect(wobble(out)).toBeLessThan(0.08);
  });

  it('stays close behind a fast pen', () => {
    const out = run(400, 0, 120).slice(20);
    for (const p of out) expect(p.px - p.x).toBeLessThan(1.5);
  });

  it('does not hold back a stroke that starts fast', () => {
    const out = run(300, 0, 8);
    expect(out[0].x).toBe(0);
    expect(out[7].px - out[7].x).toBeLessThan(2);
  });

  it('follows the pen exactly with no smoothing', () => {
    const out = run(50, 0.3, 40, smoothingOf(0));
    for (const p of out) {
      expect(p.x).toBeCloseTo(p.px, 1);
      expect(p.y).toBeCloseTo(p.py, 1);
    }
  });

  it('smooths more with a higher preference', () => {
    expect(smoothingOf(1).min).toBeLessThan(smoothingOf(0.5).min);
    expect(smoothingOf(1).refit).toBeGreaterThan(smoothingOf(0.5).refit);
    expect(wobble(run(20, 0.3, 120, smoothingOf(1)).slice(20))).toBeLessThan(wobble(run(20, 0.3, 120).slice(20)));
  });
});

// a line along x with a small wobble on y
function shaky(count: number, step: number, size: number): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < count; i++) pts.push([i * step, (i % 2 === 0 ? 1 : -1) * size, 0.5]);
  return pts;
}

describe('refit after the lift', () => {
  it('keeps both ends where they are', () => {
    const pts = shaky(40, 0.5, 0.3);
    const out = refit(pts, 2, 0.35);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('takes the wobble out of a line', () => {
    const pts = shaky(60, 0.5, 0.3);
    const out = refit(pts, 2, 0.35);
    expect(wobble(out.slice(8, -8).map((p) => ({ y: p[1] })))).toBeLessThan(0.08);
  });

  it('moves no point further than allowed', () => {
    const pts = shaky(60, 0.5, 2);
    const out = refit(pts, 3, 0.35);
    for (let i = 0; i < pts.length; i++) {
      expect(Math.hypot(out[i][0] - pts[i][0], out[i][1] - pts[i][1])).toBeLessThanOrEqual(0.35 + 1e-9);
    }
  });

  it('keeps a corner sharp', () => {
    // down to a point and up again, like the bottom of a v
    const pts: number[][] = [];
    for (let i = 0; i <= 20; i++) pts.push([i * 0.5, i * 0.5, 0.5]);
    for (let i = 1; i <= 20; i++) pts.push([10 + i * 0.5, 10 - i * 0.5, 0.5]);
    const out = refit(pts, 2, 0.35);
    expect(out[20][0]).toBe(10);
    expect(out[20][1]).toBe(10);
  });

  it('keeps the pressure', () => {
    const pts = shaky(20, 0.5, 0.3).map((p, i) => [p[0], p[1], i / 20]);
    const out = refit(pts, 2, 0.35);
    for (let i = 0; i < pts.length; i++) expect(out[i][2]).toBe(pts[i][2]);
  });

  it('leaves a line of two points alone', () => {
    const pts = [
      [0, 0, 0.5],
      [3, 1, 0.5]
    ];
    expect(refit(pts, 2, 0.35)).toEqual(pts);
  });
});
