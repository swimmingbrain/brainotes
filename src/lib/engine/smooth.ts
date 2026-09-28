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
