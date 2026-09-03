import { describe, expect, it } from 'vitest';
import { recognize } from './snap';

// hand drawn looking paths, x, y, x, y, ... with a seeded wobble

const MIN = 30;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function random(seed: number): () => number {
  let s = seed * 7919 + 13;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// n points from a to b that bow a little to one side and shake a bit
function segment(out: number[], ax: number, ay: number, bx: number, by: number, n: number, rand: () => number, bow = 0.03) {
  const len = Math.hypot(bx - ax, by - ay);
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len;
  const curve = (rand() - 0.5) * 2 * bow * len;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const side = curve * Math.sin(Math.PI * t) + (rand() - 0.5) * 0.8;
    out.push(ax + (bx - ax) * t + nx * side, ay + (by - ay) * t + ny * side);
  }
}

function wobblyLine(x: number, y: number, angle: number, len: number, seed: number): number[] {
  const rand = random(seed);
  const out = [x, y];
  segment(out, x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len, 50, rand);
  return out;
}

function roughEllipse(cx: number, cy: number, rx: number, ry: number, seed: number): number[] {
  const rand = random(seed);
  const start = rand() * Math.PI * 2;
  // a bit short of closing or a bit past it
  const sweep = Math.PI * 2 * (0.93 + rand() * 0.14);
  const phase = rand() * Math.PI * 2;
  const out: number[] = [];
  for (let i = 0; i <= 70; i++) {
    const a = start + (sweep * i) / 70;
    const k = 1 + 0.04 * Math.sin(a * 3 + phase) + (rand() - 0.5) * 0.02;
    out.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  }
  return out;
}

// starts near the top left corner, runs past the corners a little and
// stops a bit short of where it began
function roughBox(x: number, y: number, w: number, h: number, seed: number): number[] {
  const rand = random(seed);
  const over = () => (0.02 + rand() * 0.04) * Math.min(w, h);
  const out = [x + rand() * 4, y + (rand() - 0.5) * 3];
  const corners = [
    [x + w + over(), y + (rand() - 0.5) * 3],
    [x + w + (rand() - 0.5) * 3, y + h + over()],
    [x - over(), y + h + (rand() - 0.5) * 3],
    [x + (rand() - 0.5) * 3, y + 0.04 * h + rand() * 4]
  ];
  for (const [cx, cy] of corners) {
    segment(out, out[out.length - 2], out[out.length - 1], cx, cy, 18, rand);
  }
  return out;
}

// a path through the corners, starting just after the first one
function polygon(corners: number[][], seed: number): number[] {
  const rand = random(seed);
  const out = [corners[0][0] + 2, corners[0][1]];
  for (const [cx, cy] of corners.slice(1)) segment(out, out[out.length - 2], out[out.length - 1], cx, cy, 18, rand);
  return out;
}

function roughArrow(x: number, y: number, angle: number, len: number, seed: number): number[] {
  const rand = random(seed);
  const tx = x + Math.cos(angle) * len;
  const ty = y + Math.sin(angle) * len;
  const out = [x, y];
  segment(out, x, y, tx, ty, 40, rand);
  const head = len * (0.15 + rand() * 0.1);
  const spread = (25 + rand() * 12) * (Math.PI / 180);
  const barb = (s: number) => [tx + Math.cos(angle + Math.PI + s * spread) * head, ty + Math.sin(angle + Math.PI + s * spread) * head];
  const [ax, ay] = barb(1);
  const [bx, by] = barb(-1);
  segment(out, tx, ty, ax, ay, 8, rand, 0.05);
  segment(out, ax, ay, tx, ty, 8, rand, 0.05);
  segment(out, tx, ty, bx, by, 8, rand, 0.05);
  return out;
}

// cursive looking writing: loops of varying height moving to the right
function word(x: number, y: number, letters: number, seed: number, h = 14, w = 9): number[] {
  const rand = random(seed);
  const heights = Array.from({ length: letters }, () => (rand() < 0.3 ? h * 2 : h) * (0.85 + rand() * 0.3));
  const out: number[] = [];
  for (let i = 0; i <= letters * 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    const hh = heights[Math.min(letters - 1, Math.floor(i / 24))];
    out.push(x + (i / 24) * w * 1.6 + Math.sin(t) * w * 0.55, y - (1 - Math.cos(t)) * 0.5 * hh);
  }
  return out;
}

function signature(x: number, y: number, seed: number): number[] {
  const rand = random(seed);
  const f = 18 + rand() * 8;
  const out: number[] = [];
  for (let i = 0; i <= 300; i++) {
    const t = i / 300;
    out.push(x + 220 * t + 28 * Math.sin(t * f + 0.5), y + 35 * Math.sin(t * 9 + seed) + 18 * Math.cos(t * f) + (rand() - 0.5));
  }
  return out;
}

function letterU(seed: number): number[] {
  const rand = random(seed);
  const out = [100, 100];
  segment(out, 100, 100, 100, 180, 20, rand);
  for (let i = 1; i <= 20; i++) {
    const a = Math.PI - (Math.PI * i) / 20;
    out.push(130 + Math.cos(a) * 30, 180 + Math.sin(a) * 30);
  }
  segment(out, 160, 180, 160, 100, 20, rand);
  return out;
}

function zigzag(seed: number): number[] {
  const rand = random(seed);
  const out = [0, 0];
  for (let i = 1; i <= 8; i++) segment(out, out[out.length - 2], out[out.length - 1], i * 20, i % 2 ? 25 : 0, 6, rand);
  return out;
}

function spiral(seed: number): number[] {
  const rand = random(seed);
  const out: number[] = [];
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * Math.PI * 6;
    const r = 5 + (55 * i) / 200;
    out.push(200 + Math.cos(a) * r + rand() - 0.5, 200 + Math.sin(a) * r + rand() - 0.5);
  }
  return out;
}

function elbow(foot: number, seed: number): number[] {
  const rand = random(seed);
  const out = [50, 50];
  segment(out, 50, 50, 50, 150, 30, rand);
  segment(out, 50, 150, 50 + foot, 150, 20, rand);
  return out;
}

const ANGLES = [0, 0.4, Math.PI / 2, 2.3, Math.PI, -0.8];

describe('lines', () => {
  it('a wobbly line becomes a line from its first to its last point', () => {
    for (const seed of SEEDS) {
      for (const angle of ANGLES) {
        const xy = wobblyLine(100, 100, angle, 80 + seed * 20, seed);
        const shape = recognize(xy, MIN);
        expect(shape?.kind).toBe('line');
        expect(shape?.x1).toBe(xy[0]);
        expect(shape?.y2).toBe(xy[xy.length - 1]);
      }
    }
  });

  it('an elbow is not a line', () => {
    for (const seed of SEEDS) {
      expect(recognize(elbow(70, seed), MIN)).toBeNull();
      expect(recognize(elbow(45, seed), MIN)).toBeNull();
    }
  });
});

describe('arrows', () => {
  it('a shaft with a head becomes an arrow to the tip', () => {
    for (const seed of SEEDS) {
      for (const angle of ANGLES) {
        const len = 100 + seed * 15;
        const shape = recognize(roughArrow(200, 200, angle, len, seed), MIN);
        expect(shape?.kind).toBe('arrow');
        expect(shape!.x1).toBe(200);
        expect(Math.hypot(shape!.x2 - (200 + Math.cos(angle) * len), shape!.y2 - (200 + Math.sin(angle) * len))).toBeLessThan(6);
      }
    }
  });
});

describe('closed shapes', () => {
  it('a rough circle and a wide ellipse become ellipses around them', () => {
    for (const seed of SEEDS) {
      const circle = recognize(roughEllipse(200, 200, 60, 60, seed), MIN);
      expect(circle?.kind).toBe('ellipse');
      expect(Math.abs(circle!.x1 - 140)).toBeLessThan(8);
      expect(Math.abs(circle!.y2 - 260)).toBeLessThan(8);
      expect(recognize(roughEllipse(200, 200, 120, 45, seed), MIN)?.kind).toBe('ellipse');
      expect(recognize(roughEllipse(200, 200, 40, 90, seed), MIN)?.kind).toBe('ellipse');
    }
  });

  it('a rough box becomes a rectangle over it', () => {
    for (const seed of SEEDS) {
      const box = recognize(roughBox(100, 100, 160, 90, seed), MIN);
      expect(box?.kind).toBe('rect');
      expect(Math.abs(box!.x1 - 100)).toBeLessThan(10);
      expect(Math.abs(box!.y2 - 190)).toBeLessThan(10);
      expect(recognize(roughBox(50, 50, 70, 70, seed), MIN)?.kind).toBe('rect');
      expect(recognize(roughBox(50, 50, 60, 200, seed), MIN)?.kind).toBe('rect');
      const trapezoid = [
        [120, 100],
        [240, 100],
        [260, 200],
        [100, 200],
        [118, 103]
      ];
      expect(recognize(polygon(trapezoid, seed), MIN)?.kind).toBe('rect');
    }
  });

  it('a triangle and a figure eight are neither', () => {
    for (const seed of SEEDS) {
      const triangle = [
        [100, 100],
        [180, 200],
        [20, 200],
        [98, 104]
      ];
      expect(recognize(polygon(triangle, seed), MIN)).toBeNull();
      const eight: number[] = [];
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * Math.PI * 2;
        eight.push(200 + Math.sin(t) * 40, 200 + Math.sin(2 * t) * 25);
      }
      expect(recognize(eight, MIN)).toBeNull();
    }
  });
});

describe('things that stay as they were drawn', () => {
  it('handwriting never snaps', () => {
    for (const seed of SEEDS) {
      for (let letters = 2; letters <= 14; letters += 2) {
        expect(recognize(word(100, 100, letters, seed), MIN)).toBeNull();
      }
      expect(recognize(word(100, 100, 9, seed, 20, 12), MIN)).toBeNull();
    }
  });

  it('a signature, a u, a zigzag and a spiral stay', () => {
    for (const seed of SEEDS) {
      expect(recognize(signature(100, 100, seed), MIN)).toBeNull();
      expect(recognize(letterU(seed), MIN)).toBeNull();
      expect(recognize(zigzag(seed), MIN)).toBeNull();
      expect(recognize(spiral(seed), MIN)).toBeNull();
    }
  });

  it('a circle smaller than the minimum stays', () => {
    for (const seed of SEEDS) {
      expect(recognize(roughEllipse(100, 100, 8, 8, seed), MIN)).toBeNull();
    }
  });

  it('a dot or a tap stays', () => {
    expect(recognize([5, 5], MIN)).toBeNull();
    expect(recognize([5, 5, 5, 5, 5, 5, 5, 5], MIN)).toBeNull();
  });
});
