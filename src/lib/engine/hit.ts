export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len > 0 ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function segmentsDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): number {
  if (segmentsCross(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    distToSegment(ax, ay, cx, cy, dx, dy),
    distToSegment(bx, by, cx, cy, dx, dy),
    distToSegment(cx, cy, ax, ay, bx, by),
    distToSegment(dx, dy, ax, ay, bx, by)
  );
}

// poly is x, y, x, y, ...
export function pointInPolygon(x: number, y: number, poly: ArrayLike<number>): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = poly[i];
    const yi = poly[i + 1];
    const xj = poly[j];
    const yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// does the line through pts (x, y, pressure) come closer than r to the
// segment a to b
export function strokeNear(pts: ArrayLike<number>, ax: number, ay: number, bx: number, by: number, r: number): boolean {
  if (pts.length < 6) return pts.length >= 2 && distToSegment(pts[0], pts[1], ax, ay, bx, by) < r;
  for (let i = 3; i < pts.length; i += 3) {
    if (segmentsDistance(pts[i - 3], pts[i - 2], pts[i], pts[i + 1], ax, ay, bx, by) < r) return true;
  }
  return false;
}

// what an eraser of radius r leaves of a line when it moves from a to b.
// null means it never touched the line, an empty list means nothing is left
export function cutStroke(
  pts: ArrayLike<number>,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number
): Float32Array[] | null {
  const n = pts.length / 3;
  const dist = (i: number) => distToSegment(pts[i * 3], pts[i * 3 + 1], ax, ay, bx, by);
  // the distance of a point part way along the segment from i to i + 1
  const along = (i: number, t: number) => {
    const x = pts[i * 3] + (pts[i * 3 + 3] - pts[i * 3]) * t;
    const y = pts[i * 3 + 1] + (pts[i * 3 + 4] - pts[i * 3 + 1]) * t;
    return distToSegment(x, y, ax, ay, bx, by);
  };
  // where the distance crosses r between t0 (on one side) and t1 (on the other)
  const edge = (i: number, t0: number, t1: number) => {
    const outside0 = along(i, t0) >= r;
    for (let k = 0; k < 14; k++) {
      const mid = (t0 + t1) / 2;
      if (along(i, mid) >= r === outside0) t0 = mid;
      else t1 = mid;
    }
    return (t0 + t1) / 2;
  };

  const pieces: Float32Array[] = [];
  let piece: number[] = [];
  let touched = false;
  const push = (i: number, t: number) => {
    const k = i * 3;
    if (t === 0) piece.push(pts[k], pts[k + 1], pts[k + 2]);
    else {
      piece.push(
        pts[k] + (pts[k + 3] - pts[k]) * t,
        pts[k + 1] + (pts[k + 4] - pts[k + 1]) * t,
        pts[k + 2] + (pts[k + 5] - pts[k + 2]) * t
      );
    }
  };
  const close = () => {
    if (piece.length >= 6) pieces.push(new Float32Array(piece));
    piece = [];
  };

  let inside = dist(0) < r;
  if (inside) touched = true;
  else push(0, 0);

  for (let i = 0; i < n - 1; i++) {
    const next = dist(i + 1) < r;
    if (!inside && !next) {
      // both ends are outside, the middle can still pass through
      if (segmentsDistance(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 3], pts[i * 3 + 4], ax, ay, bx, by) < r) {
        let lo = 0;
        let hi = 1;
        for (let k = 0; k < 24; k++) {
          const m1 = lo + (hi - lo) / 3;
          const m2 = hi - (hi - lo) / 3;
          if (along(i, m1) < along(i, m2)) hi = m2;
          else lo = m1;
        }
        const closest = (lo + hi) / 2;
        if (along(i, closest) < r) {
          touched = true;
          push(i, edge(i, 0, closest));
          close();
          push(i, edge(i, 1, closest));
        }
      }
      push(i + 1, 0);
    } else if (!inside && next) {
      touched = true;
      push(i, edge(i, 0, 1));
      close();
    } else if (inside && !next) {
      push(i, edge(i, 0, 1));
      push(i + 1, 0);
    }
    inside = next;
  }
  close();

  return touched ? pieces : null;
}
