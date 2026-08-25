import { itemBox, moveBox } from './bounds';
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
import type { Doc, DocChange, PageData } from './doc';
import type { History } from './history';
import { penIsDown } from './input';
import { drawItem, drawPattern, drawSheet, HIGHLIGHTER_ALPHA, isDark, isMarker } from './render';
import { TileLayer, type TileCtx } from './tiles';
import type { Tool } from './tools/tool';
import type { Box, Item } from './types';
import { PAPER_COLORS } from '$lib/editor/paper';

const BG_DEEP = '#111113';
// how long the zoom has to rest before the tiles are rendered sharp again
const ZOOM_SETTLE = 150;
// time per frame for rendering missing tiles
const BUDGET = 6;
const BUDGET_PEN_DOWN = 3;

export interface ViewHooks {
  // the zoom or the page in the middle of the view changed
  state?: () => void;
  // the scroll position of a paper notebook, as shares of the whole. a
  // size of 1 means it all fits
  scroll?: (start: number, size: number) => void;
}

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
  private offDoc: () => void;
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

    this.hlLayer = new TileLayer((box, open) => this.paint(box, open, true));
    this.inkLayer = new TileLayer((box, open) => this.paint(box, open, false));
    this.offDoc = doc.on(this.onChange);

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
    if (this.zoomTimer) clearTimeout(this.zoomTimer);
    this.offDoc();
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
    this.cameras.clear();
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
      this.zoomedAt = performance.now();
      if (this.zoomTimer) clearTimeout(this.zoomTimer);
      this.zoomTimer = setTimeout(() => this.requestFrame(), ZOOM_SETTLE + 20);
    }
    this.cam = next;
    this.bgDirty = this.inkDirty = this.hlDirty = true;
    if (this.tool) this.liveDirty = true;
    this.requestFrame();
  }

  panBy(dx: number, dy: number) {
    const { x, y, zoom } = this.cam;
    this.setCamera({ x: x - dx / zoom, y: y - dy / zoom, zoom });
  }

  zoomAt(sx: number, sy: number, zoom: number) {
    this.fitted = false;
    this.setCamera(zoomAt(this.cam, sx, sy, zoom));
  }

  zoomStep(dir: 1 | -1) {
    this.zoomAt(this.width / 2, this.height / 2, stepZoom(this.cam.zoom, dir));
  }

  // paper fits the page width, a board goes back to 100 percent
  zoomReset() {
    if (this.isBoard) {
      this.zoomAt(this.width / 2, this.height / 2, 1);
      return;
    }
    const zoom = fitWidthZoom(this.content.w, this.width);
    const mid = this.cam.y + this.height / 2 / this.cam.zoom;
    this.fitted = true;
    this.setCamera({ x: this.cam.x, y: mid - this.height / 2 / zoom, zoom });
  }

  // where a notebook starts: the top of the first page, or the middle of the board
  private home() {
    if (this.isBoard) {
      this.setCamera({ x: -this.width / 2, y: -this.height / 2, zoom: 1 });
      return;
    }
    const zoom = fitWidthZoom(this.content.w, this.width);
    this.fitted = true;
    this.setCamera({ x: 0, y: this.content.y - MARGIN / zoom, zoom });
  }

  goToPage(index: number) {
    if (index < 0 || index >= this.doc.pageCount) return;
    if (this.isBoard) {
      if (index === this.board) return;
      const id = this.doc.notebook.pages[this.board]?.id;
      if (id) this.cameras.set(id, { ...this.cam });
      this.board = index;
      this.boardId = this.doc.notebook.pages[index].id;
      this.redrawAll();
      const saved = this.cameras.get(this.boardId);
      this.setCamera(saved ?? { x: -this.width / 2, y: -this.height / 2, zoom: 1 });
      this.hooks.state?.();
      return;
    }
    const r = this.rects[index];
    this.setCamera({ x: this.cam.x, y: r.y - MARGIN / this.cam.zoom, zoom: this.cam.zoom });
  }

  // fraction 0..1 of the whole scroll range, for the scroll indicator
  scrollTo(fraction: number) {
    if (this.isBoard) return;
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
    this.dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.width * this.dpr));
    const h = Math.max(1, Math.round(this.height * this.dpr));
    for (const canvas of [this.bg, this.hl, this.ink, this.live]) {
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
    // a canvas that changed size starts out empty
    this.liveBox = null;
    this.liveClean = true;
    this.bgDirty = this.inkDirty = this.hlDirty = this.liveDirty = true;
    if (this.fitted && !this.isBoard) this.zoomReset();
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

  // on dark paper the highlighter is laid on normally, multiply would hide it
  private updateBlend() {
    const index = this.currentPage;
    const page = index >= 0 && index < this.doc.pageCount ? this.doc.notebook.pages[index] : null;
    this.hl.style.mixBlendMode = page && isDark(page.paper) ? 'normal' : 'multiply';
  }

  private paint(box: Box, open: () => TileCtx, marker: boolean) {
    if (this.isBoard) {
      if (this.doc.pageCount > 0) this.paintPage(this.doc.pageAt(this.board), box, open, marker, null);
      return;
    }
    for (const i of this.pagesIn(box)) this.paintPage(this.doc.pageAt(i), box, open, marker, this.rects[i]);
  }

  private paintPage(page: PageData, box: Box, open: () => TileCtx, marker: boolean, rect: Rect | null) {
    const ox = rect ? rect.x : 0;
    const oy = rect ? rect.y : 0;
    const hits = page.tree.search({ minX: box.minX - ox, minY: box.minY - oy, maxX: box.maxX - ox, maxY: box.maxY - oy });
    if (hits.length === 0) return;
    this.doc.ensureOrder(page);
    hits.sort((a, b) => a.z - b.z);
    const dark = isDark(page.meta.paper);
    let ctx: TileCtx | null = null;
    for (const hit of hits) {
      if (isMarker(hit.item) !== marker) continue;
      if (!ctx) {
        ctx = open();
        ctx.save();
        if (rect) {
          ctx.beginPath();
          ctx.rect(rect.x, rect.y, rect.w, rect.h);
          ctx.clip();
        }
        ctx.translate(ox, oy);
      }
      drawItem(ctx, hit.item, dark);
    }
    if (ctx) ctx.restore();
  }

  private onChange = (change: DocChange) => {
    if (change.type === 'items') {
      const index = this.doc.indexOf(change.pageId);
      if (index < 0 || (this.isBoard && index !== this.board)) return;
      const ox = this.pageX(index);
      const oy = this.pageY(index);
      const rect = this.isBoard ? null : this.rects[index];
      let marks = false;
      let ink = false;
      const sort = (item: Item) => {
        if (isMarker(item)) marks = true;
        else ink = true;
      };
      change.added.forEach(sort);
      change.removed.forEach(sort);

      if (change.append) {
        const dark = isDark(this.doc.pageAt(index).meta.paper);
        for (const item of change.added) {
          const layer = isMarker(item) ? this.hlLayer : this.inkLayer;
          layer.drawInto(moveBox(itemBox(item), ox, oy), (ctx) => {
            if (rect) {
              ctx.beginPath();
              ctx.rect(rect.x, rect.y, rect.w, rect.h);
              ctx.clip();
            }
            ctx.translate(ox, oy);
            drawItem(ctx, item, dark);
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
    } else if (change.type === 'pages') {
      this.relayout();
      this.redrawAll();
      this.setCamera(this.cam);
      this.shownPage = -1;
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
    const tool = this.tool;
    tool?.frame?.();
    if (this.sizeDirty) this.applySize();

    // a zoom keeps showing the old tiles stretched until it rests, or
    // right away when it went so far out that they would be too many
    const target = this.cam.zoom * this.dpr;
    for (const layer of [this.inkLayer, this.hlLayer]) {
      if (layer.scale === 0 || layer.scale === target) continue;
      if (start - this.zoomedAt >= ZOOM_SETTLE || target / layer.scale < 0.5) {
        layer.setScale(target);
        this.inkDirty = this.hlDirty = true;
      }
    }

    if (this.bgDirty) {
      this.drawBackground();
      this.bgDirty = false;
    }

    const deadline = this.full ? Infinity : start + (penIsDown() ? BUDGET_PEN_DOWN : BUDGET);
    const prefetch = !penIsDown();
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
      return;
    }
    ctx.fillStyle = BG_DEEP;
    ctx.fillRect(0, 0, w, h);
    const [from, to] = visiblePages(this.rects, this.cam.y, this.cam.y + this.height / this.cam.zoom);
    for (let i = from; i < to; i++) {
      const r = this.rects[i];
      const paper = this.doc.notebook.pages[i].paper;
      drawSheet(ctx, paper, (r.x - this.cam.x) * s, (r.y - this.cam.y) * s, r.w * s, r.h * s, s, w, h);
    }
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
      if (pageChanged) this.updateBlend();
      this.hooks.state?.();
    }
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
}
