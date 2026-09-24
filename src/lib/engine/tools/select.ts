import { emptyBox, growBox, itemBox, padBox } from '../bounds';
import { pageAt } from '../camera';
import type { DocChange, PageData, Placed } from '../doc';
import type { Op } from '../history';
import { itemAt, lassoHits } from '../hit';
import { drawImageItem, drawItem, HIGHLIGHTER_ALPHA, isDark, isMarker } from '../render';
import { moveBy, recolorItem, transformItem, type Change } from '../transform';
import type { Box, ImageItem, ImageSource, Item, TextItem } from '../types';
import type { CanvasView } from '../view';
import type { Sample, Tool } from './tool';

export const ACCENT = '#d19a66';
// css pixels
const PAD = 5;
const HANDLE = 4;
const HANDLE_HIT = 10;
const CLICK = 4;
const PICK = 6;
// ms between the two clicks of a double click
const DOUBLE = 400;
// the biggest picture of the selection that is moved around while dragging
const SPRITE_PIXELS = 16_000_000;
// ms after a selection is made before its picture is drawn ahead of a drag
const PREPARE = 80;
// css pixels of the badge that leads a clip back to its pdf page
const BADGE_H = 20;
const BADGE_GAP = 12;
const BADGE_FONT = '600 11px Inter, system-ui, sans-serif';

type Mode = 'idle' | 'lasso' | 'move' | 'scale';

export interface SelectHooks {
  changed?: (count: number) => void;
  // a text was double clicked
  editText?: (index: number, item: TextItem) => void;
  // the badge of a clip was clicked
  source?: (source: ImageSource) => void;
}

interface Sprite {
  canvas: OffscreenCanvas;
  // device pixels of the sprite per page unit, and the page point at its corner
  scale: number;
  x: number;
  y: number;
}

// where each item of the page is, for the ops that put new ones in their place
function placesOf(page: PageData, items: Item[]): Placed[] {
  const wanted = new Set(items);
  const out: Placed[] = [];
  page.items.forEach((item, index) => {
    if (wanted.has(item)) out.push({ item, index });
  });
  return out;
}

let measure: OffscreenCanvasRenderingContext2D | null = null;

function textWidth(text: string): number {
  measure ??= new OffscreenCanvas(1, 1).getContext('2d');
  if (!measure) return text.length * 6;
  measure.font = BADGE_FONT;
  return measure.measureText(text).width;
}

export class SelectTool implements Tool {
  pageId = '';
  items: Item[] = [];
  private mode: Mode = 'idle';
  private started = false;
  private lasso: number[] = [];
  private sx = 0;
  private sy = 0;
  private cx = 0;
  private cy = 0;
  // the dragged corner of the box (0 top left, then clockwise)
  private corner = 0;
  private sprite: Sprite | null = null;
  // drawn while nothing happens, a drag that starts later finds it ready
  private prepared: Sprite | null = null;
  private prepTimer: ReturnType<typeof setTimeout> | null = null;
  private lastClick = { time: 0, item: null as Item | null };
  // shift adds to the selection or takes out of it
  private adding = false;

  constructor(
    private view: CanvasView,
    private hooks: SelectHooks = {}
  ) {}

  get index(): number {
    return this.pageId ? this.view.doc.indexOf(this.pageId) : -1;
  }

  get busy(): boolean {
    return this.mode !== 'idle';
  }

  // the items keep the order they have on the page
  select(index: number, items: Item[]) {
    this.stopDrag();
    const page = this.view.doc.pageAt(index);
    this.pageId = items.length > 0 ? page.meta.id : '';
    if (items.length > 1) {
      const order = new Map<Item, number>();
      page.items.forEach((item, i) => order.set(item, i));
      items = items.slice().sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    }
    this.items = items;
    this.show();
  }

  clear() {
    this.stopDrag();
    if (this.items.length === 0 && !this.pageId) return;
    this.items = [];
    this.pageId = '';
    this.show();
  }

  // a selection that changes while it is dragged (escape, a tool key, an
  // undo) lands back where it was, its items show again
  private stopDrag() {
    if (this.mode === 'move' || this.mode === 'scale') this.cancel();
  }

  private show() {
    this.prepared = null;
    if (this.prepTimer) clearTimeout(this.prepTimer);
    this.prepTimer = this.items.length > 0 ? setTimeout(this.prepare, PREPARE) : null;
    this.hooks.changed?.(this.items.length);
    // the box is drawn by whatever tool the view shows, so this one takes over
    if (this.items.length > 0) this.view.tool = this;
    this.view.requestLive();
  }

  // the doc changed under the selection: an undo, a redo, or an op of this tool
  docChanged(change: DocChange) {
    if (this.items.length === 0) return;
    if (change.type === 'pages') {
      if (this.index < 0) this.clear();
      return;
    }
    if (change.type !== 'items' || change.pageId !== this.pageId || change.removed.length === 0) return;
    const gone = new Set(change.removed);
    const kept = this.items.filter((item) => !gone.has(item));
    if (kept.length === this.items.length) return;
    // all of it was replaced, like the undo of a move: the new ones are the selection
    if (kept.length === 0 && change.added.length > 0) this.select(this.index, change.added);
    else this.select(this.index, kept);
  }

  // the box of the selection in page units
  box(): Box | null {
    if (this.items.length === 0) return null;
    const box = emptyBox();
    for (const item of this.items) growBox(box, itemBox(item));
    return box;
  }

  private shown(): boolean {
    const index = this.index;
    return index >= 0 && (!this.view.isBoard || index === this.view.board);
  }

  // the box on screen in css pixels, with its padding
  private screenBox(box: Box): Box {
    const d = this.view.toDevice(this.index, box);
    const k = 1 / this.view.dpr;
    return padBox({ minX: d.minX * k, minY: d.minY * k, maxX: d.maxX * k, maxY: d.maxY * k }, PAD);
  }

  private corners(b: Box): number[] {
    return [b.minX, b.minY, b.maxX, b.minY, b.maxX, b.maxY, b.minX, b.maxY];
  }

  // which corner handle is under the point, -1 for none
  private handleAt(x: number, y: number): number {
    const box = this.box();
    if (!box || !this.shown()) return -1;
    const c = this.corners(this.screenBox(box));
    for (let i = 0; i < 4; i++) {
      if (Math.abs(x - c[i * 2]) <= HANDLE_HIT && Math.abs(y - c[i * 2 + 1]) <= HANDLE_HIT) return i;
    }
    return -1;
  }

  private insideBox(x: number, y: number): boolean {
    const box = this.box();
    if (!box || !this.shown()) return false;
    const b = this.screenBox(box);
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
  }

  // a single clip of a pdf shows where it came from in a badge over its box
  private clip(): ImageItem | null {
    if (this.items.length !== 1 || !this.hooks.source) return null;
    const item = this.items[0];
    return item.type === 'image' && item.source ? item : null;
  }

  // the badge in css pixels, over the top right corner of the box or under
  // it when the box reaches the top of the view
  private badge(): (Box & { label: string }) | null {
    const item = this.clip();
    const box = this.box();
    if (!item?.source || !box || !this.shown() || (this.started && this.mode !== 'idle')) return null;
    const label = `p. ${item.source.page}`;
    const b = this.screenBox(box);
    const w = Math.ceil(textWidth(label)) + 30;
    let top = b.minY - BADGE_GAP - BADGE_H;
    if (top < 4) top = b.maxY + BADGE_GAP;
    return { minX: b.maxX - w, minY: top, maxX: b.maxX, maxY: top + BADGE_H, label };
  }

  private onBadge(x: number, y: number): boolean {
    const b = this.badge();
    return b !== null && x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
  }

  hover(s: Sample | null) {
    let cursor = '';
    if (s && this.onBadge(s.x, s.y)) cursor = 'pointer';
    else if (s) {
      const corner = this.handleAt(s.x, s.y);
      if (corner >= 0) cursor = corner % 2 === 0 ? 'nwse-resize' : 'nesw-resize';
      else if (this.insideBox(s.x, s.y)) cursor = 'move';
    }
    this.view.live.style.cursor = cursor;
  }

  down(s: Sample) {
    this.sx = this.cx = s.x;
    this.sy = this.cy = s.y;
    this.started = false;
    this.adding = s.shift === true;
    const clip = this.clip();
    if (clip?.source && this.onBadge(s.x, s.y)) {
      this.mode = 'idle';
      this.hooks.source?.(clip.source);
      return;
    }
    const corner = this.adding ? -1 : this.handleAt(s.x, s.y);
    if (corner >= 0) {
      this.mode = 'scale';
      this.corner = corner;
    } else if (this.insideBox(s.x, s.y)) {
      this.mode = 'move';
    } else {
      this.mode = 'lasso';
      this.lasso = [s.x, s.y];
      if (!this.adding) this.clear();
    }
    this.view.requestLive();
  }

  move(s: Sample) {
    if (this.mode === 'idle') return;
    this.cx = s.x;
    this.cy = s.y;
    if (this.mode === 'lasso') {
      const n = this.lasso.length;
      if (Math.hypot(s.x - this.lasso[n - 2], s.y - this.lasso[n - 1]) >= 2) this.lasso.push(s.x, s.y);
    } else if (!this.started && Math.hypot(s.x - this.sx, s.y - this.sy) >= CLICK) {
      // the items leave their layers and ride on the live canvas until they land
      this.started = true;
      const ready = this.prepared;
      this.sprite = ready && ready.scale === this.spriteScale() ? ready : this.makeSprite();
      this.view.hide(this.index, this.items);
    }
    this.view.requestLive();
  }

  up() {
    const mode = this.mode;
    this.mode = 'idle';
    if (mode === 'lasso') {
      const far = Math.hypot(this.cx - this.sx, this.cy - this.sy) >= CLICK || this.lasso.length > 8;
      if (far) this.finishLasso();
      else this.click(this.sx, this.sy);
    } else if (mode === 'move' || mode === 'scale') {
      if (!this.started) this.click(this.sx, this.sy);
      else this.drop(mode);
    }
    this.lasso = [];
    this.sprite = null;
    this.view.requestLive();
  }

  cancel() {
    if (this.started) this.view.unhide(true);
    this.mode = 'idle';
    this.started = false;
    this.lasso = [];
    this.sprite = null;
    this.view.requestLive();
  }

  // the page under a point of the screen, or the one in the middle of the view
  private pageNear(x: number, y: number): number {
    const index = this.view.pageAtScreen(x, y);
    return index >= 0 ? index : this.view.currentPage;
  }

  private toPage(index: number, x: number, y: number): [number, number] {
    const cam = this.view.cam;
    return [cam.x + x / cam.zoom - this.view.pageX(index), cam.y + y / cam.zoom - this.view.pageY(index)];
  }

  private click(x: number, y: number) {
    const index = this.pageNear(x, y);
    if (index < 0) return;
    const page = this.view.doc.pageAt(index);
    const [px, py] = this.toPage(index, x, y);
    const hit = itemAt(page.items, px, py, PICK / this.view.cam.zoom);
    if (this.adding) {
      this.toggle(index, hit);
      return;
    }
    const now = performance.now();
    const again = hit !== null && hit === this.lastClick.item && now - this.lastClick.time < DOUBLE;
    this.lastClick = { time: now, item: hit };
    if (again && hit?.type === 'text' && this.hooks.editText) {
      this.clear();
      this.hooks.editText(index, hit);
      return;
    }
    if (hit) this.select(index, [hit]);
    else this.clear();
  }

  // a shift click puts an item into the selection or takes it out. on
  // another page it starts a new selection there
  private toggle(index: number, hit: Item | null) {
    if (!hit) return;
    if (this.items.length === 0 || this.index !== index) {
      this.select(index, [hit]);
      return;
    }
    const has = this.items.includes(hit);
    this.select(index, has ? this.items.filter((item) => item !== hit) : [...this.items, hit]);
  }

  private finishLasso() {
    const pts = this.lasso;
    let mx = 0;
    let my = 0;
    for (let i = 0; i < pts.length; i += 2) {
      mx += pts[i];
      my += pts[i + 1];
    }
    const n = pts.length / 2;
    // the page where the loop started, or else the one it is around
    let index = this.view.pageAtScreen(pts[0], pts[1]);
    if (index < 0) index = this.pageNear(mx / n, my / n);
    if (index < 0) return;
    const poly: number[] = [];
    for (let i = 0; i < pts.length; i += 2) poly.push(...this.toPage(index, pts[i], pts[i + 1]));
    const hits = lassoHits(this.view.doc.pageAt(index).items, poly);
    // with shift the loop adds to what is selected on the same page
    if (this.adding && this.items.length > 0 && this.index === index) {
      const more = hits.filter((item) => !this.items.includes(item));
      this.select(index, [...this.items, ...more]);
      return;
    }
    this.select(index, hits);
  }

  // what the drag does to the items so far, in page units
  private change(mode: Mode): Change {
    const z = this.view.cam.zoom;
    const dx = (this.cx - this.sx) / z;
    const dy = (this.cy - this.sy) / z;
    const box = this.box();
    if (mode !== 'scale' || !box) return moveBy(dx, dy);
    const c = this.corners(box);
    const ax = c[((this.corner + 2) % 4) * 2];
    const ay = c[((this.corner + 2) % 4) * 2 + 1];
    const ox = c[this.corner * 2] - ax;
    const oy = c[this.corner * 2 + 1] - ay;
    // the dragged corner follows the pointer along the diagonal, the ratio stays
    const len = ox * ox + oy * oy;
    let k = len > 0 ? ((ox + dx) * ox + (oy + dy) * oy) / len : 1;
    const side = Math.min(box.maxX - box.minX, box.maxY - box.minY);
    k = Math.max(k, 4 / Math.max(side, 1), 0.02);
    return { k: Math.min(k, 50), ax, ay, dx: 0, dy: 0 };
  }

  private drop(mode: Mode) {
    const index = this.index;
    const c = this.change(mode);
    this.view.unhide(c.k === 1 && c.dx === 0 && c.dy === 0);
    if (c.k === 1 && c.dx === 0 && c.dy === 0) return;
    const page = this.view.doc.pageAt(index);
    const box = this.box();
    // a selection dropped on another page of a notebook moves to that page
    if (mode === 'move' && box && !this.view.isBoard) {
      const wx = this.view.pageX(index) + (box.minX + box.maxX) / 2 + c.dx;
      const wy = this.view.pageY(index) + (box.minY + box.maxY) / 2 + c.dy;
      const target = pageAt(this.view.rects, wx, wy);
      if (target >= 0 && target !== index && this.view.doc.isReady(this.view.doc.notebook.pages[target].id)) {
        const shift = moveBy(
          c.dx + this.view.pageX(index) - this.view.pageX(target),
          c.dy + this.view.pageY(index) - this.view.pageY(target)
        );
        this.moveTo(target, this.items.map((item) => transformItem(item, shift)));
        return;
      }
    }
    this.replace(page, (item) => transformItem(item, c));
  }

  // every selected item swapped for a changed one in the same place, one undo step
  replace(page: PageData, fn: (item: Item) => Item) {
    const removed = placesOf(page, this.items);
    const added = removed.map((p) => ({ item: fn(p.item), index: p.index }));
    if (added.every((p, i) => p.item === removed[i].item)) return;
    this.view.history.run({ type: 'items', pageId: page.meta.id, removed, added });
    this.select(this.view.doc.indexOf(page.meta.id), added.map((p) => p.item));
  }

  private moveTo(target: number, moved: Item[]) {
    const from = this.view.doc.pageAt(this.index);
    const to = this.view.doc.pageAt(target);
    const ops: Op[] = [
      { type: 'items', pageId: from.meta.id, removed: placesOf(from, this.items), added: [] },
      {
        type: 'items',
        pageId: to.meta.id,
        removed: [],
        added: moved.map((item, i) => ({ item, index: to.items.length + i }))
      }
    ];
    this.view.history.run({ type: 'batch', ops });
    this.select(target, moved);
  }

  // the edits the options bar and the keys ask for

  remove() {
    const index = this.index;
    if (index < 0 || this.items.length === 0) return;
    const page = this.view.doc.pageAt(index);
    this.view.history.run({ type: 'items', pageId: page.meta.id, removed: placesOf(page, this.items), added: [] });
    this.clear();
  }

  nudge(dx: number, dy: number) {
    const index = this.index;
    if (index < 0 || this.items.length === 0 || this.busy) return;
    this.replace(this.view.doc.pageAt(index), (item) => transformItem(item, moveBy(dx, dy)));
  }

  recolor(color: string) {
    const index = this.index;
    if (index < 0 || this.items.length === 0) return;
    this.replace(this.view.doc.pageAt(index), (item) => recolorItem(item, color));
  }

  // new items on top of page index, they become the selection
  insert(index: number, items: Item[]) {
    if (index < 0 || items.length === 0) return;
    const page = this.view.doc.pageAt(index);
    const added = items.map((item, i) => ({ item, index: page.items.length + i }));
    this.view.history.run({ type: 'items', pageId: page.meta.id, removed: [], added });
    this.select(index, items);
  }

  // drawing

  private prepare = () => {
    this.prepTimer = null;
    if (this.busy) return;
    const sprite = this.makeSprite();
    if (!sprite) return;
    // a canvas draws when its picture is first used, this makes it draw now
    const sink = new OffscreenCanvas(1, 1).getContext('2d');
    sink?.drawImage(sprite.canvas, 0, 0, 1, 1);
    this.prepared = sprite;
  };

  // device pixels per page unit of the sprite, smaller for a big selection
  private spriteScale(): number {
    const box = this.box();
    if (!box) return 1;
    const w = Math.max(box.maxX - box.minX, 1);
    const h = Math.max(box.maxY - box.minY, 1);
    let scale = this.view.cam.zoom * this.view.dpr;
    if (w * h * scale * scale > SPRITE_PIXELS) scale = Math.sqrt(SPRITE_PIXELS / (w * h));
    return Math.min(scale, 8192 / Math.max(w, h));
  }

  // the selection drawn once into a picture, so a drag only moves that picture
  private makeSprite(): Sprite | null {
    const box = this.box();
    const index = this.index;
    if (!box || index < 0 || typeof OffscreenCanvas === 'undefined') return null;
    const w = box.maxX - box.minX;
    const h = box.maxY - box.minY;
    const scale = this.spriteScale();
    const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(w * scale) + 2), Math.max(1, Math.ceil(h * scale) + 2));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const x = box.minX - 1 / scale;
    const y = box.minY - 1 / scale;
    const dark = isDark(this.view.doc.pageAt(index).meta.paper);
    ctx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
    for (const item of this.items) if (item.type === 'image') drawImageItem(ctx, item, dark);
    const marks = this.items.filter(isMarker);
    if (marks.length > 0) {
      const layer = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d');
      if (layer) {
        layer.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
        for (const item of marks) drawItem(layer, item, dark, scale);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = HIGHLIGHTER_ALPHA;
        ctx.drawImage(layer.canvas, 0, 0);
        ctx.restore();
      }
    }
    for (const item of this.items) {
      if (item.type !== 'image' && !isMarker(item)) drawItem(ctx, item, dark, scale);
    }
    return { canvas, scale, x, y };
  }

  drawLive(ctx: CanvasRenderingContext2D): Box | null {
    const dpr = this.view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.mode === 'lasso') return this.drawLasso(ctx);
    if (this.items.length === 0 || !this.shown()) return null;
    let box = this.box()!;
    const covered = emptyBox();
    if (this.started && this.mode !== 'idle') {
      const c = this.change(this.mode);
      const sprite = this.sprite;
      if (sprite) {
        const at = this.view.toDevice(this.index, {
          minX: c.ax + (sprite.x - c.ax) * c.k + c.dx,
          minY: c.ay + (sprite.y - c.ay) * c.k + c.dy,
          maxX: 0,
          maxY: 0
        });
        const k = (this.view.cam.zoom * dpr * c.k) / sprite.scale;
        const w = sprite.canvas.width * k;
        const h = sprite.canvas.height * k;
        ctx.drawImage(sprite.canvas, at.minX, at.minY, w, h);
        growBox(covered, { minX: at.minX, minY: at.minY, maxX: at.minX + w, maxY: at.minY + h });
      }
      box = {
        minX: c.ax + (box.minX - c.ax) * c.k + c.dx,
        minY: c.ay + (box.minY - c.ay) * c.k + c.dy,
        maxX: c.ax + (box.maxX - c.ax) * c.k + c.dx,
        maxY: c.ay + (box.maxY - c.ay) * c.k + c.dy
      };
    }
    const b = this.screenBox(box);
    const x0 = Math.round(b.minX * dpr) + 0.5;
    const y0 = Math.round(b.minY * dpr) + 0.5;
    const x1 = Math.round(b.maxX * dpr) - 0.5;
    const y1 = Math.round(b.maxY * dpr) - 0.5;
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1, Math.round(dpr));
    ctx.strokeStyle = ACCENT;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const r = Math.round(HANDLE * dpr);
    const corners = [x0, y0, x1, y0, x1, y1, x0, y1];
    for (let i = 0; i < 8; i += 2) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(corners[i] - r, corners[i + 1] - r, r * 2, r * 2);
      ctx.strokeRect(corners[i] - r, corners[i + 1] - r, r * 2, r * 2);
    }
    const pad = r + dpr * 2;
    growBox(covered, { minX: x0 - pad, minY: y0 - pad, maxX: x1 + pad, maxY: y1 + pad });
    const badge = this.badge();
    if (badge) growBox(covered, this.drawBadge(ctx, badge, dpr));
    return covered;
  }

  // an accent tag with the page number and a small arrow
  private drawBadge(ctx: CanvasRenderingContext2D, b: Box & { label: string }, dpr: number): Box {
    const x = Math.round(b.minX * dpr);
    const y = Math.round(b.minY * dpr);
    const w = Math.round((b.maxX - b.minX) * dpr);
    const h = Math.round((b.maxY - b.minY) * dpr);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#111111';
    ctx.font = BADGE_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dpr, dpr);
    ctx.fillText(b.label, 8, BADGE_H / 2 + 0.5);
    // an arrow out of the box, like a link that opens somewhere else
    const ax = w / dpr - 15;
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, 14);
    ctx.lineTo(ax + 7, 7);
    ctx.moveTo(ax + 2.5, 7);
    ctx.lineTo(ax + 7, 7);
    ctx.lineTo(ax + 7, 11.5);
    ctx.stroke();
    ctx.restore();
    return { minX: x - 2, minY: y - 2, maxX: x + w + 2, maxY: y + h + 2 };
  }

  private drawLasso(ctx: CanvasRenderingContext2D): Box | null {
    const pts = this.lasso;
    if (pts.length < 4) return null;
    const dpr = this.view.dpr;
    const box = emptyBox();
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] * dpr;
      const y = pts[i + 1] * dpr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      growBox(box, { minX: x, minY: y, maxX: x, maxY: y });
    }
    ctx.closePath();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(209, 154, 102, 0.08)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, dpr * 1.25);
    ctx.lineJoin = 'round';
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.strokeStyle = ACCENT;
    ctx.stroke();
    ctx.setLineDash([]);
    return padBox(box, dpr * 3);
  }
}
