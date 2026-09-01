import { PAPER_COLORS } from '$lib/editor/paper';
import { shapePath } from './shapes';
import { PENS, strokeLine, strokePath, THIN } from './stroke';
import { fontOf, LINE_HEIGHT, textLayout } from './text';
import type { Item, PageMeta, Paper } from './types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// the highlighter layer is laid over the paper with this opacity, so
// overlapping marks never get darker
export const HIGHLIGHTER_ALPHA = 0.5;

const PAGE_BORDER = '#2e2e33';

export function isDark(paper: Paper): boolean {
  return paper.color === 'dark';
}

export function isMarker(item: Item): boolean {
  return item.type === 'stroke' && item.pen === 'highlighter';
}

function luminance(color: string): number {
  let hex = color.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex.slice(0, 6), 16);
  if (Number.isNaN(n)) return 0.5;
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

const shownColors = new Map<string, string>();

// black ink turns light on dark paper and white ink turns dark on light
// paper, so the default pens always show
export function inkColor(color: string, dark: boolean): string {
  const key = dark ? 'd' + color : color;
  let shown = shownColors.get(key);
  if (shown) return shown;
  const l = luminance(color);
  if (dark && l < 0.03) shown = '#ececec';
  else if (!dark && l > 0.9) shown = '#1f1f22';
  else shown = color;
  shownColors.set(key, shown);
  return shown;
}

// scale is device pixels per unit, it picks the plain line for strokes
// that are too thin on screen for their outline to matter
export function drawItem(ctx: Ctx, item: Item, dark: boolean, scale: number) {
  if (item.type === 'shape') {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = inkColor(item.color, dark);
    ctx.lineWidth = item.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(shapePath(item));
    return;
  }
  if (item.type === 'text') {
    const layout = textLayout(item);
    const step = item.size * LINE_HEIGHT;
    ctx.globalAlpha = 1;
    ctx.fillStyle = inkColor(item.color, dark);
    ctx.font = fontOf(item.size);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    for (let i = 0; i < layout.lines.length; i++) {
      ctx.fillText(layout.lines[i], item.x, item.y + layout.baseline + i * step);
    }
    return;
  }
  // images sit on the paper layer, see drawImageItem
  if (item.type !== 'stroke') return;
  ctx.globalAlpha = PENS[item.pen].alpha;
  const color = inkColor(item.color, dark);
  if (item.size * scale < THIN) {
    ctx.strokeStyle = color;
    ctx.lineWidth = item.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(strokeLine(item));
    return;
  }
  ctx.fillStyle = color;
  ctx.fill(strokePath(item));
}

const dotPatterns = new WeakMap<Ctx, Map<string, CanvasPattern>>();

// one dot in the middle of a tile about one step wide
function dotPattern(ctx: Ctx, color: string, step: number, dot: number): CanvasPattern | null {
  const size = Math.max(4, Math.min(512, Math.round(step)));
  const r = (dot / 2) * (size / step);
  const key = `${color}|${size}|${r.toFixed(2)}`;
  let cache = dotPatterns.get(ctx);
  if (!cache) {
    cache = new Map();
    dotPatterns.set(ctx, cache);
  }
  const cached = cache.get(key);
  if (cached) return cached;
  const tile = new OffscreenCanvas(size, size);
  const tctx = tile.getContext('2d')!;
  tctx.fillStyle = color;
  tctx.beginPath();
  tctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  tctx.fill();
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return null;
  // a pinch zoom makes a new one every frame, only a few are worth keeping
  if (cache.size > 8) cache.clear();
  cache.set(key, pattern);
  return pattern;
}

// the pattern of the paper in device pixels. the page origin sits at
// (ox, oy), s is device pixels per unit and x0..y1 is the part to cover.
// a page starts its pattern one step in, a board has it everywhere
export function drawPattern(
  ctx: Ctx,
  paper: Paper,
  ox: number,
  oy: number,
  s: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  everywhere = false
) {
  const step = paper.spacing * s;
  // closer than this it is only noise
  if (paper.style === 'blank' || step < 6) return;
  const first = everywhere ? -Infinity : 1;
  const ky0 = Math.max(first, Math.ceil((y0 - oy) / step));
  const kx0 = Math.max(first, Math.ceil((x0 - ox) / step));
  ctx.strokeStyle = PAPER_COLORS[paper.color].rule;
  ctx.globalAlpha = 1;
  ctx.beginPath();

  if (paper.style === 'dots') {
    // thousands of dots as paths are slow to rasterize, one pattern fill is not
    const pattern = dotPattern(ctx, PAPER_COLORS[paper.color].rule, step, Math.max(1.5, s * 1.4));
    if (!pattern) return;
    // the pattern tile is a whole number of pixels, the transform stretches it
    // to the exact step so the dots never drift away from the ink
    const k = step / Math.max(4, Math.min(512, Math.round(step)));
    pattern.setTransform(new DOMMatrix([k, 0, 0, k, ox - step / 2, oy - step / 2]));
    ctx.fillStyle = pattern;
    const left = Math.max(x0, ox + (kx0 - 0.5) * step);
    const top = Math.max(y0, oy + (ky0 - 0.5) * step);
    ctx.fillRect(left, top, x1 - left, y1 - top);
    return;
  }

  const lw = Math.max(1, Math.round(s * 0.5));
  const half = lw % 2 === 1 ? 0.5 : 0;
  ctx.lineWidth = lw;
  for (let k = ky0; oy + k * step < y1; k++) {
    const y = Math.round(oy + k * step) + half;
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  if (paper.style === 'grid') {
    for (let k = kx0; ox + k * step < x1; k++) {
      const x = Math.round(ox + k * step) + half;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
  }
  ctx.stroke();
}

// a paper page on the background canvas: x, y, w, h is the page in device
// pixels, the view rect is what is on screen
export function drawSheet(
  ctx: Ctx,
  paper: Paper,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  viewW: number,
  viewH: number
) {
  const left = Math.round(x);
  const top = Math.round(y);
  const right = Math.round(x + w);
  const bottom = Math.round(y + h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAGE_BORDER;
  ctx.fillRect(left - 1, top - 1, right - left + 2, bottom - top + 2);
  ctx.fillStyle = PAPER_COLORS[paper.color].paper;
  ctx.fillRect(left, top, right - left, bottom - top);
  drawPattern(
    ctx,
    paper,
    x,
    y,
    s,
    Math.max(left, 0),
    Math.max(top, 0),
    Math.min(right, viewW),
    Math.min(bottom, viewH)
  );
}

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

// a whole page drawn a few items at a time: step(count) draws up to count
// more and says when the page is done. the page sits at the top left of
// the canvas at scale device pixels per unit. a board has no edges, frame
// is the part of it to draw. nothing else may draw on ctx in between
export function pageJob(ctx: Ctx, page: { meta: PageMeta; items: Item[] }, scale: number, frame?: Frame) {
  const paper = page.meta.paper;
  const part = frame ?? { x: 0, y: 0, w: page.meta.w, h: page.meta.h };
  const dark = isDark(paper);
  const width = Math.ceil(part.w * scale);
  const height = Math.ceil(part.h * scale);
  const ox = -part.x * scale;
  const oy = -part.y * scale;
  const marks = page.items.filter(isMarker);
  const ink = page.items.filter((item) => !isMarker(item));
  const layer = marks.length > 0 ? new OffscreenCanvas(width, height).getContext('2d') : null;
  let started = false;
  let i = 0;
  let j = 0;

  return {
    step(count: number): boolean {
      if (!started) {
        started = true;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = PAPER_COLORS[paper.color].paper;
        ctx.fillRect(0, 0, width, height);
        drawPattern(ctx, paper, ox, oy, scale, 0, 0, width, height, frame !== undefined);
        ctx.restore();
      }
      // the highlighter goes on its own layer first, then under the ink
      if (layer && i < marks.length) {
        layer.setTransform(scale, 0, 0, scale, ox, oy);
        const end = Math.min(marks.length, i + count);
        count -= end - i;
        for (; i < end; i++) drawItem(layer, marks[i], dark, scale);
        if (i < marks.length) return false;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = HIGHLIGHTER_ALPHA;
        ctx.globalCompositeOperation = dark ? 'source-over' : 'multiply';
        ctx.drawImage(layer.canvas, 0, 0);
        ctx.restore();
      }
      if (count <= 0 && j < ink.length) return false;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.clip();
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      const end = Math.min(ink.length, j + count);
      for (; j < end; j++) drawItem(ctx, ink[j], dark, scale);
      ctx.restore();
      return j >= ink.length;
    }
  };
}

// a whole page with its ink in one go, for the png export
export function renderPage(ctx: Ctx, page: { meta: PageMeta; items: Item[] }, scale: number, frame?: Frame) {
  pageJob(ctx, page, scale, frame).step(Infinity);
}
