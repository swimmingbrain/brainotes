import { emptyBox, growBox, itemBox } from '../bounds';
import { newId } from '../doc';
import { inkColor, isDark } from '../render';
import { shapePath } from '../shapes';
import { euro, newEuro, refit, smoothingOf } from '../smooth';
import { recognize } from '../snap';
import { curveBetween, lengthOf, mapPressure, outlineOf, PENS, PF_SCALE, strokePath, taperReach, traceOutline } from '../stroke';
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
// css pixels: with smoothing a key this close to the last one adds nothing, the refit
// may move a point this far, a guess goes this far ahead, about a frame of fast writing
const KEY_GAP = 0.2;
const REFIT_MOVE = 0.35;
const TAIL = 9;
// css pixels: a gap between two samples longer than this gets a curve, fast small loops
// come with only a few samples a turn. it is filled about every CURVE_STEP
const SPARSE = 1.5;
const CURVE_STEP = 0.75;
// samples and css pixels: this little at no pressure at the very end is the pen leaving the glass
const LIFT_SAMPLES = 4;
const LIFT_RUN = 6;
// ms and css pixels: a tap this soon after a lift and this close to where the nib
// left the glass is the nib bouncing back, not a dot
const BOUNCE_TIME = 80;
const BOUNCE_REACH = 6;
// points of a long line kept as one finished piece, and points near the pen that stay live
const PIECE = 64;
const KEEP = 24;
// ms a finished line stays on the live canvas, until the ink canvas surely shows it
const GHOST = 50;

// a made up neighbour for the ends, so the curve leaves them at full speed
function mirror(p: number[], q: number[]): number[] {
  return [p[0] * 2 - q[0], p[1] * 2 - q[1], p[2]];
}

export class PenTool implements Tool {
  readonly instant = true;
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
  // smoothing 0: every sample is a key as it came, nothing is filtered or dropped
  private raw = false;
  private keys: number[][] = [];
  private pts: number[][] = [];
  private tip: number[] | null = null;
  private step = 4;
  private sparse = 8;
  private tail: number[][] = [];
  // finished pieces of a long line are kept as one path, a draw only works out the rest
  private pieces: Path2D | null = null;
  private piecesEnd = 0;
  private piecesLength = 0;
  private piecesBox: Box = emptyBox();
  private pressure = 0.5;
  // a pen that touches down with no pressure gets the first real one for its start
  private pressureKnown = true;
  private keyX = 0;
  private keyY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastTime = 0;
  // where the pen was going, a unit vector in css px
  private dirX = 0;
  private dirY = 0;
  // the line as it was before the samples at no pressure at the end, see dropLift
  private lift: { keys: number; pts: number; tip: number[] | null; count: number; run: number } | null = null;
  // the end of the last line on screen and when it was lifted, for a bounce of the nib
  private liftX = 0;
  private liftY = 0;
  private liftTime = -Infinity;
  private downTime = 0;
  private bounce = false;
  // a finished stroke stays on the live canvas a little, until the ink canvas shows it
  private ghost: Item | null = null;
  private ghostPage = 0;
  private ghostColor = '';
  private ghostUntil = 0;
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
    this.raw = smooth.min === Infinity;
    this.sensitivity = set.pressure;
    const unit = PF_SCALE / this.view.cam.zoom;
    this.step = CURVE_STEP * unit;
    this.sparse = SPARSE * unit;
    this.keys = [];
    this.pts = [];
    this.tip = null;
    this.tail = [];
    this.pieces = null;
    this.piecesEnd = 0;
    this.piecesLength = 0;
    this.piecesBox = emptyBox();
    this.pressure = 0.5;
    this.pressureKnown = kind !== 'pen' || s.pressure > 0;
    this.dirX = 0;
    this.dirY = 0;
    this.lift = null;
    this.downTime = s.time;
    this.bounce =
      kind === 'pen' && s.time - this.liftTime < BOUNCE_TIME && Math.hypot(s.x - this.liftX, s.y - this.liftY) < BOUNCE_REACH;
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

  // the guess is cut short, a long one overshoots where the pen stops and jumps back
  predict(list: Sample[]) {
    if (!this.on || !this.tip || list.length === 0) return;
    const reach = (TAIL / this.view.cam.zoom) * PF_SCALE;
    const tail: number[][] = [];
    let from = this.tip;
    let left = reach;
    for (const s of list) {
      const p = this.toPage(s.x, s.y, this.pressure);
      const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
      if (d >= left) {
        if (d > 0) tail.push([from[0] + ((p[0] - from[0]) * left) / d, from[1] + ((p[1] - from[1]) * left) / d, p[2]]);
        break;
      }
      tail.push(p);
      left -= d;
      from = p;
    }
    this.tail = tail;
    this.request();
  }

  up(s?: Sample) {
    if (!this.on) return;
    const lifted = this.dropLift();
    // the lift is often reported a little further on than the last move
    if (s && !this.snapped && !lifted && this.liftCounts(s)) this.add({ ...s, pressure: 0 }, false);
    this.on = false;
    this.tail = [];
    this.stopHold();
    const time = s?.time ?? this.lastTime;
    if (this.bounce && time - this.downTime < BOUNCE_TIME && lengthOf(this.pts) <= this.size * PF_SCALE && !this.snapped) {
      // the nib came back for a moment, nothing is kept
      this.liftTime = time;
      this.request();
      return;
    }
    const shape = this.snapped;
    if (shape) {
      this.snapped = null;
      const page = this.view.doc.page(this.pageId);
      if (page) {
        this.view.history.run({ type: 'items', pageId: this.pageId, removed: [], added: [{ item: shape, index: page.items.length }] });
      }
      this.keepGhost(shape);
      return;
    }
    // the raw end becomes the last key and the last gaps get their curve
    const keys = this.keys;
    const end = keys[keys.length - 1];
    if (this.tip && (this.tip[0] !== end[0] || this.tip[1] !== end[1])) this.addKey(this.tip);
    const m = keys.length - 1;
    if (m >= 1) {
      const before = m >= 2 ? keys[m - 2] : mirror(keys[m - 1], keys[m]);
      curveBetween(before, keys[m - 1], keys[m], mirror(keys[m], keys[m - 1]), this.step, this.pts, this.sparse);
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
    if (this.pen !== 'highlighter') this.keepGhost(stroke);
    else this.request();
    this.liftX = this.lastX;
    this.liftY = this.lastY;
    this.liftTime = time;
  }

  // the samples at no pressure after the last real one were the pen leaving the glass,
  // a few of them that went only a little way are taken back. more is light writing
  private dropLift(): boolean {
    const lift = this.lift;
    this.lift = null;
    if (!lift || lift.count > LIFT_SAMPLES || lift.run > LIFT_RUN) return false;
    this.keys.length = lift.keys;
    this.pts.length = lift.pts;
    this.tip = lift.tip;
    return true;
  }

  // a lift within a pen width of the last sample and going the same way, further away
  // or turned back it is where the pen already hovers and would add a hook
  private liftCounts(s: Sample): boolean {
    const dx = s.x - this.lastX;
    const dy = s.y - this.lastY;
    const d = Math.hypot(dx, dy);
    if (d === 0 || d > this.size * this.view.cam.zoom) return false;
    return dx * this.dirX + dy * this.dirY > d * 0.5;
  }

  private keepGhost(item: Item) {
    this.ghost = item;
    this.ghostPage = this.page;
    this.ghostColor = this.shown;
    this.ghostUntil = performance.now() + GHOST;
    this.view.requestLive();
  }

  cancel() {
    this.on = false;
    this.tail = [];
    this.snapped = null;
    this.stopHold();
    this.request();
  }

  trail(): { color: string; diameter: number } | null {
    if (!this.on || this.kind !== 'pen' || this.pen === 'highlighter' || this.snapped) return null;
    const look = PENS[this.pen];
    const width = this.size * 2 * (0.5 - look.thinning * (0.5 - this.pressure)) * this.view.cam.zoom;
    const color = look.alpha < 1 && this.shown.length === 7 ? this.shown + Math.round(look.alpha * 255).toString(16) : this.shown;
    // the system trail takes no width under 1 css px
    return { color, diameter: Math.max(1, width) };
  }

  // the next line may start while the last one is still a ghost, both are drawn
  drawLive(ctx: CanvasRenderingContext2D): Box | null {
    let box: Box | null = null;
    const ghost = this.ghost;
    if (ghost && performance.now() > this.ghostUntil) this.ghost = null;
    else if (ghost && this.ghostPage < this.view.doc.pageCount) {
      ctx.save();
      this.view.applyPage(ctx, this.ghostPage);
      if (ghost.type === 'shape') this.drawShape(ctx, ghost, this.ghostColor);
      else if (ghost.type === 'stroke') {
        ctx.globalAlpha = PENS[ghost.pen].alpha;
        ctx.fillStyle = this.ghostColor;
        ctx.fill(strokePath(ghost));
      }
      ctx.restore();
      box = this.view.toDevice(this.ghostPage, itemBox(ghost));
      // another frame to wipe it
      this.view.requestLive();
    }
    if (!this.on || this.pen === 'highlighter') return box;
    let line: Box | null;
    ctx.save();
    if (this.snapped) {
      this.view.applyPage(ctx, this.page);
      this.drawShape(ctx, this.snapped, this.shown);
      line = this.view.toDevice(this.page, itemBox(this.snapped));
    } else {
      line = this.drawStroke(ctx);
    }
    ctx.restore();
    if (box && line) growBox(box, line);
    return box ?? line;
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
        this.lift = null;
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
      } else if (this.pressureKnown) {
        // maybe the pen is leaving the glass, the line so far is kept aside
        if (!this.lift) this.lift = { keys: this.keys.length, pts: this.pts.length, tip: this.tip, count: 0, run: 0 };
        this.lift.count++;
        this.lift.run += Math.hypot(s.x - this.lastX, s.y - this.lastY);
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
    const kx = this.raw ? s.x : f.x;
    const ky = this.raw ? s.y : f.y;
    if (first) {
      const point = this.toPage(s.x, s.y, this.pressure);
      this.keys.push(point);
      this.pts.push(point);
      this.keyX = s.x;
      this.keyY = s.y;
    } else {
      this.tip = this.toPage(s.x, s.y, this.pressure);
      const gap = Math.hypot(kx - this.keyX, ky - this.keyY);
      if (this.raw ? gap > 0 : gap >= KEY_GAP) {
        this.addKey(this.raw ? this.tip : this.toPage(kx, ky, this.pressure));
        this.keyX = kx;
        this.keyY = ky;
      }
    }
    // the guess stays until the next one comes, as far as the pen has not passed it
    if (this.tail.length > 0) this.trimTail(first ? 0 : s.x - this.lastX, first ? 0 : s.y - this.lastY);
    const step = Math.hypot(s.x - this.lastX, s.y - this.lastY);
    if (!first && step >= 0.25) {
      this.dirX = (s.x - this.lastX) / step;
      this.dirY = (s.y - this.lastY) / step;
    }
    this.lastX = s.x;
    this.lastY = s.y;
    this.lastTime = s.time;
    this.request();
  }

  // what is left of the guess ahead of the new tip, going dx, dy. a pen that stopped
  // or turned back loses all of it
  private trimTail(dx: number, dy: number) {
    const tip = this.tip;
    let i = 0;
    if (tip && (dx !== 0 || dy !== 0)) {
      while (i < this.tail.length && (this.tail[i][0] - tip[0]) * dx + (this.tail[i][1] - tip[1]) * dy <= 0) i++;
    } else {
      i = this.tail.length;
    }
    if (i > 0) this.tail = this.tail.slice(i);
  }

  // with the newest key known, the gap before the one ahead of it gets its curve
  private addKey(key: number[]) {
    const keys = this.keys;
    keys.push(key);
    const n = keys.length - 1;
    if (n < 2) return;
    const before = n >= 3 ? keys[n - 3] : mirror(keys[n - 2], keys[n - 1]);
    curveBetween(before, keys[n - 2], keys[n - 1], key, this.step, this.pts, this.sparse);
    this.pts.push(keys[n - 1]);
  }

  // the tapers must be settled: the start one inside the first piece, the end one in the live rest
  private freeze() {
    const pts = this.pts;
    const full = taperReach(this.pen, this.size, Infinity);
    while (pts.length - this.piecesEnd > PIECE + KEEP) {
      const from = this.piecesEnd;
      const to = from + PIECE;
      const piece = lengthOf(pts, from, to);
      if (from === 0 && full.start > 0) {
        const total = piece + lengthOf(pts, to);
        if (taperReach(this.pen, this.size, total).start < full.start || piece < full.start) break;
      }
      if (full.end > 0 && lengthOf(pts, to) < full.end) break;
      const outline = outlineOf(pts.slice(from, to + 1), this.pen, this.size, {
        start: from === 0,
        end: false,
        length: this.piecesLength + piece + lengthOf(pts, to)
      });
      if (!this.pieces) this.pieces = new Path2D();
      traceOutline(this.pieces, outline);
      growBox(this.piecesBox, this.boxOf(outline));
      this.piecesEnd = to;
      this.piecesLength += piece;
    }
  }

  private boxOf(outline: number[][]): Box {
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
    return { minX: minX * k, minY: minY * k, maxX: maxX * k, maxY: maxY * k };
  }

  // the newest key and the raw tip are not in pts yet, their gaps get a curve as well,
  // with the next sample guessed as straight on
  private liveEnd(out: number[][]) {
    const keys = this.keys;
    const n = keys.length - 1;
    const key = keys[n];
    const tip = this.tip && (this.tip[0] !== key[0] || this.tip[1] !== key[1]) ? this.tip : null;
    if (n >= 1) {
      const before = n >= 2 ? keys[n - 2] : mirror(keys[n - 1], key);
      curveBetween(before, keys[n - 1], key, tip ?? mirror(key, keys[n - 1]), this.step, out, this.sparse);
      out.push(key);
    }
    if (tip) {
      const before = n >= 1 ? keys[n - 1] : mirror(key, tip);
      curveBetween(before, key, tip, mirror(tip, key), this.step, out, this.sparse);
      out.push(tip);
    }
  }

  private drawStroke(ctx: CanvasRenderingContext2D): Box | null {
    this.freeze();
    const rest = this.pts.slice(this.piecesEnd);
    this.liveEnd(rest);
    for (const t of this.tail) rest.push(t);
    const part = this.pieces ? { start: false, end: true, length: this.piecesLength + lengthOf(rest) } : undefined;
    const outline = outlineOf(rest, this.pen, this.size, part);
    if (outline.length < 3) return null;

    // one fill for all, so a see through pen is not darker where pieces meet
    const path = this.pieces ? new Path2D(this.pieces) : new Path2D();
    traceOutline(path, outline);
    this.view.applyPage(ctx, this.page);
    ctx.globalAlpha = PENS[this.pen].alpha;
    ctx.fillStyle = this.shown;
    ctx.fill(path);
    const box = this.boxOf(outline);
    if (this.pieces) growBox(box, this.piecesBox);
    return this.view.toDevice(this.page, box);
  }
}
