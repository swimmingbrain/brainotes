import { itemBox } from '../bounds';
import { newId } from '../doc';
import { inkColor, isDark } from '../render';
import { shapePath } from '../shapes';
import { euro, newEuro, refit, smoothingOf } from '../smooth';
import { recognize } from '../snap';
import { curveBetween, mapPressure, outlineOf, PENS, PF_SCALE, strokePath, traceOutline } from '../stroke';
import type { Box, Item, PenType, Shape, Stroke } from '../types';
import type { CanvasView } from '../view';
import type { PointerKind, Sample, Tool } from './tool';

export interface PenSettings {
  pen: PenType;
  color: string;
  size: number;
  // the preferences, both 0..1
  pressure: number;
  smoothing: number;
  holdToSnap: boolean;
}

// css pixels per ms where a mouse or finger line is at its thinnest
const FAST = 2.5;
// ms and css pixels a pen rests before its line becomes a clean shape
const HOLD = 500;
const HOLD_MOVE = 3;
// css pixels, smaller lines are writing, not shapes
const SNAP_MIN = 28;
// css pixels: a key this close to the last one adds nothing, the refit may move a
// point this far, a lift further away is not believed
const KEY_GAP = 0.2;
const REFIT_MOVE = 0.35;
const UP_REACH = 12;

// a made up neighbour for the ends, so the curve leaves them at full speed
function mirror(p: number[], q: number[]): number[] {
  return [p[0] * 2 - q[0], p[1] * 2 - q[1], p[2]];
}

export class PenTool implements Tool {
  private on = false;
  private page = -1;
  private pageId = '';
  private kind: PointerKind = 'mouse';
  private pen: PenType = 'ballpoint';
  private color = '';
  private shown = '';
  private size = 2;
  private sensitivity = 0.5;
  // keys are smoothed while drawing, the newest sample stays raw in tip so the line reaches the pen
  private filter = newEuro(2.5, 0.1);
  private refitWidth = 1.6;
  private keys: number[][] = [];
  private pts: number[][] = [];
  private tip: number[] | null = null;
  private step = 4;
  private tail: number[][] = [];
  private pressure = 0.5;
  // a pen that touches down with no pressure gets the first real one for its start
  private pressureKnown = true;
  private keyX = 0;
  private keyY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastTime = 0;
  // a finished stroke stays on the live canvas one more frame, until the ink canvas shows it
  private ghost: Item | null = null;
  private ghostPage = 0;
  private ghostColor = '';
  // draw and hold: after the snap the pen drags the end of a line or arrow
  private snapping = false;
  private holdX = 0;
  private holdY = 0;
  private holdSince = 0;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private snapped: Shape | null = null;
  private snapX = 0;
  private snapY = 0;
  private snapEndX = 0;
  private snapEndY = 0;

  constructor(
    private view: CanvasView,
    private settings: () => PenSettings
  ) {}

  down(s: Sample, kind: PointerKind) {
    const page = this.view.pageAtScreen(s.x, s.y);
    if (page < 0) return;
    const set = this.settings();
    const meta = this.view.doc.notebook.pages[page];
    this.on = true;
    this.page = page;
    this.pageId = meta.id;
    this.kind = kind;
    this.pen = set.pen;
    this.color = set.color;
    this.shown = inkColor(set.color, isDark(meta.paper));
    this.size = set.size;
    const smooth = smoothingOf(set.smoothing);
    this.filter = newEuro(smooth.min, smooth.beta);
    this.refitWidth = smooth.refit;
    this.sensitivity = set.pressure;
    // half a pen width apart, the outline drops closer points anyway
    this.step = Math.max(0.75, set.size * 0.6) * PF_SCALE;
    this.keys = [];
    this.pts = [];
    this.tip = null;
    this.tail = [];
    this.pressure = 0.5;
    this.pressureKnown = kind !== 'pen' || s.pressure > 0;
    this.snapped = null;
    this.snapping = set.holdToSnap && set.pen !== 'highlighter';
    this.holdX = s.x;
    this.holdY = s.y;
    this.holdSince = performance.now();
    if (this.snapping) this.armHold(HOLD);
    this.add(s, true);
  }

  private armHold(delay: number) {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(this.checkHold, delay);
  }

  private stopHold() {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  // one timer for the whole stroke, it looks again when the pen moved since
  private checkHold = () => {
    this.holdTimer = null;
    if (!this.on || this.snapped) return;
    const wait = HOLD - (performance.now() - this.holdSince);
    if (wait > 10) {
      this.armHold(wait);
      return;
    }
    this.snap();
  };

  private snap() {
    const all = this.pts.concat(this.keys.length > 1 ? [this.keys[this.keys.length - 1]] : []);
    if (this.tip) all.push(this.tip);
    const xy: number[] = [];
    for (const p of all) xy.push(p[0] / PF_SCALE, p[1] / PF_SCALE);
    const found = recognize(xy, SNAP_MIN / this.view.cam.zoom);
    if (!found) return;
    const end = all[all.length - 1];
    this.snapX = end[0] / PF_SCALE;
    this.snapY = end[1] / PF_SCALE;
    this.snapEndX = found.x2;
    this.snapEndY = found.y2;
    this.snapped = { id: newId(), type: 'shape', color: this.color, size: this.size, ...found };
    this.view.requestLive();
  }

  move(s: Sample) {
    if (this.on) this.add(s, false);
  }

  predict(list: Sample[]) {
    if (!this.on) return;
    this.tail = list.map((s) => this.toPage(s.x, s.y, this.pressure));
    this.request();
  }

  up(s?: Sample) {
    if (!this.on) return;
    // the lift often comes a little further on than the last move
    if (s && !this.snapped && Math.hypot(s.x - this.lastX, s.y - this.lastY) < UP_REACH) {
      this.add({ ...s, pressure: 0 }, false);
    }
    this.on = false;
    this.tail = [];
    this.stopHold();
    const shape = this.snapped;
    if (shape) {
      this.snapped = null;
      const page = this.view.doc.page(this.pageId);
      if (page) {
        this.view.history.run({ type: 'items', pageId: this.pageId, removed: [], added: [{ item: shape, index: page.items.length }] });
      }
      this.ghost = shape;
      this.ghostPage = this.page;
      this.ghostColor = this.shown;
      this.request();
      return;
    }
    // the raw end becomes the last key and the last gaps get their curve
    const keys = this.keys;
    if (this.tip) this.addKey(this.tip);
    const m = keys.length - 1;
    if (m >= 1) {
      const before = m >= 2 ? keys[m - 2] : mirror(keys[m - 1], keys[m]);
      curveBetween(before, keys[m - 1], keys[m], mirror(keys[m], keys[m - 1]), this.step, this.pts);
      this.pts.push(keys[m]);
    }
    // a last gentle pass over the whole line, too small to see it move
    const unit = PF_SCALE / this.view.cam.zoom;
    const all = refit(this.pts, this.refitWidth * unit, REFIT_MOVE * unit);
    const pts = new Float32Array(all.length * 3);
    for (let i = 0; i < all.length; i++) {
      pts[i * 3] = all[i][0] / PF_SCALE;
      pts[i * 3 + 1] = all[i][1] / PF_SCALE;
      pts[i * 3 + 2] = all[i][2];
    }
    const stroke: Stroke = { id: newId(), type: 'stroke', pen: this.pen, color: this.color, size: this.size, pts };
    const page = this.view.doc.page(this.pageId);
    if (page) {
      this.view.history.run({
        type: 'items',
        pageId: this.pageId,
        removed: [],
        added: [{ item: stroke, index: page.items.length }]
      });
    }
    if (this.pen !== 'highlighter') {
      this.ghost = stroke;
      this.ghostPage = this.page;
      this.ghostColor = this.shown;
    }
    this.request();
  }

  cancel() {
    this.on = false;
    this.tail = [];
    this.snapped = null;
    this.stopHold();
    this.request();
  }

  drawLive(ctx: CanvasRenderingContext2D): Box | null {
    if (this.ghost) {
      const ghost = this.ghost;
      this.ghost = null;
      if (this.ghostPage >= this.view.doc.pageCount) return null;
      this.view.applyPage(ctx, this.ghostPage);
      if (ghost.type === 'shape') this.drawShape(ctx, ghost, this.ghostColor);
      else if (ghost.type === 'stroke') {
        ctx.globalAlpha = PENS[ghost.pen].alpha;
        ctx.fillStyle = this.ghostColor;
        ctx.fill(strokePath(ghost));
      }
      // one more frame to wipe it
      this.view.requestLive();
      return this.view.toDevice(this.ghostPage, itemBox(ghost));
    }
    if (!this.on || this.pen === 'highlighter') return null;
    if (this.snapped) {
      this.view.applyPage(ctx, this.page);
      this.drawShape(ctx, this.snapped, this.shown);
      return this.view.toDevice(this.page, itemBox(this.snapped));
    }
    return this.drawStroke(ctx);
  }

  private drawShape(ctx: CanvasRenderingContext2D, shape: Shape, color: string) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = shape.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(shapePath(shape));
  }

  drawUnder(ctx: CanvasRenderingContext2D): Box | null {
    if (!this.on || this.pen !== 'highlighter') return null;
    return this.drawStroke(ctx);
  }

  private request() {
    if (this.pen === 'highlighter') this.view.requestUnder();
    else this.view.requestLive();
  }

  private toPage(sx: number, sy: number, pressure: number): number[] {
    const cam = this.view.cam;
    const x = cam.x + sx / cam.zoom - this.view.pageX(this.page);
    const y = cam.y + sy / cam.zoom - this.view.pageY(this.page);
    return [x * PF_SCALE, y * PF_SCALE, pressure];
  }

  private add(s: Sample, first: boolean) {
    if (this.snapped) {
      const kind = this.snapped.kind;
      if (kind === 'line' || kind === 'arrow') {
        const [px, py] = this.toPage(s.x, s.y, 0);
        const x2 = this.snapEndX + px / PF_SCALE - this.snapX;
        const y2 = this.snapEndY + py / PF_SCALE - this.snapY;
        this.snapped = { ...this.snapped, x2, y2 };
        this.view.requestLive();
      }
      return;
    }
    if (this.snapping && Math.hypot(s.x - this.holdX, s.y - this.holdY) > HOLD_MOVE) {
      this.holdX = s.x;
      this.holdY = s.y;
      this.holdSince = performance.now();
    }

    if (this.kind === 'pen') {
      // a pen that touches with no pressure keeps its place in the line and the
      // pressure it had, only the start waits for a real one
      if (s.pressure > 0) {
        const p = mapPressure(s.pressure, this.sensitivity);
        if (!this.pressureKnown) {
          this.pressureKnown = true;
          this.pressure = p;
          for (const k of this.keys) k[2] = p;
          for (const k of this.pts) k[2] = p;
        } else {
          this.pressure = first ? p : this.pressure + (p - this.pressure) * 0.5;
        }
      } else if (first) {
        this.pressure = mapPressure(0.5, this.sensitivity);
      }
    } else if (!first) {
      // no pressure from a mouse or a finger, a fast line gets a bit thinner
      const dist = Math.hypot(s.x - this.lastX, s.y - this.lastY);
      const speed = dist / Math.max(4, s.time - this.lastTime);
      const target = 0.62 - 0.25 * Math.min(1, speed / FAST);
      this.pressure += (target - this.pressure) * 0.25;
    } else {
      this.pressure = 0.62;
    }

    const f = this.filter;
    euro(f, s.x, s.y, s.time);
    if (first) {
      const point = this.toPage(s.x, s.y, this.pressure);
      this.keys.push(point);
      this.pts.push(point);
      this.keyX = s.x;
      this.keyY = s.y;
    } else {
      this.tip = this.toPage(s.x, s.y, this.pressure);
      if (Math.hypot(f.x - this.keyX, f.y - this.keyY) >= KEY_GAP) {
        this.addKey(this.toPage(f.x, f.y, this.pressure));
        this.keyX = f.x;
        this.keyY = f.y;
      }
    }
    this.tail = [];
    this.lastX = s.x;
    this.lastY = s.y;
    this.lastTime = s.time;
    this.request();
  }

  // with the newest key known, the gap before the one ahead of it gets its curve
  private addKey(key: number[]) {
    const keys = this.keys;
    keys.push(key);
    const n = keys.length - 1;
    if (n < 2) return;
    const before = n >= 3 ? keys[n - 3] : mirror(keys[n - 2], keys[n - 1]);
    curveBetween(before, keys[n - 2], keys[n - 1], key, this.step, this.pts);
    this.pts.push(keys[n - 1]);
  }

  private drawStroke(ctx: CanvasRenderingContext2D): Box | null {
    const pts = this.pts;
    let extra = 0;
    // the newest key is not in pts yet
    if (this.keys.length > 1) {
      pts.push(this.keys[this.keys.length - 1]);
      extra++;
    }
    if (this.tip) {
      pts.push(this.tip);
      extra++;
    }
    for (const t of this.tail) {
      pts.push(t);
      extra++;
    }
    const outline = outlineOf(pts, this.pen, this.size);
    pts.length -= extra;
    if (outline.length < 3) return null;

    this.view.applyPage(ctx, this.page);
    ctx.globalAlpha = PENS[this.pen].alpha;
    ctx.fillStyle = this.shown;
    ctx.beginPath();
    traceOutline(ctx, outline);
    ctx.fill();

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of outline) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    const k = 1 / PF_SCALE;
    return this.view.toDevice(this.page, { minX: minX * k, minY: minY * k, maxX: maxX * k, maxY: maxY * k });
  }
}
