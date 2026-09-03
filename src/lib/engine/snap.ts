// draw and hold: a rough line, arrow, box or ellipse becomes a clean one.
// the idea follows excalidraw's convertToShape (MIT): the path is spread
// into evenly spaced points and a few numbers about them tell the shapes apart

export type SnapKind = 'line' | 'arrow' | 'rect' | 'ellipse';

export interface Snapped {
  kind: SnapKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type Pt = [number, number];

const N = 64;
// ends closer than this share of the path length close the outline
const CLOSED_GAP = 0.15;
// a straight part is at most this much longer than the way between its ends
const STRAIGHT = 1.2;
const MAX_ELONGATION = 0.25;
// how far the shaft may stray from the line to the tip, as a share of it
const MAX_DEVIATION = 0.12;
// points this close to the tip (share of the shaft) may belong to a head
const HEAD_ZONE = 0.4;
// a closed outline turns about once around
const MIN_TURN = 1.2 * Math.PI;
const MAX_TURN = 2.8 * Math.PI;
const TURN_WINDOW = 3;
const MAX_DISTANCE = 1.5;

// what a clean box and a clean ellipse look like, with how much a hand
// drawn one may be off: hull area over box area, the share of the turning
// in the four strongest corners, and the kurtosis of x times the one of y
const SHAPES = [
  { kind: 'rect' as const, fill: 1, corners: 0.95, kurtosis: 1.83 },
  { kind: 'ellipse' as const, fill: Math.PI / 4, corners: 0.55, kurtosis: 2.25 }
];
const FILL_TOLERANCE = 0.2;
const CORNER_TOLERANCE = 0.35;
const KURTOSIS_TOLERANCE = 0.4;

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pathLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

// n points evenly spread along the path, so slow parts do not weigh more
function resample(pts: Pt[], n: number): Pt[] {
  const step = pathLength(pts) / (n - 1);
  const out: Pt[] = [pts[0]];
  let need = step;
  let prev = pts[0];
  for (let i = 1; i < pts.length && out.length < n; i++) {
    const cur = pts[i];
    let seg = dist(prev, cur);
    while (seg >= need && out.length < n) {
      const t = need / seg;
      prev = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
      out.push(prev);
      seg -= need;
      need = step;
    }
    need -= seg;
    prev = cur;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}

function bounds(pts: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

// spread across the main direction over spread along it: 0 for a line, 1 for a circle
function elongation(pts: Pt[]): number {
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts) {
    mx += x / pts.length;
    my += y / pts.length;
  }
  let a = 0;
  let b = 0;
  let c = 0;
  for (const [x, y] of pts) {
    a += (x - mx) ** 2;
    b += (x - mx) * (y - my);
    c += (y - my) ** 2;
  }
  const mid = (a + c) / 2;
  const d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  const major = mid + d;
  return major > 0 ? Math.sqrt(Math.max(0, mid - d) / major) : 0;
}

function kurtosis(values: number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let m2 = 0;
  let m4 = 0;
  for (const v of values) {
    m2 += (v - mean) ** 2 / values.length;
    m4 += (v - mean) ** 4 / values.length;
  }
  return m2 > 0 ? m4 / (m2 * m2) : 0;
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// area of the convex hull, monotone chain
function hullArea(pts: Pt[]): number {
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const hull = half(sorted).concat(half(sorted.reverse()));
  let area = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}

function turn(a: Pt, b: Pt, c: Pt): number {
  const v1x = b[0] - a[0];
  const v1y = b[1] - a[1];
  const v2x = c[0] - b[0];
  const v2y = c[1] - b[1];
  return Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);
}

// how far the path turns in all, left minus right
function totalTurn(pts: Pt[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length - 1; i++) sum += turn(pts[i - 1], pts[i], pts[i + 1]);
  return sum;
}

// the share of the turning that happens in the four strongest corners.
// near 1 for a box, about a half for an ellipse
function cornerShare(pts: Pt[]): number {
  const turns: number[] = [];
  for (let i = TURN_WINDOW; i < pts.length - TURN_WINDOW; i++) {
    turns.push(Math.abs(turn(pts[i - TURN_WINDOW], pts[i], pts[i + TURN_WINDOW])));
  }
  const total = turns.reduce((s, t) => s + t, 0);
  if (total === 0) return 0;
  const taken = turns.map(() => false);
  let top = 0;
  for (let corner = 0; corner < 4; corner++) {
    let peak = -1;
    for (let i = 0; i < turns.length; i++) {
      if (!taken[i] && (peak < 0 || turns[i] > turns[peak])) peak = i;
    }
    if (peak < 0) break;
    // one corner smears over the window, it counts once
    for (let i = Math.max(0, peak - TURN_WINDOW); i <= Math.min(turns.length - 1, peak + TURN_WINDOW); i++) {
      if (!taken[i]) top += turns[i];
      taken[i] = true;
    }
  }
  return top / total;
}

function closedShape(raw: Pt[], pts: Pt[]): Snapped | null {
  const around = Math.abs(totalTurn(pts));
  if (around < MIN_TURN || around > MAX_TURN) return null;
  const box = bounds(pts);
  const area = (box.maxX - box.minX) * (box.maxY - box.minY);
  if (area <= 0) return null;
  const fill = hullArea(pts) / area;
  const corners = cornerShare(pts);
  const kurt = kurtosis(pts.map((p) => p[0])) * kurtosis(pts.map((p) => p[1]));
  let best: Snapped['kind'] | null = null;
  let bestDistance = MAX_DISTANCE;
  for (const shape of SHAPES) {
    const d = Math.hypot(
      (fill - shape.fill) / FILL_TOLERANCE,
      (corners - shape.corners) / CORNER_TOLERANCE,
      (kurt - shape.kurtosis) / KURTOSIS_TOLERANCE
    );
    if (d < bestDistance) {
      bestDistance = d;
      best = shape.kind;
    }
  }
  if (!best) return null;
  const out = bounds(raw);
  return { kind: best, x1: out.minX, y1: out.minY, x2: out.maxX, y2: out.maxY };
}

function farthest(pts: Pt[], from: Pt): number {
  let best = 0;
  for (let i = 1; i < pts.length; i++) {
    if (dist(pts[i], from) > dist(pts[best], from)) best = i;
  }
  return best;
}

function openShape(raw: Pt[], pts: Pt[], length: number): Snapped | null {
  const start = pts[0];
  const end = pts[pts.length - 1];
  const t = farthest(pts, start);
  const tip = pts[t];
  const reach = dist(start, tip);
  if (reach === 0) return null;
  const dx = (tip[0] - start[0]) / reach;
  const dy = (tip[1] - start[1]) / reach;
  // away from the tip nothing may stray far from the line to it, that
  // turns down elbows, arcs and handwriting
  for (const p of pts) {
    if (dist(p, tip) <= HEAD_ZONE * reach) continue;
    if (Math.abs((p[0] - start[0]) * dy - (p[1] - start[1]) * dx) > MAX_DEVIATION * reach) return null;
  }

  const first = raw[0];
  if (length <= STRAIGHT * dist(start, end) && elongation(pts) <= MAX_ELONGATION) {
    const last = raw[raw.length - 1];
    return { kind: 'line', x1: first[0], y1: first[1], x2: last[0], y2: last[1] };
  }

  // an arrow: a straight shaft to the tip, then a short head that stays
  // near the tip and reaches out to both sides of the shaft. the head
  // comes back to the tip, so the shaft ends where the tip is first reached
  let s = 0;
  while (dist(pts[s], start) < 0.95 * reach) s++;
  if (pathLength(pts.slice(0, s + 1)) > STRAIGHT * reach) return null;
  const head = pts.slice(s);
  const headLength = pathLength(head);
  if (headLength < 0.15 * reach || headLength > 1.5 * reach) return null;
  let left = 0;
  let right = 0;
  for (const p of head) {
    if (dist(p, tip) > 0.45 * reach) return null;
    const side = (p[0] - tip[0]) * dy - (p[1] - tip[1]) * dx;
    left = Math.max(left, side);
    right = Math.max(right, -side);
  }
  if (Math.min(left, right) < 0.04 * reach) return null;
  const point = raw[farthest(raw, first)];
  return { kind: 'arrow', x1: first[0], y1: first[1], x2: point[0], y2: point[1] };
}

// xy is x, y, x, y, ... in page units, minSize the smallest size of the
// larger side of the box that is worth snapping
export function recognize(xy: ArrayLike<number>, minSize: number): Snapped | null {
  const raw: Pt[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) raw.push([xy[i], xy[i + 1]]);
  if (raw.length < 3) return null;
  const box = bounds(raw);
  if (Math.max(box.maxX - box.minX, box.maxY - box.minY) < minSize) return null;
  if (pathLength(raw) === 0) return null;
  const pts = resample(raw, N);
  const length = pathLength(pts);
  const gap = dist(pts[0], pts[pts.length - 1]);
  return gap > CLOSED_GAP * length ? openShape(raw, pts, length) : closedShape(raw, pts);
}
