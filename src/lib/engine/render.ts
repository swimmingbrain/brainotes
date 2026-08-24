import { PAPER_COLORS } from '$lib/editor/paper';
import { PENS, strokePath } from './stroke';
import type { Item, PageMeta, Paper } from './types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// the highlighter layer is laid over the paper with this opacity, so
// overlapping marks never get darker
export const HIGHLIGHTER_ALPHA = 0.4;

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

export function drawItem(ctx: Ctx, item: Item, dark: boolean) {
  // shapes, text and images get drawn once their tools exist
  if (item.type !== 'stroke') return;
  ctx.globalAlpha = PENS[item.pen].alpha;
  ctx.fillStyle = inkColor(item.color, dark);
  ctx.fill(strokePath(item));
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
    // one dashed line per row: a dash of almost nothing with round caps is a dot
    const dot = Math.max(1.5, s * 1.4);
    ctx.lineWidth = dot;
    ctx.lineCap = 'round';
    ctx.setLineDash([0.001, step - 0.001]);
    const sx = ox + kx0 * step;
    for (let k = ky0; oy + k * step < y1; k++) {
      const y = oy + k * step;
      ctx.moveTo(sx, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
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

// a whole page with its ink, drawn at the top left of the canvas at scale
// device pixels per unit. thumbnails and the png export use it
export function renderPage(ctx: Ctx, page: { meta: PageMeta; items: Item[] }, scale: number) {
  const { w, h, paper } = page.meta;
  const dark = isDark(paper);
  const width = Math.ceil(w * scale);
  const height = Math.ceil(h * scale);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAPER_COLORS[paper.color].paper;
  ctx.fillRect(0, 0, width, height);
  drawPattern(ctx, paper, 0, 0, scale, 0, 0, width, height);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  const marks = page.items.filter(isMarker);
  if (marks.length > 0) {
    const layer = new OffscreenCanvas(width, height);
    const lctx = layer.getContext('2d')!;
    lctx.setTransform(scale, 0, 0, scale, 0, 0);
    for (const item of marks) drawItem(lctx, item, dark);
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.globalCompositeOperation = dark ? 'source-over' : 'multiply';
    ctx.drawImage(layer, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  for (const item of page.items) {
    if (!isMarker(item)) drawItem(ctx, item, dark);
  }
  ctx.restore();
}
