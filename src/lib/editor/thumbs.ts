import { loadPage, openDoc } from './canvas';
import { emptyBox, growBox, isEmpty, itemBox } from '$lib/engine/bounds';
import { imagesOf, type Doc, type DocChange, type PageData } from '$lib/engine/doc';
import { onBitmap } from '$lib/engine/images';
import { penIsDown } from '$lib/engine/input';
import { pageJob, type Frame } from '$lib/engine/render';
import { onShot, previewScale, shotsOf, want, type Wanted } from '$lib/pdf/pdf';

// css pixels, the panel never shows a thumbnail wider than this
export const THUMB_WIDTH = 150;
// a page that changed gets its new thumbnail this long after the last change
const REFRESH = 600;
const PEN_WAIT = 250;
// items drawn between two looks at the clock
const STEP = 100;
// ms of drawing per idle turn, even when the browser offers more
const BUDGET = 8;

interface Thumb {
  id: string;
  canvas: HTMLCanvasElement;
  visible: boolean;
  stale: boolean;
  job: { step: (count: number) => boolean } | null;
  buffer: OffscreenCanvas | null;
}

// all of the ink of a board, never closer than the board frame itself
function boardFrame(page: { meta: PageData['meta']; items: PageData['items'] }): Frame {
  const { w, h } = page.meta;
  const box = emptyBox();
  for (const item of page.items) growBox(box, itemBox(item));
  if (isEmpty(box)) return { x: -w / 2, y: -h / 2, w, h };
  const bw = (box.maxX - box.minX) * 1.1;
  const bh = (box.maxY - box.minY) * 1.1;
  const fw = Math.max(w, bw, (bh * w) / h);
  const fh = (fw * h) / w;
  return { x: (box.minX + box.maxX - fw) / 2, y: (box.minY + box.maxY - fh) / 2, w: fw, h: fh };
}

// drawn in sight and a moment after a change, never while the pen is down
export class Thumbs {
  private doc: Doc | null = openDoc();
  private byId = new Map<string, Thumb>();
  private byCanvas = new Map<Element, Thumb>();
  private observer: IntersectionObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancelIdle: (() => void) | null = null;
  private sink: OffscreenCanvasRenderingContext2D | null = null;
  private off: () => void;
  private offBitmap: () => void;
  private offShot: () => void;

  constructor() {
    this.off = this.doc?.on(this.onChange) ?? (() => {});
    this.offBitmap = onBitmap(this.onBitmap);
    this.offShot = onShot(this.onShot);
  }

  // root is the list that scrolls, thumbnails just past its edges are drawn too
  add(canvas: HTMLCanvasElement, id: string, root: Element | null) {
    if (!this.observer) {
      this.observer = new IntersectionObserver(this.onIntersect, { root, rootMargin: '200px 0px' });
    }
    const thumb: Thumb = { id, canvas, visible: false, stale: true, job: null, buffer: null };
    this.byId.set(id, thumb);
    this.byCanvas.set(canvas, thumb);
    this.observer.observe(canvas);
  }

  remove(canvas: HTMLCanvasElement) {
    const thumb = this.byCanvas.get(canvas);
    if (!thumb) return;
    this.observer?.unobserve(canvas);
    this.byCanvas.delete(canvas);
    if (this.byId.get(thumb.id) === thumb) this.byId.delete(thumb.id);
  }

  destroy() {
    this.off();
    this.offBitmap();
    this.offShot();
    want('thumbs', []);
    this.observer?.disconnect();
    if (this.timer) clearTimeout(this.timer);
    this.cancelIdle?.();
    this.byId.clear();
    this.byCanvas.clear();
  }

  private onIntersect = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const thumb = this.byCanvas.get(entry.target);
      if (thumb) thumb.visible = entry.isIntersecting;
    }
    this.wantPdf();
    this.schedule(0);
  };

  // the pdf pages of the thumbnails in sight, after what the canvas needs
  private wantPdf() {
    const list: Wanted[] = [];
    for (const thumb of this.byId.values()) {
      const bg = thumb.visible ? this.doc?.page(thumb.id)?.meta.pdf : undefined;
      if (!bg || shotsOf(bg.assetId, bg.page).length > 0) continue;
      list.push({ file: bg.assetId, page: bg.page, scale: previewScale(bg.w), priority: 100 + list.length });
    }
    want('thumbs', list);
  }

  private onShot = (file: string, page: number) => {
    let any = false;
    for (const thumb of this.byId.values()) {
      const bg = this.doc?.page(thumb.id)?.meta.pdf;
      if (!bg || bg.assetId !== file || bg.page !== page) continue;
      thumb.stale = true;
      thumb.job = null;
      any = true;
    }
    if (any) this.schedule(0);
  };

  private onChange = (change: DocChange) => {
    if (change.type !== 'items' && change.type !== 'paper' && change.type !== 'loaded') return;
    const thumb = this.byId.get(change.pageId);
    if (!thumb) return;
    thumb.stale = true;
    thumb.job = null;
    // ink that just arrived from storage shows at once, an edit waits a moment
    this.schedule(change.type === 'loaded' ? 0 : REFRESH);
  };

  private onBitmap = (assetId: string) => {
    let any = false;
    for (const thumb of this.byId.values()) {
      const page = this.doc?.page(thumb.id);
      if (!page || !imagesOf(page).some((image) => image.assetId === assetId)) continue;
      thumb.stale = true;
      thumb.job = null;
      any = true;
    }
    if (any) this.schedule(0);
  };

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.whenIdle();
    }, delay);
  }

  private whenIdle() {
    if (this.cancelIdle) return;
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(this.work, { timeout: 500 });
      this.cancelIdle = () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(() => this.work({ didTimeout: false, timeRemaining: () => 8 }), 16);
      this.cancelIdle = () => clearTimeout(id);
    }
  }

  private work = (deadline: IdleDeadline) => {
    this.cancelIdle = null;
    if (penIsDown()) {
      this.schedule(PEN_WAIT);
      return;
    }
    const end = performance.now() + BUDGET;
    const busy = () => performance.now() >= end || deadline.timeRemaining() < 2;
    for (const thumb of this.byId.values()) {
      if (!thumb.visible || (!thumb.stale && !thumb.job)) continue;
      if (!thumb.job) this.start(thumb);
      const job = thumb.job;
      if (!job) continue;
      let done = false;
      do {
        done = job.step(STEP);
        this.flush(thumb.buffer);
      } while (!done && !busy());
      if (!done) {
        this.whenIdle();
        return;
      }
      thumb.job = null;
      this.show(thumb);
      if (busy()) {
        this.whenIdle();
        return;
      }
    }
  };

  // a canvas paints what it recorded later and all at once. drawing it
  // small somewhere makes it paint now, so the clock sees the real cost
  private flush(buffer: OffscreenCanvas | null) {
    if (!buffer) return;
    if (!this.sink) this.sink = new OffscreenCanvas(1, 1).getContext('2d');
    this.sink?.clearRect(0, 0, 1, 1);
    this.sink?.drawImage(buffer, 0, 0, 1, 1);
  }

  private start(thumb: Thumb) {
    thumb.stale = false;
    const page = this.doc?.page(thumb.id);
    if (!page) return;
    // the paper shows now, the ink once the page is read from storage
    if (!page.ready) void loadPage(thumb.id);
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(THUMB_WIDTH * dpr);
    const height = Math.round((width * page.meta.h) / page.meta.w);
    const buffer = new OffscreenCanvas(width, height);
    const ctx = buffer.getContext('2d');
    if (!ctx) return;
    // new ink is pushed onto the same list, the job keeps the list as it is now
    const snapshot = { meta: page.meta, items: page.items.slice() };
    if (this.doc?.kind === 'board') {
      const frame = boardFrame(snapshot);
      thumb.job = pageJob(ctx, snapshot, width / frame.w, frame);
    } else {
      thumb.job = pageJob(ctx, snapshot, width / page.meta.w);
    }
    thumb.buffer = buffer;
  }

  private show(thumb: Thumb) {
    const buffer = thumb.buffer;
    thumb.buffer = null;
    if (!buffer) return;
    const canvas = thumb.canvas;
    if (canvas.width !== buffer.width) canvas.width = buffer.width;
    if (canvas.height !== buffer.height) canvas.height = buffer.height;
    canvas.getContext('2d')?.drawImage(buffer, 0, 0);
  }
}
