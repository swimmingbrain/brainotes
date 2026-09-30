import { emptyBox, growBox, padBox } from '../bounds';
import { euro, newEuro, refit, smoothingOf } from '../smooth';
import { outlineOf, PF_SCALE, traceOutline } from '../stroke';
import type { Box } from '../types';
import type { CanvasView } from '../view';
import type { Sample, Tool } from './tool';

// css pixels of the line and its glow
const SIZE = 5;
const GLOW = 10;
// ms the lines stay after the last lift, then ms they take to fade out together
export const LASER_HOLD = 2000;
export const LASER_FADE = 500;
// css pixels between kept points, and how far the refit may move one
const KEY_GAP = 0.5;
const REFIT_MOVE = 0.35;

// lines drawn without a 2 second pause between them, they go away together
export interface LaserGroup {
  // world units times PF_SCALE, x, y, pressure
  lines: { pts: number[][]; size: number }[];
  // built when first drawn, then only grown
  glow: Path2D | null;
  core: Path2D | null;
  box: Box;
  fadeAt: number;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// a red line that stays while it is drawn and fades two seconds after the last lift.
// it lives in world units so it stays on its place, nothing of it is kept
export class LaserTool implements Tool {
  readonly instant = true;
  private groups: LaserGroup[] = [];
  // the group new lines join until its countdown runs out
  private open: LaserGroup | null = null;
  private line: number[][] | null = null;
  private tip: number[] | null = null;
  private size = 1;
  private filter = newEuro(2.5, 0.1);
  private refitWidth = 1.6;
  private keyX = 0;
  private keyY = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scene = -1;

  constructor(
    private view: CanvasView,
    private smoothing: () => number
  ) {}

  // another notebook, board or page clears the lines at once
  private check() {
    if (this.view.scene === this.scene) return;
    this.scene = this.view.scene;
    this.clear();
  }

  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.groups = [];
    this.open = null;
    this.line = null;
    this.tip = null;
  }

  private world(sx: number, sy: number): number[] {
    const cam = this.view.cam;
    return [(cam.x + sx / cam.zoom) * PF_SCALE, (cam.y + sy / cam.zoom) * PF_SCALE, 0.5];
  }

  down(s: Sample) {
    this.check();
    // a touch before the countdown ran out keeps the lines that are there
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.open) {
      this.open = { lines: [], glow: null, core: null, box: emptyBox(), fadeAt: 0 };
      this.groups.push(this.open);
    }
    const smooth = smoothingOf(this.smoothing());
    this.filter = newEuro(smooth.min, smooth.beta);
    this.refitWidth = smooth.refit;
    this.size = SIZE / this.view.cam.zoom;
    euro(this.filter, s.x, s.y, s.time);
    this.line = [this.world(s.x, s.y)];
    this.tip = null;
    this.keyX = s.x;
    this.keyY = s.y;
    this.view.requestLive();
  }

  move(s: Sample) {
    if (!this.line) return;
    const f = this.filter;
    euro(f, s.x, s.y, s.time);
    this.tip = this.world(s.x, s.y);
    if (Math.hypot(f.x - this.keyX, f.y - this.keyY) >= KEY_GAP) {
      this.line.push(this.world(f.x, f.y));
      this.keyX = f.x;
      this.keyY = f.y;
    }
    this.view.requestLive();
  }

  up(s?: Sample) {
    const line = this.line;
    const group = this.open;
    if (!line || !group) return;
    if (s) this.move(s);
    if (this.tip) line.push(this.tip);
    this.line = null;
    this.tip = null;
    const unit = PF_SCALE / this.view.cam.zoom;
    const pts = refit(line, this.refitWidth * unit, REFIT_MOVE * unit);
    group.lines.push({ pts, size: this.size });
    // a group drawn already gets the new line added to its paths
    if (group.glow && group.core) this.trace(group, pts, this.size);
    this.timer = setTimeout(this.fadeOut, LASER_HOLD);
    this.view.requestLive();
  }

  cancel() {
    this.up();
  }

  private fadeOut = () => {
    this.timer = null;
    if (this.open) this.open.fadeAt = performance.now();
    this.open = null;
    this.view.requestLive();
  };

  // the groups on show at now with how strong they are, faded ones are dropped
  shown(now: number): { group: LaserGroup; alpha: number }[] {
    this.check();
    this.groups = this.groups.filter((g) => g.fadeAt === 0 || now - g.fadeAt < LASER_FADE);
    return this.groups.map((group) => ({
      group,
      alpha: group.fadeAt === 0 ? 1 : 1 - smoothstep(Math.min(1, (now - group.fadeAt) / LASER_FADE))
    }));
  }

  private trace(group: LaserGroup, pts: number[][], size: number) {
    const outline = outlineOf(pts, 'marker', size);
    traceOutline(group.glow!, outline);
    traceOutline(group.core!, outlineOf(pts, 'marker', size * 0.4));
    for (const p of outline) growBox(group.box, { minX: p[0], minY: p[1], maxX: p[0], maxY: p[1] });
  }

  private paint(ctx: CanvasRenderingContext2D, glow: Path2D, core: Path2D, alpha: number) {
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(255, 40, 40, 0.9)';
    ctx.shadowBlur = GLOW * this.view.dpr;
    ctx.fillStyle = '#ff2d2d';
    ctx.fill(glow);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd0d0';
    ctx.fill(core);
  }

  drawLive(ctx: CanvasRenderingContext2D): Box | null {
    const list = this.shown(performance.now());
    if (list.length === 0 && !this.line) return null;
    // the paths are in world units, see traceOutline
    const cam = this.view.cam;
    const k = cam.zoom * this.view.dpr;
    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    const box = emptyBox();
    let fading = false;
    for (const { group, alpha } of list) {
      if (!group.glow || !group.core) {
        group.glow = new Path2D();
        group.core = new Path2D();
        for (const line of group.lines) this.trace(group, line.pts, line.size);
      }
      if (group.lines.length === 0) continue;
      if (alpha < 1) fading = true;
      this.paint(ctx, group.glow, group.core, alpha);
      growBox(box, group.box);
    }
    if (this.line) {
      const pts = this.tip ? this.line.concat([this.tip]) : this.line;
      const glow = new Path2D();
      const core = new Path2D();
      const outline = outlineOf(pts, 'marker', this.size);
      traceOutline(glow, outline);
      traceOutline(core, outlineOf(pts, 'marker', this.size * 0.4));
      this.paint(ctx, glow, core, 1);
      for (const p of outline) growBox(box, { minX: p[0], minY: p[1], maxX: p[0], maxY: p[1] });
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    // the fading goes on by itself, frame after frame
    if (fading) this.view.requestLive();
    if (box.minX > box.maxX) return null;
    return padBox(
      {
        minX: (box.minX / PF_SCALE - cam.x) * k,
        minY: (box.minY / PF_SCALE - cam.y) * k,
        maxX: (box.maxX / PF_SCALE - cam.x) * k,
        maxY: (box.maxY / PF_SCALE - cam.y) * k
      },
      GLOW * 2 * this.view.dpr
    );
  }
}
