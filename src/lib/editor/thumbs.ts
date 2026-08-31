import { loadPage, openDoc } from './canvas';
import { emptyBox, growBox, isEmpty, itemBox } from '$lib/engine/bounds';
import type { Doc, DocChange, PageData } from '$lib/engine/doc';
import { penIsDown } from '$lib/engine/input';
import { renderPage, type Frame } from '$lib/engine/render';

// css pixels, the panel never shows a thumbnail wider than this
export const THUMB_WIDTH = 150;
// a page that changed gets its new thumbnail this long after the last change
const REFRESH = 600;
const PEN_WAIT = 250;

interface Thumb {
  id: string;
  canvas: HTMLCanvasElement;
  visible: boolean;
  stale: boolean;
}

// the part of a board a thumbnail shows: all of its ink, never closer
// than the board frame itself
function boardFrame(page: PageData): Frame {
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

// the thumbnails of the pages panel. each one is drawn with the page
// renderer once it scrolls into sight, and again a moment after its page
// changed. never while the pen is down, the pen comes first
export class Thumbs {
  private doc: Doc | null = openDoc();
  private byId = new Map<string, Thumb>();
  private byCanvas = new Map<Element, Thumb>();
  private observer: IntersectionObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancelIdle: (() => void) | null = null;
  private off: () => void;

  constructor() {
    this.off = this.doc?.on(this.onChange) ?? (() => {});
  }

  // root is the list that scrolls, thumbnails just past its edges are drawn too
  add(canvas: HTMLCanvasElement, id: string, root: Element | null) {
    if (!this.observer) {
      this.observer = new IntersectionObserver(this.onIntersect, { root, rootMargin: '200px 0px' });
    }
    const thumb: Thumb = { id, canvas, visible: false, stale: true };
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
    this.schedule(0);
  };

  private onChange = (change: DocChange) => {
    if (change.type !== 'items' && change.type !== 'paper' && change.type !== 'loaded') return;
    const thumb = this.byId.get(change.pageId);
    if (!thumb) return;
    thumb.stale = true;
    // ink that just arrived from storage shows at once, an edit waits a moment
    this.schedule(change.type === 'loaded' ? 0 : REFRESH);
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
    let drawn = 0;
    for (const thumb of this.byId.values()) {
      if (!thumb.visible || !thumb.stale) continue;
      // at least one per turn, more while the browser has time to spare
      if (drawn > 0 && deadline.timeRemaining() < 4) {
        this.whenIdle();
        return;
      }
      this.draw(thumb);
      drawn++;
    }
  };

  private draw(thumb: Thumb) {
    thumb.stale = false;
    const page = this.doc?.page(thumb.id);
    if (!page) return;
    // the paper shows now, the ink once the page is read from storage
    if (!page.ready) void loadPage(thumb.id);
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(THUMB_WIDTH * dpr);
    const height = Math.round((width * page.meta.h) / page.meta.w);
    const canvas = thumb.canvas;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (this.doc?.kind === 'board') {
      const frame = boardFrame(page);
      renderPage(ctx, page, width / frame.w, frame);
    } else {
      renderPage(ctx, page, width / page.meta.w);
    }
  }
}
