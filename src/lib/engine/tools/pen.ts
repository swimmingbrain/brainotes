import { itemBox } from '../bounds';
import { newId } from '../doc';
import { inkColor, isDark } from '../render';
import { followFactor, mapPressure, outlineOf, PENS, PF_SCALE, strokePath, traceOutline } from '../stroke';
import type { Box, PenType, Stroke } from '../types';
import type { CanvasView } from '../view';
import type { PointerKind, Sample, Tool } from './tool';

export interface PenSettings {
  pen: PenType;
  color: string;
  size: number;
  // the preferences, both 0..1
  pressure: number;
  smoothing: number;
}

// css pixels per ms where a mouse or finger line is at its thinnest
const FAST = 2.5;

export class PenTool implements Tool {
  private on = false;
  private page = -1;
  private pageId = '';
  private kind: PointerKind = 'mouse';
  private pen: PenType = 'ballpoint';
  private color = '';
  private shown = '';
  private size = 2;
  private follow = 0.66;
  private sensitivity = 0.5;
  // smoothed points in scaled page units. the newest point stays raw in
  // tip, so the line always reaches the pen
  private pts: number[][] = [];
  private tip: number[] | null = null;
  private tail: number[][] = [];
  private pressure = 0.5;
  private zeroStart = false;
  private lastX = 0;
  private lastY = 0;
  private lastTime = 0;
  // a finished stroke stays on the live canvas for one more frame, until
  // the ink canvas surely shows it
  private ghost: Stroke | null = null;
  private ghostPage = 0;
  private ghostColor = '';

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
    this.follow = followFactor(set.smoothing);
    this.sensitivity = set.pressure;
    this.pts = [];
    this.tip = null;
    this.tail = [];
    this.pressure = 0.5;
    this.zeroStart = kind === 'pen' && s.pressure === 0;
    this.add(s, true);
  }

  move(s: Sample) {
    if (this.on) this.add(s, false);
  }

  predict(list: Sample[]) {
    if (!this.on) return;
    this.tail = list.map((s) => this.toPage(s, this.pressure));
    this.request();
  }

  up() {
    if (!this.on) return;
    this.on = false;
    this.tail = [];
    const all = this.tip ? [...this.pts, this.tip] : this.pts;
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
    this.request();
  }

  drawLive(ctx: CanvasRenderingContext2D): Box | null {
    if (this.ghost) {
      const ghost = this.ghost;
      this.ghost = null;
      if (this.ghostPage >= this.view.doc.pageCount) return null;
      this.view.applyPage(ctx, this.ghostPage);
      ctx.globalAlpha = PENS[ghost.pen].alpha;
      ctx.fillStyle = this.ghostColor;
      ctx.fill(strokePath(ghost));
      // one more frame to wipe it
      this.view.requestLive();
      return this.view.toDevice(this.ghostPage, itemBox(ghost));
    }
    if (!this.on || this.pen === 'highlighter') return null;
    return this.drawStroke(ctx);
  }

  drawUnder(ctx: CanvasRenderingContext2D): Box | null {
    if (!this.on || this.pen !== 'highlighter') return null;
    return this.drawStroke(ctx);
  }

  private request() {
    if (this.pen === 'highlighter') this.view.requestUnder();
    else this.view.requestLive();
  }

  private toPage(s: Sample, pressure: number): number[] {
    const cam = this.view.cam;
    const x = cam.x + s.x / cam.zoom - this.view.pageX(this.page);
    const y = cam.y + s.y / cam.zoom - this.view.pageY(this.page);
    return [x * PF_SCALE, y * PF_SCALE, pressure];
  }

  private add(s: Sample, first: boolean) {
    const dx = s.x - this.lastX;
    const dy = s.y - this.lastY;
    const dist = Math.hypot(dx, dy);
    // samples closer than half a device pixel add nothing but noise
    if (!first && dist < 0.5 / this.view.dpr) return;

    if (this.kind === 'pen') {
      // a pen that already left the glass reports no pressure
      if (s.pressure === 0 && !first) return;
      const p = mapPressure(s.pressure === 0 ? 0.5 : s.pressure, this.sensitivity);
      this.pressure = first ? p : this.pressure + (p - this.pressure) * 0.5;
      if (this.zeroStart && !first) {
        // some pens report 0 on the first sample, it takes the second one's
        this.pts[0][2] = this.pressure;
        this.zeroStart = false;
      }
    } else if (!first) {
      // no pressure from a mouse or a finger, a fast line gets a bit thinner
      const speed = dist / Math.max(4, s.time - this.lastTime);
      const target = 0.62 - 0.25 * Math.min(1, speed / FAST);
      this.pressure += (target - this.pressure) * 0.25;
    } else {
      this.pressure = 0.62;
    }

    const point = this.toPage(s, this.pressure);
    if (first) {
      this.pts.push(point);
    } else {
      // the old tip moves into the line, pulled towards it as much as the
      // smoothing allows
      const tip = this.tip;
      if (tip) {
        const prev = this.pts[this.pts.length - 1];
        const f = this.follow;
        this.pts.push([prev[0] + (tip[0] - prev[0]) * f, prev[1] + (tip[1] - prev[1]) * f, tip[2]]);
      }
      this.tip = point;
    }
    this.tail = [];
    this.lastX = s.x;
    this.lastY = s.y;
    this.lastTime = s.time;
    this.request();
  }

  private drawStroke(ctx: CanvasRenderingContext2D): Box | null {
    const pts = this.pts;
    let extra = 0;
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
