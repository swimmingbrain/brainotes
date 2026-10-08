import { describe, expect, it } from 'vitest';
import { mapPressure, outlineOf, PF_SCALE } from '../stroke';
import type { Op } from '../history';
import type { Stroke } from '../types';
import type { CanvasView } from '../view';
import { PenTool, type PenSettings } from './pen';
import type { Sample } from './tool';

const STEP = 1000 / 240;
const SIZE = 2.5;

// just what the pen asks of the view, one page at the top left, zoom 1
function setup(settings: Partial<PenSettings> = {}) {
  const ops: Op[] = [];
  const view = {
    cam: { x: 0, y: 0, zoom: 1 },
    dpr: 1,
    doc: {
      pageCount: 1,
      notebook: { pages: [{ id: 'p', w: 600, h: 800, paper: { style: 'blank', spacing: 24, color: 'white' } }] },
      page: () => ({ items: [] })
    },
    history: { run: (op: Op) => ops.push(op) },
    pageAtScreen: () => 0,
    pageX: () => 0,
    pageY: () => 0,
    requestLive: () => {},
    requestUnder: () => {},
    applyPage: () => {},
    toDevice: (_: number, box: unknown) => box
  };
  const pen = new PenTool(view as unknown as CanvasView, () => ({
    pen: 'ballpoint',
    color: '#1f1f22',
    size: SIZE,
    pressure: 0.5,
    smoothing: 0.5,
    holdToSnap: false,
    ...settings
  }));
  const stroke = (): number[][] => {
    const op = ops[ops.length - 1];
    if (!op || op.type !== 'items') throw new Error('nothing kept');
    const item = op.added[0].item as Stroke;
    const out: number[][] = [];
    for (let i = 0; i < item.pts.length; i += 3) out.push([item.pts[i], item.pts[i + 1], item.pts[i + 2]]);
    return out;
  };
  return { pen, stroke };
}

// samples x, y, pressure at 240 a second from start ms, then the lift
function write(pen: PenTool, list: number[][], lift?: number[], start = 0) {
  list.forEach(([x, y, pressure], i) => {
    const s: Sample = { x, y, pressure, time: start + i * STEP };
    if (i === 0) pen.down(s, 'pen');
    else pen.move(s);
  });
  pen.up(lift ? { x: lift[0], y: lift[1], pressure: 0, time: start + list.length * STEP } : undefined);
}

// a pen going right from 50, 50 by step px a sample
function right(count: number, step: number, pressure = 0.4): number[][] {
  const list: number[][] = [];
  for (let i = 0; i < count; i++) list.push([50 + i * step, 50, pressure]);
  return list;
}

describe('pen tool', () => {
  it('starts the line where the pen touched down, also on a fast start', () => {
    const { pen, stroke } = setup();
    const list = right(20, 2);
    list[0][2] = 0;
    write(pen, list);
    expect(stroke()[0][0]).toBe(50);
    expect(stroke()[0][1]).toBe(50);
  });

  it('gives a start with no pressure the first real one', () => {
    const { pen, stroke } = setup();
    const list = right(10, 1);
    list[0][2] = 0;
    write(pen, list);
    expect(stroke()[0][2]).toBeCloseTo(mapPressure(0.4, 0.5));
  });

  it('keeps the line going while the pen reports no pressure', () => {
    const { pen, stroke } = setup();
    const list = right(30, 1);
    // the pressure falls to nothing before the lift, the pen still moves
    for (let i = 22; i < 30; i++) list[i][2] = 0;
    write(pen, list);
    const pts = stroke();
    expect(pts[pts.length - 1][0]).toBeCloseTo(79);
    expect(Math.min(...pts.map((p) => p[2]))).toBeGreaterThan(0.2);
  });

  it('ends where the pen was lifted, a little further on', () => {
    const { pen, stroke } = setup();
    write(pen, right(30, 1), [80.8, 50.3]);
    const pts = stroke();
    expect(pts[pts.length - 1][0]).toBeCloseTo(80.8);
    expect(pts[pts.length - 1][1]).toBeCloseTo(50.3);
  });

  it('does not believe a lift more than a pen width away, or turned back or aside', () => {
    for (const lift of [
      [200, 300],
      [82, 52],
      [77.6, 50.4],
      [79.3, 51.8]
    ]) {
      const { pen, stroke } = setup();
      write(pen, right(30, 1), lift);
      const pts = stroke();
      expect(pts[pts.length - 1][0]).toBeCloseTo(79);
      expect(pts[pts.length - 1][1]).toBeCloseTo(50);
    }
  });

  it('takes back the few samples at no pressure while the pen leaves the glass', () => {
    const { pen, stroke } = setup();
    const list = right(30, 1);
    // the pressure is gone, the tip drifts up and away before the up comes
    list.push([80.2, 49.2, 0], [81.4, 48, 0], [82.2, 47.1, 0]);
    write(pen, list, [83, 46]);
    const pts = stroke();
    expect(pts[pts.length - 1][0]).toBeCloseTo(79);
    expect(pts[pts.length - 1][1]).toBeCloseTo(50);
    expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(50);
  });

  it('keeps every sample where it was with no smoothing', () => {
    const { pen, stroke } = setup({ smoothing: 0 });
    // a slow shaky hand, the samples close together
    const list: number[][] = [];
    for (let i = 0; i < 80; i++) list.push([50 + i * 0.4, 50 + (i % 2 ? 0.35 : -0.35) + (i % 7) * 0.05, 0.4]);
    write(pen, list);
    const pts = stroke();
    expect(pts).toHaveLength(list.length);
    for (let i = 0; i < list.length; i++) {
      expect(pts[i][0]).toBeCloseTo(list[i][0], 4);
      expect(pts[i][1]).toBeCloseTo(list[i][1], 4);
    }
  });

  it('smooths the same shaky hand at the middle setting', () => {
    const { pen, stroke } = setup({ smoothing: 0.5 });
    const list: number[][] = [];
    for (let i = 0; i < 80; i++) list.push([50 + i * 0.4, 50 + (i % 2 ? 0.35 : -0.35), 0.4]);
    write(pen, list);
    const mid = stroke().slice(10, -10);
    expect(Math.max(...mid.map((p) => Math.abs(p[1] - 50)))).toBeLessThan(0.2);
  });

  it('keeps a tap of one or a few samples as a round dot', () => {
    for (const count of [1, 2, 3]) {
      const { pen, stroke } = setup();
      write(pen, right(count, 0.05, 0.05));
      const pts = stroke().map((p) => [p[0] * PF_SCALE, p[1] * PF_SCALE, p[2]]);
      const outline = outlineOf(pts, 'ballpoint', SIZE);
      const r = outline.map((p) => Math.hypot(p[0] / PF_SCALE - 50, p[1] / PF_SCALE - 50));
      expect(Math.min(...r)).toBeGreaterThan(SIZE * 0.4);
      expect(Math.max(...r)).toBeLessThan(SIZE * 0.6);
    }
  });

  it('ends a slow shaky line round and no wider than the line', () => {
    const { pen, stroke } = setup();
    const list = right(60, 0.6);
    // the hand shakes, at the end the pen nearly stops
    let k = 7;
    const shake = () => ((k = (k * 16807) % 2147483647) / 2147483647 - 0.5) * 0.6;
    for (const p of list) p[1] += shake();
    for (let i = 0; i < 20; i++) list.push([85.4 + i * 0.03 + shake(), 50 + shake(), 0.4]);
    write(pen, list);
    const pts = stroke().map((p) => [p[0] * PF_SCALE, p[1] * PF_SCALE, p[2]]);
    const outline = outlineOf(pts, 'ballpoint', SIZE).map((p) => [p[0] / PF_SCALE, p[1] / PF_SCALE]);
    const end = pts[pts.length - 1].map((v) => v / PF_SCALE);
    const half = (SIZE / 2) * 1.05;
    // the cap past the end is half a pen width round, just before it the line is no wider
    for (const p of outline) {
      if (p[0] >= end[0]) expect(Math.hypot(p[0] - end[0], p[1] - end[1])).toBeLessThan(half + 0.15);
      else if (p[0] > end[0] - 2) expect(Math.abs(p[1] - end[1])).toBeLessThan(half + 0.4);
    }
  });
});
