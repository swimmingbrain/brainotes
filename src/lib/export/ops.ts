import { emptyBox, growBox, isEmpty, itemBox } from '$lib/engine/bounds';
import type { Frame } from '$lib/engine/render';
import { shapeLines } from '$lib/engine/shapes';
import { outlineOf, PF_SCALE, scaledPoints } from '$lib/engine/stroke';
import type { Item, PageMeta, Paper, Shape, Stroke } from '$lib/engine/types';
import { PAPER_COLORS } from '$lib/editor/paper';

// pdf drawing commands in page units, the page sets up y going down once

export const BOARD_MARGIN = 32;
// pdf viewers do not take pages longer than this many points
export const MAX_SIDE = 14400;
const KAPPA = 0.5522847498;
const DOT = 1.4;
const RULE = 0.5;

export function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? '0' : String(r);
}

function channel(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

export function parseColor(color: string): [number, number, number, number] {
  const c = color.trim();
  const fn = c.match(/^rgba?\(([^)]*)\)$/);
  if (fn) {
    const [r, g, b, a] = fn[1].split(',').map((p) => parseFloat(p));
    return [r || 0, g || 0, b || 0, a === undefined || Number.isNaN(a) ? 1 : a];
  }
  let hex = c.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0, 1];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

export function blendOver(top: string, under: string): [number, number, number] {
  const [r, g, b, a] = parseColor(top);
  const [ur, ug, ub] = parseColor(under);
  return [r * a + ur * (1 - a), g * a + ug * (1 - a), b * a + ub * (1 - a)];
}

function rgb(c: [number, number, number] | [number, number, number, number]): string {
  return `${channel(c[0] / 255)} ${channel(c[1] / 255)} ${channel(c[2] / 255)}`;
}

export function fillColor(color: string): string {
  return `${rgb(parseColor(color))} rg`;
}

export function strokeColor(color: string): string {
  return `${rgb(parseColor(color))} RG`;
}

export function matrix(m: number[]): string {
  return m.map((v) => (Math.abs(v) < 1e-9 ? '0' : String(Math.round(v * 10000) / 10000))).join(' ') + ' cm';
}

// the same curve traceOutline gives the canvas, a pdf only has cubic curves
export function outlinePath(outline: number[][]): string {
  const n = outline.length;
  if (n < 3) return '';
  const k = 1 / PF_SCALE;
  const parts: string[] = [];
  let px = ((outline[n - 1][0] + outline[0][0]) / 2) * k;
  let py = ((outline[n - 1][1] + outline[0][1]) / 2) * k;
  parts.push(`${num(px)} ${num(py)} m`);
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[i + 1 === n ? 0 : i + 1];
    const qx = a[0] * k;
    const qy = a[1] * k;
    const ex = ((a[0] + b[0]) / 2) * k;
    const ey = ((a[1] + b[1]) / 2) * k;
    const c1x = px + ((qx - px) * 2) / 3;
    const c1y = py + ((qy - py) * 2) / 3;
    const c2x = ex + ((qx - ex) * 2) / 3;
    const c2y = ey + ((qy - ey) * 2) / 3;
    parts.push(`${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(ex)} ${num(ey)} c`);
    px = ex;
    py = ey;
  }
  parts.push('h');
  return parts.join('\n');
}

export function strokePathOps(stroke: Stroke): string {
  return outlinePath(outlineOf(scaledPoints(stroke.pts), stroke.pen, stroke.size));
}

function polyline(pts: number[]): string {
  const parts = [`${num(pts[0])} ${num(pts[1])} m`];
  for (let i = 2; i < pts.length; i += 2) parts.push(`${num(pts[i])} ${num(pts[i + 1])} l`);
  return parts.join(' ');
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    `${num(cx + rx)} ${num(cy)} m`,
    `${num(cx + rx)} ${num(cy + ky)} ${num(cx + kx)} ${num(cy + ry)} ${num(cx)} ${num(cy + ry)} c`,
    `${num(cx - kx)} ${num(cy + ry)} ${num(cx - rx)} ${num(cy + ky)} ${num(cx - rx)} ${num(cy)} c`,
    `${num(cx - rx)} ${num(cy - ky)} ${num(cx - kx)} ${num(cy - ry)} ${num(cx)} ${num(cy - ry)} c`,
    `${num(cx + kx)} ${num(cy - ry)} ${num(cx + rx)} ${num(cy - ky)} ${num(cx + rx)} ${num(cy)} c`,
    'h'
  ].join('\n');
}

export function shapePathOps(shape: Shape): string {
  const { x1, y1, x2, y2 } = shape;
  if (shape.kind === 'rect') {
    return `${num(Math.min(x1, x2))} ${num(Math.min(y1, y2))} ${num(Math.abs(x2 - x1))} ${num(Math.abs(y2 - y1))} re`;
  }
  if (shape.kind === 'ellipse') {
    const rx = Math.max(Math.abs(x2 - x1) / 2, 0.01);
    const ry = Math.max(Math.abs(y2 - y1) / 2, 0.01);
    return ellipsePath((x1 + x2) / 2, (y1 + y2) / 2, rx, ry);
  }
  // a tap still leaves a dot
  if (x1 === x2 && y1 === y2) return polyline([x1, y1, x2 + 0.01, y2]);
  return shapeLines(shape)
    .map((line) => polyline(line))
    .join('\n');
}

export function shapeOps(shape: Shape, color: string): string {
  return `${strokeColor(color)} ${num(shape.size)} w 1 J 1 j\n${shapePathOps(shape)}\nS`;
}

// a page starts its pattern one step in, a board has it everywhere
export function patternOps(paper: Paper, frame: Frame, everywhere: boolean): string {
  const step = paper.spacing;
  if ((paper.style !== 'lines' && paper.style !== 'grid') || !(step > 0)) return '';
  const colors = PAPER_COLORS[paper.color];
  const x0 = frame.x;
  const y0 = frame.y;
  const x1 = frame.x + frame.w;
  const y1 = frame.y + frame.h;
  const first = (v: number) => Math.max(everywhere ? -Infinity : 1, Math.ceil(v / step));
  const parts: string[] = [`${rgb(blendOver(colors.rule, colors.paper))} RG ${num(RULE)} w 0 J`];
  for (let j = first(y0); j * step < y1; j++) parts.push(`${num(x0)} ${num(j * step)} m ${num(x1)} ${num(j * step)} l`);
  if (paper.style === 'grid') {
    for (let i = first(x0); i * step < x1; i++) parts.push(`${num(i * step)} ${num(y0)} m ${num(i * step)} ${num(y1)} l`);
  }
  if (parts.length === 1) return '';
  parts.push('S');
  return parts.join('\n');
}

// a pattern lives in the space of the page, so the dot tile gets its matrix
export function dotsOf(
  paper: Paper,
  frame: Frame,
  everywhere: boolean,
  page: number[]
): { tile: string; step: number; matrix: number[]; area: string } | null {
  const step = paper.spacing;
  if (paper.style !== 'dots' || !(step > 0)) return null;
  const colors = PAPER_COLORS[paper.color];
  const half = step / 2;
  const tile = `${rgb(blendOver(colors.rule, colors.paper))} rg\n${ellipsePath(half, half, DOT / 2, DOT / 2)}\nf`;
  const [a, b, c, d, e, f] = page;
  const matrix = [a, b, c, d, e - a * half - c * half, f - b * half - d * half];
  const x0 = everywhere ? frame.x : frame.x + half;
  const y0 = everywhere ? frame.y : frame.y + half;
  const area = `${num(x0)} ${num(y0)} ${num(frame.x + frame.w - x0)} ${num(frame.y + frame.h - y0)} re`;
  return { tile, step, matrix, area };
}

// lays the part of a pdf page a viewer shows (crop, turned by rotate) onto rect
export function pdfMatrix(
  crop: { x: number; y: number; w: number; h: number },
  rotate: number,
  rect: { x: number; y: number; w: number; h: number }
): number[] {
  const r = ((Math.round(rotate / 90) * 90) % 360 + 360) % 360;
  const turned = r === 90 || r === 270;
  const shownW = turned ? crop.h : crop.w;
  const shownH = turned ? crop.w : crop.h;
  let m = [1, 0, 0, -1, 0, crop.h];
  if (r === 90) m = [0, 1, 1, 0, 0, 0];
  else if (r === 180) m = [-1, 0, 0, 1, crop.w, 0];
  else if (r === 270) m = [0, -1, -1, 0, crop.h, crop.w];
  const sx = rect.w / shownW;
  const sy = rect.h / shownH;
  const a = m[0] * sx;
  const b = m[1] * sy;
  const c = m[2] * sx;
  const d = m[3] * sy;
  return [a, b, c, d, m[4] * sx + rect.x - (a * crop.x + c * crop.y), m[5] * sy + rect.y - (b * crop.x + d * crop.y)];
}

// the box of an annotation look, turned by its own matrix, stretched onto its rect
export function annotMatrix(rect: number[], bbox: number[], m: number[]): number[] | null {
  const [a, b, c, d, e, f] = m;
  const corners = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[0], bbox[3]],
    [bbox[2], bbox[3]]
  ];
  const xs = corners.map(([x, y]) => a * x + c * y + e);
  const ys = corners.map(([x, y]) => b * x + d * y + f);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  if (w <= 0 || h <= 0) return null;
  const sx = Math.abs(rect[2] - rect[0]) / w;
  const sy = Math.abs(rect[3] - rect[1]) / h;
  return [sx, 0, 0, sy, Math.min(rect[0], rect[2]) - x0 * sx, Math.min(rect[1], rect[3]) - y0 * sy];
}

// a picture drawn into rect, the first row of the picture at the top
export function imageMatrix(x: number, y: number, w: number, h: number): number[] {
  return [w, 0, 0, -h, x, y + h];
}

// a board page is cut to its ink and its pdf page, an empty one keeps its frame
export function boardFrame(meta: PageMeta, items: Item[]): Frame {
  const box = emptyBox();
  for (const item of items) growBox(box, itemBox(item));
  const bg = meta.pdf;
  if (bg) growBox(box, { minX: bg.x, minY: bg.y, maxX: bg.x + bg.w, maxY: bg.y + bg.h });
  if (isEmpty(box)) return { x: -meta.w / 2, y: -meta.h / 2, w: meta.w, h: meta.h };
  return {
    x: box.minX - BOARD_MARGIN,
    y: box.minY - BOARD_MARGIN,
    w: box.maxX - box.minX + BOARD_MARGIN * 2,
    h: box.maxY - box.minY + BOARD_MARGIN * 2
  };
}

export function pageSetup(frame: Frame): { w: number; h: number; m: number[] } {
  const k = Math.min(1, MAX_SIDE / Math.max(frame.w, frame.h));
  const w = frame.w * k;
  const h = frame.h * k;
  return { w, h, m: [k, 0, 0, -k, -frame.x * k, h + frame.y * k] };
}
