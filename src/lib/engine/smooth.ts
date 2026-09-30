// the one euro filter (casiez, roussel and vogel 2012) with one speed for both
// axes, so a curve keeps its shape: a slow pen is smoothed hard, a fast one hardly
export interface Euro {
  // hz at rest, and how much faster it lets go per px/s of speed
  min: number;
  beta: number;
  x: number;
  y: number;
  speed: number;
  time: number;
  count: number;
}

// hz, how quickly the speed estimate follows the pen
const SPEED_CUTOFF = 8;

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export function newEuro(min: number, beta: number): Euro {
  return { min, beta, x: 0, y: 0, speed: 0, time: 0, count: 0 };
}

// time in ms, the smoothed point ends up in f.x and f.y
export function euro(f: Euro, x: number, y: number, time: number) {
  if (f.count === 0) {
    f.x = x;
    f.y = y;
    f.time = time;
    f.speed = 0;
    f.count = 1;
    return;
  }
  // samples that share a time stamp count as one 240 hz step
  const dt = time > f.time ? Math.min(0.05, (time - f.time) / 1000) : 1 / 240;
  f.time = time;
  const speed = Math.hypot(x - f.x, y - f.y) / dt;
  // the first step sets the speed, a fast start is not smoothed away
  f.speed = f.count === 1 ? speed : f.speed + (speed - f.speed) * alpha(SPEED_CUTOFF, dt);
  f.count++;
  const a = alpha(f.min + f.beta * f.speed, dt);
  f.x += (x - f.x) * a;
  f.y += (y - f.y) * a;
}

// the smoothing preference (0 to 1) as the filter at rest, its speed factor and
// the refit width in css px. the middle is tuned for handwriting with a pen
export function smoothingOf(smoothing: number): { min: number; beta: number; refit: number } {
  const s = Math.max(0, Math.min(1, smoothing));
  if (s === 0) return { min: 1000, beta: 0, refit: 0 };
  return { min: 2.5 * Math.pow(4, 1 - 2 * s), beta: 0.1 * Math.pow(2, 1 - 2 * s), refit: 3.2 * s };
}

function gap(a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// the cosine of the turn at i, looking back and ahead about reach along the line
function turnAt(pts: number[][], run: number[], i: number, reach: number): number {
  let a = i;
  while (a > 0 && run[i] - run[a] < reach) a--;
  let b = i;
  while (b < pts.length - 1 && run[b] - run[i] < reach) b++;
  if (a === i || b === i) return 1;
  const p = pts[i];
  const ax = p[0] - pts[a][0];
  const ay = p[1] - pts[a][1];
  const bx = pts[b][0] - p[0];
  const by = pts[b][1] - p[1];
  const len = Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by));
  return len > 0 ? (ax * bx + ay * by) / len : 1;
}

// a turn sharper than about 70 degrees is a corner and stays where it is
const CORNER = Math.cos(1.2);

// after the lift a gentle smoothing of the whole line: a bell shaped average along
// the line with a window that shrinks towards the ends and corners, so they stay
// put, and no point moves more than max. points are x, y, pressure
export function refit(pts: number[][], width: number, max: number): number[][] {
  const n = pts.length;
  if (n < 3 || width <= 0) return pts;
  const run = new Array<number>(n);
  run[0] = 0;
  for (let i = 1; i < n; i++) run[i] = run[i - 1] + gap(pts[i - 1], pts[i]);
  // corners split the line into parts that are smoothed on their own
  const fixed: number[] = [0];
  let last = -1;
  let lastTurn = 1;
  for (let i = 1; i < n - 1; i++) {
    const turn = turnAt(pts, run, i, width);
    if (turn >= CORNER) continue;
    // a corner spans a few points, the sharpest of them is kept
    if (last >= 0 && run[i] - run[last] < width) {
      if (turn >= lastTurn) continue;
      fixed[fixed.length - 1] = i;
    } else {
      fixed.push(i);
    }
    last = i;
    lastTurn = turn;
  }
  fixed.push(n - 1);
  const out = pts.slice();
  const w2 = width * width;
  for (let k = 0; k + 1 < fixed.length; k++) {
    const from = fixed[k];
    const to = fixed[k + 1];
    for (let i = from + 1; i < to; i++) {
      const half = Math.min(width, run[i] - run[from], run[to] - run[i]);
      if (half <= 0) continue;
      let sx = 0;
      let sy = 0;
      let sw = 0;
      let j = i;
      while (j > from && run[i] - run[j - 1] <= half) j--;
      for (; j <= to && run[j] - run[i] <= half; j++) {
        const d = run[j] - run[i];
        // each point stands for the line around it, so dense parts do not weigh more
        const w = (1 - (d * d) / w2) * (run[j < n - 1 ? j + 1 : j] - run[j > 0 ? j - 1 : j] + 1e-6);
        sx += pts[j][0] * w;
        sy += pts[j][1] * w;
        sw += w;
      }
      let dx = sx / sw - pts[i][0];
      let dy = sy / sw - pts[i][1];
      const moved = Math.sqrt(dx * dx + dy * dy);
      if (moved > max) {
        dx *= max / moved;
        dy *= max / moved;
      }
      out[i] = [pts[i][0] + dx, pts[i][1] + dy, pts[i][2]];
    }
  }
  return out;
}
