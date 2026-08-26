import { getStroke, type StrokeOptions } from 'perfect-freehand';
import { derived } from './cache';
import type { PenType, Stroke } from './types';

// perfect-freehand measures a few things in absolute units (it skips the
// last 3 units of a line), which is a lot for a page in points. so the
// points go in scaled up and the outline comes back scaled down
export const PF_SCALE = 4;

interface PenLook {
  thinning: number;
  // taper lengths in pen sizes
  taperStart: number;
  taperEnd: number;
  alpha: number;
}

export const PENS: Record<PenType, PenLook> = {
  ballpoint: { thinning: 0.25, taperStart: 0, taperEnd: 0, alpha: 1 },
  fountain: { thinning: 0.6, taperStart: 2.5, taperEnd: 5, alpha: 1 },
  marker: { thinning: 0, taperStart: 0, taperEnd: 0, alpha: 1 },
  pencil: { thinning: 0.15, taperStart: 0, taperEnd: 0, alpha: 0.75 },
  highlighter: { thinning: 0, taperStart: 0, taperEnd: 0, alpha: 1 }
};

const OUTLINE_SMOOTHING = 0.6;

// the options only depend on the pen and its size, so a stroke looks the
// same every time it is drawn, whatever the preferences say by then
export function penOptions(pen: PenType, size: number): StrokeOptions {
  const look = PENS[pen];
  const s = size * PF_SCALE;
  return {
    size: s,
    thinning: look.thinning,
    smoothing: OUTLINE_SMOOTHING,
    streamline: 0,
    simulatePressure: false,
    last: true,
    start: { cap: true, taper: look.taperStart * s },
    end: { cap: true, taper: look.taperEnd * s }
  };
}

// the smoothing preference as the share of the way a new point pulls the
// line towards the pen. 0 follows the pen, 1 smooths a lot
export function followFactor(smoothing: number): number {
  const streamline = 0.15 + smoothing * 0.5;
  return 0.15 + (1 - streamline) * 0.85;
}

// light writing should already look like normal writing, the sensitivity
// (the preference, 0.5 is normal) then widens or narrows the range around
// the middle
export function mapPressure(raw: number, sensitivity: number): number {
  const curved = Math.pow(Math.max(0, Math.min(1, raw)), 0.65);
  const p = 0.5 + (curved - 0.5) * sensitivity * 2;
  return Math.max(0.05, Math.min(1, p));
}

export function scaledPoints(pts: Float32Array): number[][] {
  const out: number[][] = new Array(pts.length / 3);
  for (let i = 0, j = 0; i < pts.length; i += 3, j++) {
    out[j] = [pts[i] * PF_SCALE, pts[i + 1] * PF_SCALE, pts[i + 2]];
  }
  return out;
}

// the outline in scaled units, for points that are scaled already
export function outlineOf(points: number[][], pen: PenType, size: number): number[][] {
  return getStroke(points, penOptions(pen, size));
}

// a closed curve through the middles of the outline edges, with the
// corners as control points. it rounds off what is left of the polygon
export function traceOutline(ctx: CanvasPath, outline: number[][]) {
  const n = outline.length;
  if (n < 3) return;
  const k = 1 / PF_SCALE;
  const first = outline[0];
  const last = outline[n - 1];
  ctx.moveTo(((last[0] + first[0]) / 2) * k, ((last[1] + first[1]) / 2) * k);
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[i + 1 === n ? 0 : i + 1];
    ctx.quadraticCurveTo(a[0] * k, a[1] * k, ((a[0] + b[0]) / 2) * k, ((a[1] + b[1]) / 2) * k);
  }
  ctx.closePath();
}

export function strokePath(stroke: Stroke): Path2D {
  const d = derived(stroke);
  if (d.path) return d.path;
  const path = new Path2D();
  traceOutline(path, outlineOf(scaledPoints(stroke.pts), stroke.pen, stroke.size));
  d.path = path;
  return path;
}

export function hasPath(stroke: Stroke): boolean {
  return derived(stroke).path !== undefined;
}

// device pixels under which a stroke is drawn as a plain line, at that
// width the outline looks the same and only costs time
export const THIN = 1.5;

// the line through the points, with the ones closer than most of a pen
// width left out
export function strokeLine(stroke: Stroke): Path2D {
  const d = derived(stroke);
  if (d.line) return d.line;
  const path = new Path2D();
  const pts = stroke.pts;
  const min = stroke.size * 0.75;
  let lx = pts[0];
  let ly = pts[1];
  path.moveTo(lx, ly);
  for (let i = 3; i < pts.length; i += 3) {
    const x = pts[i];
    const y = pts[i + 1];
    if (i < pts.length - 3 && Math.hypot(x - lx, y - ly) < min) continue;
    path.lineTo(x, y);
    lx = x;
    ly = y;
  }
  // a tap still leaves a dot
  if (pts.length <= 3) path.lineTo(lx + 0.01, ly);
  d.line = path;
  return path;
}

export function hasLine(stroke: Stroke): boolean {
  return derived(stroke).line !== undefined;
}

// the outline as svg path data in page units, for exports
export function strokeSvgPath(stroke: Stroke): string {
  const outline = outlineOf(scaledPoints(stroke.pts), stroke.pen, stroke.size);
  const n = outline.length;
  if (n < 3) return '';
  const k = 1 / PF_SCALE;
  const f = (v: number) => (v * k).toFixed(2);
  const mid = (a: number[], b: number[], i: number) => f((a[i] + b[i]) / 2);
  let d = `M${mid(outline[n - 1], outline[0], 0)},${mid(outline[n - 1], outline[0], 1)}`;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[i + 1 === n ? 0 : i + 1];
    d += `Q${f(a[0])},${f(a[1])} ${mid(a, b, 0)},${mid(a, b, 1)}`;
  }
  return d + 'Z';
}
