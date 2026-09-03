import { LaserPointer, type LaserPointerOptions } from '@excalidraw/laser-pointer';
import { emptyBox, growBox, padBox } from '../bounds';
import type { Box } from '../types';
import type { CanvasView } from '../view';
import type { Sample, Tool } from './tool';

// ms until a point of the trail has faded, and the css pixels over which
// the tail thins out
const DECAY = 1000;
const DECAY_LENGTH = 50;
const SIZE = 5;
const GLOW = 10;

function easeOut(k: number): number {
  return 1 - Math.pow(1 - k, 4);
}

// the time of a point travels in the pressure slot, like in excalidraw
const OPTIONS: Partial<LaserPointerOptions> = {
  size: SIZE,
  simplify: 0,
  streamline: 0.4,
  keepHead: true,
  sizeMapping: (c) => {
    const t = Math.max(0, 1 - (performance.now() - c.pressure) / DECAY);
    const l = (DECAY_LENGTH - Math.min(DECAY_LENGTH, c.totalLength - c.currentIndex)) / DECAY_LENGTH;
    return Math.min(easeOut(l), easeOut(t));
  }
};

// a red trail in screen pixels that fades away. nothing of it is kept
export class LaserTool implements Tool {
  private current: LaserPointer | null = null;
  private trails: { trail: LaserPointer; last: number }[] = [];

  constructor(private view: CanvasView) {}

  down(s: Sample) {
    this.current = new LaserPointer(OPTIONS);
    this.current.addPoint([s.x, s.y, performance.now()]);
    this.view.requestLive();
  }

  move(s: Sample) {
    if (!this.current) return;
    this.current.addPoint([s.x, s.y, performance.now()]);
    this.view.requestLive();
  }

  up() {
    const trail = this.current;
    this.current = null;
    if (!trail) return;
    trail.close();
    trail.options.keepHead = false;
    this.trails.push({ trail, last: performance.now() });
    this.view.requestLive();
  }

  cancel() {
    this.up();
  }

  private trace(ctx: CanvasRenderingContext2D, outline: number[][], box: Box) {
    ctx.beginPath();
    for (let i = 0; i < outline.length; i++) {
      const [x, y] = outline[i];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      growBox(box, { minX: x, minY: y, maxX: x, maxY: y });
    }
    ctx.closePath();
  }

  drawLive(ctx: CanvasRenderingContext2D): Box | null {
    const now = performance.now();
    // a trail is gone once all of its points faded
    this.trails = this.trails.filter((t) => now - t.last < DECAY + 100);
    const all = this.trails.map((t) => t.trail);
    if (this.current) all.push(this.current);
    if (all.length === 0) return null;

    const dpr = this.view.dpr;
    const box = emptyBox();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    for (const trail of all) {
      const outline = trail.getStrokeOutline();
      if (outline.length < 3) continue;
      // a soft red glow, then a light core on top
      ctx.shadowColor = 'rgba(255, 40, 40, 0.9)';
      ctx.shadowBlur = GLOW * dpr;
      ctx.fillStyle = '#ff2d2d';
      this.trace(ctx, outline, box);
      ctx.fill();
      ctx.shadowBlur = 0;
      const core = trail.getStrokeOutline(SIZE * 0.4);
      if (core.length >= 3) {
        ctx.fillStyle = '#ffd0d0';
        this.trace(ctx, core, box);
        ctx.fill();
      }
    }
    // the fading goes on by itself, frame after frame
    this.view.requestLive();
    if (box.minX > box.maxX) return null;
    return padBox({ minX: box.minX * dpr, minY: box.minY * dpr, maxX: box.maxX * dpr, maxY: box.maxY * dpr }, GLOW * 2 * dpr);
  }
}
