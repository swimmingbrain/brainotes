import { derived } from './cache';
import { layoutText, measurer, textLayout, textWidth } from './text';
import type { Item, Stroke, TextItem } from './types';

// a move or a scale: x' = ax + (x - ax) * k + dx
export interface Change {
  k: number;
  ax: number;
  ay: number;
  dx: number;
  dy: number;
}

export function moveBy(dx: number, dy: number): Change {
  return { k: 1, ax: 0, ay: 0, dx, dy };
}

// the outline of a stroke only moves and grows with it, so the old one is
// reused instead of being built again. moving 500 strokes stays cheap
function carryPaths(from: Stroke, to: Stroke, c: Change) {
  if (typeof Path2D === 'undefined' || typeof DOMMatrix === 'undefined') return;
  const old = derived(from);
  if (!old.path && !old.line) return;
  const m = new DOMMatrix([c.k, 0, 0, c.k, c.ax - c.ax * c.k + c.dx, c.ay - c.ay * c.k + c.dy]);
  const d = derived(to);
  if (old.path) {
    d.path = new Path2D();
    d.path.addPath(old.path, m);
  }
  if (old.line) {
    d.line = new Path2D();
    d.line.addPath(old.line, m);
  }
}

// a text that was not wrapped keeps fitting its words at the new size
function scaledWidth(item: TextItem, size: number): number {
  const wrapped = textLayout(item).lines.length > item.text.split('\n').length;
  if (wrapped) return item.w * (size / item.size);
  const measure = measurer(size);
  return textWidth(layoutText(item.text, Infinity, measure), Infinity, measure);
}

// the same item (same id) moved and scaled, the original stays as it is
export function transformItem(item: Item, c: Change): Item {
  const { k, ax, ay, dx, dy } = c;
  const x = (v: number) => ax + (v - ax) * k + dx;
  const y = (v: number) => ay + (v - ay) * k + dy;
  if (item.type === 'stroke') {
    const pts = item.pts.slice();
    for (let i = 0; i < pts.length; i += 3) {
      pts[i] = x(pts[i]);
      pts[i + 1] = y(pts[i + 1]);
    }
    const out: Stroke = { ...item, pts, size: item.size * k };
    carryPaths(item, out, c);
    return out;
  }
  if (item.type === 'shape') {
    return { ...item, x1: x(item.x1), y1: y(item.y1), x2: x(item.x2), y2: y(item.y2), size: item.size * k };
  }
  if (item.type === 'text') {
    if (k === 1) {
      const out = { ...item, x: x(item.x), y: y(item.y) };
      derived(out).text = textLayout(item);
      return out;
    }
    const size = item.size * k;
    return { ...item, x: x(item.x), y: y(item.y), size, w: scaledWidth(item, size) };
  }
  return { ...item, x: x(item.x), y: y(item.y), w: item.w * k, h: item.h * k };
}

// pictures keep their colors
export function recolorItem(item: Item, color: string): Item {
  if (item.type === 'image' || item.color === color) return item;
  const out = { ...item, color };
  const from = derived(item);
  const to = derived(out);
  to.path = from.path;
  to.line = from.line;
  to.text = from.text;
  return out;
}
