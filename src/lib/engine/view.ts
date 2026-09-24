import { boxesTouch, emptyBox, growBox, itemBox, moveBox } from './bounds';
import {
  clampCamera,
  contentRect,
  fitWidthZoom,
  layoutPages,
  MARGIN,
  nearestPage,
  pageAt,
  snapCamera,
  stepZoom,
  visiblePages,
  zoomAt,
  type Camera,
  type Rect
} from './camera';
import { imagesOf, type Doc, type DocChange, type PageData } from './doc';
import type { History } from './history';
import { onBitmap } from './images';
import { penIsDown } from './input';
import {
  darkUnder,
  drawImageItem,
  drawItem,
  drawPattern,
  drawSheet,
  HIGHLIGHTER_ALPHA,
  isDark,
  isMarker,
  PDF_EDGE,
  PDF_WAITING
} from './render';
import { hasLine, hasPath, strokeLine, strokePath, THIN } from './stroke';
import { TileLayer, type TileJob } from './tiles';
import type { Tool } from './tools/tool';
import type { Box, Item, PdfBackground } from './types';
import { PAPER_COLORS } from '$lib/editor/paper';
import { capScale, MAX_PIXELS, onShot, previewScale, shotsOf, touchShot, want, type Wanted } from '$lib/pdf/pdf';
import { pickShots, sharp, type Part } from '$lib/pdf/shots';

const BG_DEEP = '#111113';
// how long the zoom has to rest before the tiles are rendered sharp again
const ZOOM_SETTLE = 150;
// time per frame for rendering missing tiles
const BUDGET = 6;
const BUDGET_PEN_DOWN = 3;

// the items of one page inside a tile, in paint order
interface Group {
  rect: Rect | null;
  dark: boolean;
  items: Item[];
}

export interface ViewHooks {
  // the zoom or the page in the middle of the view changed
  state?: () => void;
  // the scroll position of a paper notebook, as shares of the whole. a
  // size of 1 means it all fits
  scroll?: (start: number, size: number) => void;
  // the pages on screen and two on each side, they should be in memory
  near?: (first: number, last: number) => void;
  // the camera moved, for things laid over the canvas
  camera?: () => void;
}

// pages around the view that get loaded before they come in sight
const NEAR = 2;
// ms, a wheel step glides most of its way in about three times this
const GLIDE = 40;
// device pixels, a sharp part of a pdf page is cut on this grid so a small
// pan does not ask for a new one
const PART_GRID = 256;
// ms, how fast a flung page slows down after the fingers lifted
const FRICTION = 260;
// px per ms, slower than this a fling has ended
const FLING_STOP = 0.02;

function makeCanvas(host: HTMLElement, name: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = `layer-${name}`;
  canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block';
  host.appendChild(canvas);
  return canvas;
}

export class CanvasView {
  readonly host: HTMLElement;
  doc: Doc;
  history: History;
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  dpr = 1;
  width = 0;
  height = 0;
  // where the canvas sits in the window, kept so pointer handlers never read layout
  left = 0;
  top = 0;
  rects: Rect[] = [];
  board = 0;
  // the tool whose overlay is drawn
  tool: Tool | null = null;
  // work time of the last frame in ms, for measuring
  lastFrame = 0;

  readonly bg: HTMLCanvasElement;
  readonly hl: HTMLCanvasElement;
  readonly ink: HTMLCanvasElement;
  readonly live: HTMLCanvasElement;
  private bgCtx: CanvasRenderingContext2D;
  private hlCtx: CanvasRenderingContext2D;
  private inkCtx: CanvasRenderingContext2D;
  private liveCtx: CanvasRenderingContext2D;
  private hlLayer: TileLayer;
  private inkLayer: TileLayer;

  private content: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private raf = 0;
  private bgDirty = true;
  private inkDirty = true;
  private hlDirty = true;
  private liveDirty = false;
  private sizeDirty = true;
  // render everything on screen in this frame, no budget
  private full = true;
  private liveBox: Box | null = null;
  private liveClean = false;
  private zoomedAt = 0;
  private zoomTimer: ReturnType<typeof setTimeout> | null = null;
  // a paper notebook keeps fitting its width until someone zooms
  fitted = true;
  // the board on show is followed by id, so deleting another one keeps it
  private boardId = '';
  private cameras = new Map<string, Camera>();
  private shownZoom = 0;
  private shownPage = -1;
  private shownScroll = -1;
  private shownSize = -1;
  private shownNear = '';
  // screen px a wheel step still has to move the pages, and the speed in
  // px per ms of a touch pan that goes on after the fingers lifted
  private glideX = 0;
  private glideY = 0;
  private flingX = 0;
  private flingY = 0;
  private movedAt = 0;
  // idle work: are the outlines near the view built, and the pending callback
  private warm = false;
  private idle: (() => void) | null = null;
  // items a tool holds (a selection on the move, a text being edited) are
  // left out of the layers until they come back
  private hidden: Set<Item> | null = null;
  private hiddenPage = -1;
  private offDoc: () => void;
  private offBitmap: () => void;
  private offShot: () => void;
  // the zoom changed and the pdf pages wait for it to rest before they are drawn sharp
  private pdfWait = false;
  private observer: ResizeObserver;
  private dprQuery: MediaQueryList | null = null;

  constructor(
    host: HTMLElement,
    doc: Doc,
    history: History,
    private hooks: ViewHooks = {}
  ) {
    this.host = host;
    this.doc = doc;
    this.history = history;
    this.bg = makeCanvas(host, 'paper');
    this.hl = makeCanvas(host, 'highlighter');
    this.ink = makeCanvas(host, 'ink');
    this.live = makeCanvas(host, 'live');
    this.bgCtx = this.bg.getContext('2d', { alpha: false })!;
    this.hlCtx = this.hl.getContext('2d')!;
    this.inkCtx = this.ink.getContext('2d')!;
    // the live canvas skips the compositor queue, the pen tip gets ink sooner
    this.liveCtx = this.live.getContext('2d', { desynchronized: true })!;
    this.hl.style.opacity = String(HIGHLIGHTER_ALPHA);
    this.live.style.touchAction = 'none';
    host.style.isolation = 'isolate';

    this.hlLayer = new TileLayer((box, scale) => this.paint(box, scale, true));
    this.inkLayer = new TileLayer((box, scale) => this.paint(box, scale, false));
    this.offDoc = doc.on(this.onChange);
    // a picture that finished decoding shows up on the paper layer
    this.offBitmap = onBitmap(() => {
      this.bgDirty = true;
      this.requestFrame();
    });
    // and a pdf page that was rendered, it may turn out to be a dark one
    this.offShot = onShot(() => {
      this.bgDirty = true;
      this.updateBlend();
      this.requestFrame();
    });

    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(host);
    window.addEventListener('resize', this.measure);
    this.watchDpr();
    this.measure();
    this.relayout();
    this.home();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.idle?.();
    if (this.zoomTimer) clearTimeout(this.zoomTimer);
    this.offDoc();
    this.offBitmap();
    this.offShot();
    want('canvas', []);
    this.observer.disconnect();
    window.removeEventListener('resize', this.measure);
    this.dprQuery?.removeEventListener('change', this.onDpr);
    this.hlLayer.clear();
    this.inkLayer.clear();
    for (const canvas of [this.bg, this.hl, this.ink, this.live]) canvas.remove();
  }

  // another notebook takes the place of this one
  setDoc(doc: Doc, history: History) {
    this.offDoc();
    this.doc = doc;
    this.history = history;
    this.offDoc = doc.on(this.onChange);
    this.board = 0;
    this.boardId = '';
    this.hidden = null;
    this.cameras.clear();
    this.halt();
    this.shownNear = '';
    this.shownPage = -1;
    this.relayout();
    this.redrawAll();
    this.home();
  }

  get isBoard(): boolean {
    return this.doc.kind === 'board';
  }

  // the page in the middle of the view, or the board on show
  get currentPage(): number {
    if (this.isBoard) return this.board;
    return nearestPage(this.rects, this.cam.y + this.height / 2 / this.cam.zoom);
  }

  requestFrame() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  requestLive() {
    this.liveDirty = true;
    this.requestFrame();
  }

  // a live highlighter stroke is drawn on the highlighter canvas, which is
  // put together again for it
  requestUnder() {
    this.hlDirty = true;
    this.requestFrame();
  }

  // drops every cached tile and draws the screen again in one go
  redrawAll() {
    this.warm = false;
    this.hlLayer.clear();
    this.inkLayer.clear();
    this.full = true;
    this.bgDirty = this.inkDirty = this.hlDirty = this.liveDirty = true;
    this.updateBlend();
    this.requestFrame();
  }

  // camera

  setCamera(next: Camera) {
    if (!this.isBoard) next = clampCamera(next, this.content, this.width, this.height);
    next = snapCamera(next, this.dpr);
    const cam = this.cam;
    if (next.x === cam.x && next.y === cam.y && next.zoom === cam.zoom) return;
    if (next.zoom !== cam.zoom) {
      // more pages may be in sight now
      this.warm = false;
      this.zoomedAt = performance.now();
      this.pdfWait = true;
      if (this.zoomTimer) clearTimeout(this.zoomTimer);
      this.zoomTimer = setTimeout(() => this.requestFrame(), ZOOM_SETTLE + 20);
    }
    this.cam = next;
    this.bgDirty = this.inkDirty = this.hlDirty = true;
    if (this.tool) this.liveDirty = true;
    this.requestFrame();
    this.hooks.camera?.();
  }

  panBy(dx: number, dy: number) {
    const { x, y, zoom } = this.cam;
    this.setCamera({ x: x - dx / zoom, y: y - dy / zoom, zoom });
  }

  // a mouse wheel step moves the pages by dx, dy in a short ease
  glide(dx: number, dy: number) {
    this.flingX = this.flingY = 0;
    this.glideX += dx;
    this.glideY += dy;
    this.requestFrame();
  }

  // the pages keep moving at this speed (px per ms) and slow down
  fling(vx: number, vy: number) {
    this.glideX = this.glideY = 0;
    this.flingX = vx;
    this.flingY = vy;
    this.movedAt = 0;
    this.requestFrame();
  }

  // something touched the page: a glide lands where it was going right
  // away, a fling stops where it is
  settle() {
    if (this.glideX !== 0 || this.glideY !== 0) this.panBy(this.glideX, this.glideY);
    this.halt();
  }

  // a jump somewhere else drops what was left of a glide or a fling
  private halt() {
    this.glideX = this.glideY = this.flingX = this.flingY = 0;
    this.movedAt = 0;
  }

  private get moving(): boolean {
    return this.glideX !== 0 || this.glideY !== 0 || this.flingX !== 0 || this.flingY !== 0;
  }

  // one step of a glide or a fling, from the frame loop
  private move(now: number) {
    const dt = this.movedAt ? Math.min(50, now - this.movedAt) : 16;
    this.movedAt = now;
    const before = this.cam;
    if (this.glideX !== 0 || this.glideY !== 0) {
      const k = 1 - Math.exp(-dt / GLIDE);
      let sx = this.glideX * k;
      let sy = this.glideY * k;
      if (Math.abs(this.glideX - sx) < 0.5 && Math.abs(this.glideY - sy) < 0.5) {
        sx = this.glideX;
        sy = this.glideY;
      }
      this.glideX -= sx;
      this.glideY -= sy;
      this.panBy(sx, sy);
    } else {
      this.panBy(this.flingX * dt, this.flingY * dt);
      const decay = Math.exp(-dt / FRICTION);
      this.flingX *= decay;
      this.flingY *= decay;
      // at the end of the pages there is nowhere left to go
      if (Math.hypot(this.flingX, this.flingY) < FLING_STOP || this.cam === before) this.flingX = this.flingY = 0;
    }
    if (this.moving) this.requestFrame();
    else this.movedAt = 0;
  }

  zoomAt(sx: number, sy: number, zoom: number) {
    this.fitted = false;
    this.setCamera(zoomAt(this.cam, sx, sy, zoom));
  }

  zoomStep(dir: 1 | -1) {
    this.zoomAt(this.width / 2, this.height / 2, stepZoom(this.cam.zoom, dir));
  }

  // paper fits the page width, a board goes back to 100 percent. a resize
  // keeps the top of the view, the panels coming and going would push it down
  zoomReset(keepTop = false) {
    if (this.isBoard) {
      this.zoomAt(this.width / 2, this.height / 2, 1);
      return;
    }
    const zoom = fitWidthZoom(this.content.w, this.width);
    const mid = this.cam.y + this.height / 2 / this.cam.zoom;
    this.fitted = true;
    this.setCamera({ x: this.cam.x, y: keepTop ? this.cam.y : mid - this.height / 2 / zoom, zoom });
  }

  // where a notebook starts: the top of the first page, or the middle of the board
  private home() {
    if (this.isBoard) {
      this.setCamera(this.boardHome());
      return;
    }
    const zoom = fitWidthZoom(this.content.w, this.width);
    this.fitted = true;
    this.setCamera({ x: 0, y: this.content.y - MARGIN / zoom, zoom });
    // a notebook that just opened has no old pictures to stretch, its pdf
    // pages are drawn sharp right away
    this.pdfWait = false;
  }

  // a board starts at its middle at 100 percent, one with a pdf page on it
  // shows the whole pdf page
  private boardHome(): Camera {
    const bg = this.doc.notebook.pages[this.board]?.pdf;
    if (!bg) return { x: -this.width / 2, y: -this.height / 2, zoom: 1 };
    const zoom = Math.min(1, (this.width - MARGIN * 2) / bg.w, (this.height - MARGIN * 2) / bg.h);
    return {
      x: bg.x + bg.w / 2 - this.width / 2 / zoom,
      y: bg.y + bg.h / 2 - this.height / 2 / zoom,
      zoom: Math.max(0.1, zoom)
    };
  }

  goToPage(index: number) {
    if (index < 0 || index >= this.doc.pageCount) return;
    this.halt();
    if (this.isBoard) {
      if (index === this.board) return;
      const id = this.doc.notebook.pages[this.board]?.id;
      if (id) this.cameras.set(id, { ...this.cam });
      this.board = index;
      this.boardId = this.doc.notebook.pages[index].id;
      this.redrawAll();
      const saved = this.cameras.get(this.boardId);
      this.setCamera(saved ?? this.boardHome());
      this.hooks.state?.();
      return;
    }
    const r = this.rects[index];
    this.setCamera({ x: this.cam.x, y: r.y - MARGIN / this.cam.zoom, zoom: this.cam.zoom });
  }

  // fraction 0..1 of the whole scroll range, for the scroll indicator
  scrollTo(fraction: number) {
    if (this.isBoard) return;
    this.halt();
    const m = MARGIN / this.cam.zoom;
    const total = this.content.h + m * 2;
    this.setCamera({ x: this.cam.x, y: this.content.y - m + fraction * total, zoom: this.cam.zoom });
  }

  // pages

  // is any of the page on screen
  pageShown(index: number): boolean {
    if (this.isBoard) return index === this.board;
    const r = this.rects[index];
    if (!r) return false;
    const top = this.cam.y;
    const bottom = top + this.height / this.cam.zoom;
    return r.y < bottom && r.y + r.h > top;
  }

  pageAtScreen(sx: number, sy: number): number {
    if (this.isBoard) return this.board;
    return pageAt(this.rects, this.cam.x + sx / this.cam.zoom, this.cam.y + sy / this.cam.zoom);
  }

  // top left of the page in the world. board items already are world points
  pageX(index: number): number {
    return this.isBoard ? 0 : this.rects[index].x;
  }

  pageY(index: number): number {
    return this.isBoard ? 0 : this.rects[index].y;
  }

  // sets ctx up to draw in page units of page index, clipped to the page
  applyPage(ctx: CanvasRenderingContext2D, index: number) {
    const s = this.cam.zoom * this.dpr;
    const ox = this.pageX(index);
    const oy = this.pageY(index);
    ctx.setTransform(s, 0, 0, s, (ox - this.cam.x) * s, (oy - this.cam.y) * s);
    if (!this.isBoard) {
      const r = this.rects[index];
      ctx.beginPath();
      ctx.rect(0, 0, r.w, r.h);
      ctx.clip();
    }
  }

  // a box in page units as a box in device pixels
  toDevice(index: number, box: Box): Box {
    const s = this.cam.zoom * this.dpr;
    const ox = this.pageX(index) - this.cam.x;
    const oy = this.pageY(index) - this.cam.y;
    return {
      minX: (box.minX + ox) * s,
      minY: (box.minY + oy) * s,
      maxX: (box.maxX + ox) * s,
      maxY: (box.maxY + oy) * s
    };
  }

  // takes items of page index off the layers, a tool draws them itself for a while
  hide(index: number, items: Item[]) {
    this.unhide(true);
    this.hidden = new Set(items);
    this.hiddenPage = index;
    this.refresh(index, items);
  }

  // the hidden items come back. no redraw when a change of the doc that
  // follows right away draws their place anyway
  unhide(redraw: boolean) {
    const hidden = this.hidden;
    this.hidden = null;
    if (hidden && redraw) this.refresh(this.hiddenPage, [...hidden]);
  }

  // draws the place of these items again on the layers they are on
  private refresh(index: number, items: Item[]) {
    if (index < 0 || index >= this.doc.pageCount) return;
    const box = emptyBox();
    let marks = false;
    let ink = false;
    for (const item of items) {
      growBox(box, itemBox(item));
      if (item.type === 'image') this.bgDirty = true;
      else if (isMarker(item)) marks = true;
      else ink = true;
    }
    const world = moveBox(box, this.pageX(index), this.pageY(index));
    if (marks) this.hlLayer.invalidate(world);
    if (ink) this.inkLayer.invalidate(world);
    this.hlDirty ||= marks;
    this.inkDirty ||= ink;
    this.requestFrame();
  }

  // the pages that reach into a box of world units
  pagesIn(box: Box): number[] {
    if (this.isBoard) return [this.board];
    const [from, to] = visiblePages(this.rects, box.minY, box.maxY);
    const out: number[] = [];
    for (let i = from; i < to; i++) {
      const r = this.rects[i];
      if (r.x <= box.maxX && r.x + r.w >= box.minX) out.push(i);
    }
    return out;
  }

  // inside

  private measure = () => {
    const rect = this.host.getBoundingClientRect();
    this.left = rect.left;
    this.top = rect.top;
    if (rect.width !== this.width || rect.height !== this.height) {
      this.width = rect.width;
      this.height = rect.height;
      this.sizeDirty = true;
      this.requestFrame();
    }
  };

  private watchDpr() {
    this.dprQuery?.removeEventListener('change', this.onDpr);
    this.dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprQuery.addEventListener('change', this.onDpr);
  }

  // the window went to a screen with another pixel density
  private onDpr = () => {
    this.sizeDirty = true;
    this.watchDpr();
    this.requestFrame();
  };

  private applySize() {
    this.sizeDirty = false;
    const dpr = window.devicePixelRatio || 1;
    // another screen: the old tiles are of no use, the screen is drawn anew
    // in one go instead of tile by tile over an empty canvas
    if (dpr !== this.dpr) this.full = true;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(this.width * this.dpr));
    const h = Math.max(1, Math.round(this.height * this.dpr));
    for (const canvas of [this.bg, this.hl, this.ink, this.live]) {
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
    // the overlay starts out empty, also when the size in pixels stayed
    this.liveCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.liveCtx.clearRect(0, 0, w, h);
    this.liveBox = null;
    this.liveClean = true;
    this.bgDirty = this.inkDirty = this.hlDirty = this.liveDirty = true;
    if (this.fitted && !this.isBoard) this.zoomReset(true);
    else this.setCamera(this.cam);
  }

  private relayout() {
    this.rects = this.isBoard ? [] : layoutPages(this.doc.notebook.pages);
    this.content = contentRect(this.rects);
    const found = this.boardId ? this.doc.indexOf(this.boardId) : -1;
    if (found >= 0) this.board = found;
    this.board = Math.max(0, Math.min(this.board, this.doc.pageCount - 1));
    this.boardId = this.doc.notebook.pages[this.board]?.id ?? '';
  }

  // on a dark page the highlighter is laid on normally, multiply would hide it
  private updateBlend() {
    const index = this.currentPage;
    const page = index >= 0 && index < this.doc.pageCount ? this.doc.notebook.pages[index] : null;
    const blend = page && darkUnder(page) ? 'normal' : 'multiply';
    if (this.hl.style.mixBlendMode !== blend) this.hl.style.mixBlendMode = blend;
  }

  // what a tile of one layer has to draw, page by page, in a job the tile
  // layer can spread over frames
  private paint(box: Box, scale: number, marker: boolean): TileJob | null {
    const groups: Group[] = [];
    if (this.isBoard) {
      if (this.doc.pageCount > 0) this.collect(groups, this.doc.pageAt(this.board), box, marker, null);
    } else {
      for (const i of this.pagesIn(box)) this.collect(groups, this.doc.pageAt(i), box, marker, this.rects[i]);
    }
    if (groups.length === 0) return null;
    let g = 0;
    let i = 0;
    return {
      draw: (ctx, count) => {
        while (g < groups.length && count > 0) {
          const group = groups[g];
          ctx.save();
          if (group.rect) {
            ctx.beginPath();
            ctx.rect(group.rect.x, group.rect.y, group.rect.w, group.rect.h);
            ctx.clip();
            ctx.translate(group.rect.x, group.rect.y);
          }
          const end = Math.min(group.items.length, i + count);
          count -= end - i;
          for (; i < end; i++) drawItem(ctx, group.items[i], group.dark, scale);
          ctx.restore();
          if (i >= group.items.length) {
            g++;
            i = 0;
          }
        }
        return g >= groups.length;
      }
    };
  }

  private collect(groups: Group[], page: PageData, box: Box, marker: boolean, rect: Rect | null) {
    const ox = rect ? rect.x : 0;
    const oy = rect ? rect.y : 0;
    const hits = page.tree.search({ minX: box.minX - ox, minY: box.minY - oy, maxX: box.maxX - ox, maxY: box.maxY - oy });
    if (hits.length === 0) return;
    this.doc.ensureOrder(page);
    hits.sort((a, b) => a.z - b.z);
    const items: Item[] = [];
    const hidden = this.hidden;
    for (const hit of hits) {
      const item = hit.item;
      // pictures are on the paper layer
      if (item.type === 'image' || isMarker(item) !== marker) continue;
      if (hidden && hidden.has(item)) continue;
      items.push(item);
    }
    if (items.length > 0) groups.push({ rect, dark: isDark(page.meta.paper), items });
  }

  private onChange = (change: DocChange) => {
    if (change.type === 'items') {
      this.warm = false;
      const index = this.doc.indexOf(change.pageId);
      if (index < 0 || (this.isBoard && index !== this.board)) return;
      const ox = this.pageX(index);
      const oy = this.pageY(index);
      const rect = this.isBoard ? null : this.rects[index];
      let marks = false;
      let ink = false;
      const sort = (item: Item) => {
        if (item.type === 'image') this.bgDirty = true;
        else if (isMarker(item)) marks = true;
        else ink = true;
      };
      change.added.forEach(sort);
      change.removed.forEach(sort);

      if (change.append) {
        const dark = isDark(this.doc.pageAt(index).meta.paper);
        for (const item of change.added) {
          if (item.type === 'image') continue;
          const layer = isMarker(item) ? this.hlLayer : this.inkLayer;
          layer.drawInto(moveBox(itemBox(item), ox, oy), (ctx, scale) => {
            if (rect) {
              ctx.beginPath();
              ctx.rect(rect.x, rect.y, rect.w, rect.h);
              ctx.clip();
            }
            ctx.translate(ox, oy);
            drawItem(ctx, item, dark, scale);
          });
        }
      } else {
        const box = moveBox(change.box, ox, oy);
        if (marks) this.hlLayer.invalidate(box);
        if (ink) this.inkLayer.invalidate(box);
      }
      if (marks) this.hlDirty = true;
      if (ink) this.inkDirty = true;
      this.requestFrame();
    } else if (change.type === 'loaded') {
      const index = this.doc.indexOf(change.pageId);
      if (index < 0 || change.box.minX > change.box.maxX) return;
      if (this.isBoard && index !== this.board) return;
      this.warm = false;
      const box = moveBox(change.box, this.pageX(index), this.pageY(index));
      this.hlLayer.drop(box);
      this.inkLayer.drop(box);
      // its pictures are on the paper layer
      this.bgDirty = this.inkDirty = this.hlDirty = true;
      this.requestFrame();
    } else if (change.type === 'pages') {
      this.relayout();
      this.redrawAll();
      this.setCamera(this.cam);
      this.shownPage = -1;
      this.shownNear = '';
    } else if (change.type === 'paper') {
      // the ink color follows the paper, so the page is drawn again
      const index = this.doc.indexOf(change.pageId);
      if (index < 0) return;
      if (this.isBoard) {
        if (index === this.board) this.redrawAll();
        return;
      }
      const r = this.rects[index];
      const box = { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h };
      this.hlLayer.invalidate(box);
      this.inkLayer.invalidate(box);
      this.updateBlend();
      this.bgDirty = this.inkDirty = this.hlDirty = true;
      this.requestFrame();
    }
  };

  private frame = () => {
    this.raf = 0;
    const start = performance.now();
    if (this.moving) this.move(start);
    const tool = this.tool;
    tool?.frame?.();
    if (this.sizeDirty) this.applySize();

    // a zoom keeps showing the old tiles stretched until it rests, or
    // right away when it went so far out that they would be too many
    const target = this.cam.zoom * this.dpr;
    const scale = this.inkLayer.scale;
    if (scale !== 0 && scale !== target && (start - this.zoomedAt >= ZOOM_SETTLE || target / scale < 0.5)) {
      this.inkLayer.setScale(target, this.inkCtx);
      this.hlLayer.setScale(target, this.hlCtx);
      this.inkDirty = this.hlDirty = true;
    }
    if (this.pdfWait && start - this.zoomedAt >= ZOOM_SETTLE) {
      this.pdfWait = false;
      this.bgDirty = true;
    }

    if (this.bgDirty) {
      this.drawBackground();
      this.bgDirty = false;
    }

    const deadline = this.full ? Infinity : start + (penIsDown() ? BUDGET_PEN_DOWN : BUDGET);
    const prefetch = !penIsDown();
    // tiles left half drawn while the pen was down go on once it lifts
    if (prefetch) {
      this.inkDirty ||= this.inkLayer.busy;
      this.hlDirty ||= this.hlLayer.busy;
    }
    if (this.inkDirty) {
      this.inkDirty = this.inkLayer.compose(this.inkCtx, this.cam, this.dpr, this.width, this.height, deadline, prefetch);
    }
    if (this.hlDirty) {
      this.hlDirty = this.hlLayer.compose(this.hlCtx, this.cam, this.dpr, this.width, this.height, deadline, prefetch);
      if (tool?.drawUnder) {
        this.hlCtx.save();
        tool.drawUnder(this.hlCtx);
        this.hlCtx.restore();
      }
    }
    if (this.liveDirty) this.drawLive();
    this.full = false;

    this.report();
    this.lastFrame = performance.now() - start;
    if (this.inkDirty || this.hlDirty || this.liveDirty || this.inkLayer.busy || this.hlLayer.busy) this.requestFrame();
    else if (!this.warm) this.warmLater();
  };

  // builds the outlines of the strokes near the view while nothing else
  // happens, so a zoom out or a scroll finds them ready
  private warmLater() {
    if (this.idle) return;
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(this.warmUp, { timeout: 1000 });
      this.idle = () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(() => this.warmUp({ didTimeout: false, timeRemaining: () => 8 }), 60);
      this.idle = () => clearTimeout(id);
    }
  }

  private warmUp = (deadline: IdleDeadline) => {
    this.idle = null;
    if (penIsDown()) {
      this.warmLater();
      return;
    }
    this.inkLayer.reserve();
    this.hlLayer.reserve();
    // the pages on screen and two more on each side
    let first = this.board;
    let last = this.board;
    if (!this.isBoard) {
      const [from, to] = visiblePages(this.rects, this.cam.y, this.cam.y + this.height / this.cam.zoom);
      first = Math.max(0, from - 2);
      last = Math.min(this.doc.pageCount - 1, to + 1);
    }
    const scale = this.cam.zoom * this.dpr;
    for (let i = first; i <= last; i++) {
      for (const item of this.doc.pageAt(i).items) {
        if (item.type !== 'stroke') continue;
        // the shape this zoom needs, see drawItem
        const thin = item.size * scale < THIN;
        if (thin ? hasLine(item) : hasPath(item)) continue;
        if (deadline.timeRemaining() < 2) {
          this.warmLater();
          return;
        }
        if (thin) strokeLine(item);
        else strokePath(item);
      }
    }
    this.warm = true;
  };

  private drawBackground() {
    const ctx = this.bgCtx;
    const s = this.cam.zoom * this.dpr;
    const w = this.bg.width;
    const h = this.bg.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.isBoard) {
      if (this.doc.pageCount === 0) return;
      const paper = this.doc.pageAt(this.board).meta.paper;
      ctx.fillStyle = PAPER_COLORS[paper.color].paper;
      ctx.fillRect(0, 0, w, h);
      drawPattern(ctx, paper, -this.cam.x * s, -this.cam.y * s, s, 0, 0, w, h, true);
      this.drawPdf(ctx, this.board);
      this.drawImages(ctx, this.board);
      this.wantPdf(this.board, this.board + 1);
      return;
    }
    ctx.fillStyle = BG_DEEP;
    ctx.fillRect(0, 0, w, h);
    const [from, to] = visiblePages(this.rects, this.cam.y, this.cam.y + this.height / this.cam.zoom);
    for (let i = from; i < to; i++) {
      const r = this.rects[i];
      const paper = this.doc.notebook.pages[i].paper;
      drawSheet(ctx, paper, (r.x - this.cam.x) * s, (r.y - this.cam.y) * s, r.w * s, r.h * s, s, w, h);
      this.drawPdf(ctx, i);
      this.drawImages(ctx, i);
    }
    this.wantPdf(from, to);
  }

  // the pdf page under a page, from the best pictures there are of it. a
  // picture made for this very scale is copied pixel for pixel
  private drawPdf(ctx: CanvasRenderingContext2D, index: number) {
    const meta = this.doc.notebook.pages[index];
    const bg = meta?.pdf;
    if (!bg) return;
    const s = this.cam.zoom * this.dpr;
    const ox = (this.pageX(index) + bg.x - this.cam.x) * s;
    const oy = (this.pageY(index) + bg.y - this.cam.y) * s;
    const w = bg.w * s;
    const h = bg.h * s;
    if (ox > this.bg.width || oy > this.bg.height || ox + w < 0 || oy + h < 0) return;
    const { base, parts } = pickShots(shotsOf(bg.assetId, bg.page), s);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    if (base) {
      touchShot(base);
      const p = base.picture;
      if (Math.abs(base.scale - s) < s * 0.001) ctx.drawImage(p, Math.round(ox), Math.round(oy));
      else ctx.drawImage(p, ox, oy, w, h);
    } else {
      ctx.fillStyle = PDF_WAITING;
      ctx.fillRect(ox, oy, w, h);
    }
    for (const part of parts) {
      touchShot(part);
      ctx.drawImage(part.picture, Math.round(ox + part.x * s), Math.round(oy + part.y * s));
    }
    if (bg.w < meta.w - 1 || bg.h < meta.h - 1) {
      const x = Math.round(ox) + 0.5;
      const y = Math.round(oy) + 0.5;
      ctx.strokeStyle = PDF_EDGE;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, Math.round(w) - 1, Math.round(h) - 1);
    }
    ctx.restore();
  }

  // the renders the pdf pages on screen and the ones next to them need:
  // a quick picture first, a sharp one for this zoom once it rests
  private wantPdf(from: number, to: number) {
    const pages = this.doc.notebook.pages;
    const list: Wanted[] = [];
    const s = this.cam.zoom * this.dpr;
    const settled = !this.pdfWait;
    const first = Math.max(0, from - 1);
    const last = Math.min(pages.length - 1, to);
    const middle = (from + to - 1) / 2;
    for (let i = first; i <= last; i++) {
      const bg = pages[i]?.pdf;
      if (!bg) continue;
      const near = i < from || i >= to;
      const d = Math.abs(i - middle);
      const file = bg.assetId;
      list.push({ file, page: bg.page, scale: previewScale(bg.w), priority: (near ? 20 : 0) + d });
      if (!settled) continue;
      const full = capScale(bg.w, bg.h, s);
      const shots = shotsOf(file, bg.page);
      if (!shots.some((shot) => shot.full && sharp(shot, full))) {
        list.push({ file, page: bg.page, scale: full, priority: (near ? 30 : 10) + d });
      }
      if (full < s * 0.95 && !near) {
        const part = this.pdfPart(i, bg, s);
        if (part) list.push({ file, page: bg.page, scale: s, part, priority: 5 + d });
      }
    }
    want('canvas', list);
  }

  // the part of a pdf page on screen, a little more, on a grid of device
  // pixels. a very big screen gets no more than what it shows
  private pdfPart(index: number, bg: PdfBackground, s: number): Part | null {
    const z = this.cam.zoom;
    const left = this.cam.x - this.pageX(index) - bg.x;
    const top = this.cam.y - this.pageY(index) - bg.y;
    const g = PART_GRID / s;
    for (const pad of [g, 0]) {
      const x0 = Math.max(0, Math.floor((left - pad) / g) * g);
      const y0 = Math.max(0, Math.floor((top - pad) / g) * g);
      const x1 = Math.min(bg.w, Math.ceil((left + this.width / z + pad) / g) * g);
      const y1 = Math.min(bg.h, Math.ceil((top + this.height / z + pad) / g) * g);
      if (x1 <= x0 || y1 <= y0) return null;
      if ((x1 - x0) * (y1 - y0) * s * s <= MAX_PIXELS) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    return null;
  }

  // the pictures of a page that are on screen, over its paper
  private drawImages(ctx: CanvasRenderingContext2D, index: number) {
    const page = this.doc.pageAt(index);
    const images = imagesOf(page);
    if (images.length === 0) return;
    const ox = this.pageX(index);
    const oy = this.pageY(index);
    const z = this.cam.zoom;
    const seen = {
      minX: this.cam.x - ox,
      minY: this.cam.y - oy,
      maxX: this.cam.x + this.width / z - ox,
      maxY: this.cam.y + this.height / z - oy
    };
    const dark = isDark(page.meta.paper);
    ctx.save();
    this.applyPage(ctx, index);
    for (const image of images) {
      if (this.hidden?.has(image) || !boxesTouch(itemBox(image), seen)) continue;
      drawImageItem(ctx, image, dark);
    }
    ctx.restore();
  }

  private drawLive() {
    this.liveDirty = false;
    const ctx = this.liveCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const old = this.liveBox;
    if (old) {
      const x = Math.floor(old.minX) - 2;
      const y = Math.floor(old.minY) - 2;
      ctx.clearRect(x, y, Math.ceil(old.maxX) + 2 - x, Math.ceil(old.maxY) + 2 - y);
    } else if (!this.liveClean) {
      ctx.clearRect(0, 0, this.live.width, this.live.height);
    }
    this.liveClean = true;
    this.liveBox = null;
    if (!this.tool?.drawLive) return;
    ctx.save();
    this.liveBox = this.tool.drawLive(ctx);
    ctx.restore();
    if (this.liveBox) this.liveClean = false;
  }

  // the mirrors outside only hear about real changes
  private report() {
    const page = this.currentPage;
    if (this.cam.zoom !== this.shownZoom || page !== this.shownPage) {
      const pageChanged = page !== this.shownPage;
      this.shownZoom = this.cam.zoom;
      this.shownPage = page;
      if (pageChanged) {
        this.updateBlend();
        this.warm = false;
      }
      this.hooks.state?.();
    }
    this.reportNear();
    if (!this.hooks.scroll) return;
    let start = 0;
    let size = 1;
    if (!this.isBoard) {
      const m = MARGIN / this.cam.zoom;
      const total = this.content.h + m * 2;
      size = Math.min(1, this.height / this.cam.zoom / total);
      start = size >= 1 ? 0 : (this.cam.y - (this.content.y - m)) / total;
    }
    if (start !== this.shownScroll || size !== this.shownSize) {
      this.shownScroll = start;
      this.shownSize = size;
      this.hooks.scroll(start, size);
    }
  }

  private reportNear() {
    if (!this.hooks.near || this.doc.pageCount === 0) return;
    let first = this.board;
    let last = this.board;
    if (!this.isBoard) {
      const [from, to] = visiblePages(this.rects, this.cam.y, this.cam.y + this.height / this.cam.zoom);
      first = from;
      last = to - 1;
    }
    first = Math.max(0, first - NEAR);
    last = Math.min(this.doc.pageCount - 1, last + NEAR);
    const key = `${first}:${last}`;
    if (key === this.shownNear) return;
    this.shownNear = key;
    this.hooks.near(first, last);
  }
}
