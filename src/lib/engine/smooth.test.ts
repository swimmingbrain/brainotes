import { describe, expect, it } from 'vitest';
import { euro, newEuro, smoothingOf } from './smooth';

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
