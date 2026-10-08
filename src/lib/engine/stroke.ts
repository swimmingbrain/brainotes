import { getStrokeOutlinePoints, type StrokeOptions, type StrokePoint } from 'perfect-freehand';
import { derived } from './cache';
import type { PenType, Stroke } from './types';

// perfect-freehand skips the last 3 units of a line, a lot for a page in points,
// so the points go in scaled up and the outline comes back scaled down
export const PF_SCALE = 4;

interface PenLook {
  thinning: number;
  // taper lengths in pen sizes
  taperStart: number;
  taperEnd: number;
  alpha: number;
}

// the ballpoint stays nearly even like a real one, the fountain pen is the one that swells
export const PENS: Record<PenType, PenLook> = {
  ballpoint: { thinning: 0.15, taperStart: 0, taperEnd: 0, alpha: 1 },
  fountain: { thinning: 0.6, taperStart: 1.5, taperEnd: 3.5, alpha: 1 },
  marker: { thinning: 0, taperStart: 0, taperEnd: 0, alpha: 1 },
  pencil: { thinning: 0.15, taperStart: 0, taperEnd: 0, alpha: 0.75 },
  highlighter: { thinning: 0, taperStart: 0, taperEnd: 0, alpha: 1 }
};

const OUTLINE_SMOOTHING = 0.6;
// tapers take at most these shares of what a line is longer than one pen width,
// so a short mark is round and not all taper
const TAPER_START_SHARE = 0.3;
const TAPER_END_SHARE = 0.4;

// a piece of a longer line tapers only where the line starts or ends, length is the whole line
export interface Part {
  start: boolean;
  end: boolean;
  length: number;
}

// only pen, size and length, so a stroke looks the same whatever the preferences say later
export function penOptions(pen: PenType, size: number, length = Infinity, part?: Part): StrokeOptions {
  const look = PENS[pen];
  const s = size * PF_SCALE;
  const room = Math.max(0, (part ? part.length : length) - s);
  return {
    size: s,
    thinning: look.thinning,
    smoothing: OUTLINE_SMOOTHING,
    streamline: 0,
    simulatePressure: false,
    last: true,
    start: { cap: true, taper: part && !part.start ? 0 : Math.min(look.taperStart * s, room * TAPER_START_SHARE) },
    end: { cap: true, taper: part && !part.end ? 0 : Math.min(look.taperEnd * s, room * TAPER_END_SHARE) }
  };
}

// where the tapers of a line this long reach in from its ends, in scaled units
export function taperReach(pen: PenType, size: number, length: number): { start: number; end: number } {
  const o = penOptions(pen, size, length);
  return { start: Number(o.start?.taper ?? 0), end: Number(o.end?.taper ?? 0) };
}

// a light touch still makes a line that shows
export const MIN_PRESSURE = 0.2;

// light writing already looks normal, the sensitivity (0.5 is normal) widens
// or narrows the range around the middle
export function mapPressure(raw: number, sensitivity: number): number {
  const curved = Math.pow(Math.max(0, Math.min(1, raw)), 0.65);
  const p = 0.5 + (curved - 0.5) * sensitivity * 2;
  return Math.max(MIN_PRESSURE, Math.min(1, p));
}

// catmull-rom points strictly between b and c, about step apart, and only for a gap
// longer than min: samples that close follow the pen well enough, a curve through them
// would only bend their wobble. centripetal, as that never loops or overshoots on a zigzag
export function curveBetween(a: number[], b: number[], c: number[], d: number[], step: number, out: number[][], min = 0) {
  const dist = Math.hypot(c[0] - b[0], c[1] - b[1]);
  if (dist <= min) return;
  const n = Math.ceil(dist / step);
  if (n < 2) return;
  const t1 = Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t2 = t1 + Math.max(1e-4, Math.sqrt(dist));
  const t3 = t2 + Math.max(1e-4, Math.sqrt(Math.hypot(d[0] - c[0], d[1] - c[1])));
  for (let i = 1; i < n; i++) {
    const t = t1 + ((t2 - t1) * i) / n;
    const p = [0, 0, b[2] + ((c[2] - b[2]) * i) / n];
    for (let k = 0; k < 2; k++) {
      const a1 = ((t1 - t) * a[k] + t * b[k]) / t1;
      const a2 = ((t2 - t) * b[k] + (t - t1) * c[k]) / (t2 - t1);
      const a3 = ((t3 - t) * c[k] + (t - t2) * d[k]) / (t3 - t2);
      const b1 = ((t2 - t) * a1 + t * a2) / t2;
      const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
      p[k] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
    }
    out.push(p);
  }
}

export function scaledPoints(pts: Float32Array): number[][] {
  const out: number[][] = new Array(pts.length / 3);
  for (let i = 0, j = 0; i < pts.length; i += 3, j++) {
    out[j] = [pts[i] * PF_SCALE, pts[i + 1] * PF_SCALE, pts[i + 2]];
  }
  return out;
}

// points closer than this share of the pen size only add noise, which the outline
// shows as bumps along the line and as a knob where a last tiny step turns away
const MIN_GAP = 0.15;

function strokePoint(p: number[], prev: StrokePoint | undefined): StrokePoint {
  if (!prev) return { point: [p[0], p[1]], pressure: p[2] ?? 0.5, vector: [0, 0], distance: 0, runningLength: 0 };
  const dx = prev.point[0] - p[0];
  const dy = prev.point[1] - p[1];
  const distance = Math.hypot(dx, dy);
  return {
    point: [p[0], p[1]],
    pressure: p[2] ?? 0.5,
    vector: [dx / distance, dy / distance],
    distance,
    runningLength: prev.runningLength + distance
  };
}

// getStrokePoints without its streamline (the pen tool smooths already) and without
// dropping the points near the start, which left a taper with two outline points.
// the first and the last point always stay, so the line starts and ends at the pen
export function strokePoints(points: number[][], size: number): StrokePoint[] {
  const out: StrokePoint[] = [];
  const gap = size * MIN_GAP;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    let prev = out[out.length - 1];
    if (prev) {
      const d = Math.hypot(p[0] - prev.point[0], p[1] - prev.point[1]);
      if (d === 0) continue;
      if (d < gap) {
        if (i < n - 1) continue;
        // the end takes the place of the point just before it
        if (out.length > 1) {
          out.pop();
          prev = out[out.length - 1];
        }
      }
    }
    out.push(strokePoint(p, prev));
  }
  if (out.length > 1) out[0].vector = out[1].vector;
  return out;
}

// the outline in scaled units, for points that are scaled already. one point is a dot
export function outlineOf(points: number[][], pen: PenType, size: number, part?: Part): number[][] {
  const list = strokePoints(points, size * PF_SCALE);
  if (list.length === 0) return [];
  const length = list[list.length - 1].runningLength;
  return getStrokeOutlinePoints(list, penOptions(pen, size, length, part));
}

export function lengthOf(points: number[][], from = 0, to = points.length - 1): number {
  let run = 0;
  for (let i = from + 1; i <= to; i++) run += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return run;
}

// curves through the edge middles round off the corners of the polygon
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

// device px below which a plain line looks like the outline and costs less
export const THIN = 1.5;

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
