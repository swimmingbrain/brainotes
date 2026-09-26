import { derived } from './cache';
import type { Shape } from './types';

const HEAD_ANGLE = (28 * Math.PI) / 180;
const ELLIPSE_STEPS = 48;

export function shapeLength(shape: Shape): number {
  return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
}

// the head grows with the pen but never takes more than half of the arrow
export function headLength(size: number, length: number): number {
  return Math.min(length * 0.45, 7 + size * 3);
}

// the two ends of the arrow head strokes, they meet at x2, y2
function headPoints(shape: Shape): number[] {
  const len = shapeLength(shape);
  const h = headLength(shape.size, len);
  const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1) + Math.PI;
  return [
    shape.x2 + Math.cos(angle - HEAD_ANGLE) * h,
    shape.y2 + Math.sin(angle - HEAD_ANGLE) * h,
    shape.x2 + Math.cos(angle + HEAD_ANGLE) * h,
    shape.y2 + Math.sin(angle + HEAD_ANGLE) * h
  ];
}

// the outline as open polylines (x, y, x, y, ...), for hit tests and the lasso
export function shapeLines(shape: Shape): number[][] {
  const { x1, y1, x2, y2 } = shape;
  if (shape.kind === 'line') return [[x1, y1, x2, y2]];
  if (shape.kind === 'arrow') {
    const [ax, ay, bx, by] = headPoints(shape);
    return [
      [x1, y1, x2, y2],
      [ax, ay, x2, y2, bx, by]
    ];
  }
  if (shape.kind === 'rect') return [[x1, y1, x2, y1, x2, y2, x1, y2, x1, y1]];
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  const pts: number[] = [];
  for (let i = 0; i <= ELLIPSE_STEPS; i++) {
    const t = (i / ELLIPSE_STEPS) * Math.PI * 2;
    pts.push(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry);
  }
  return [pts];
}

// how far the ink of a shape reaches past its two points
export function shapePad(shape: Shape): number {
  const reach = shape.size / 2 + 1;
  if (shape.kind !== 'arrow') return reach;
  return headLength(shape.size, shapeLength(shape)) + reach;
}

export function shapePath(shape: Shape): Path2D {
  const d = derived(shape);
  if (d.path) return d.path;
  const path = new Path2D();
  const { x1, y1, x2, y2 } = shape;
  if (shape.kind === 'rect') {
    path.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  } else if (shape.kind === 'ellipse') {
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    path.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2);
  } else {
    path.moveTo(x1, y1);
    // a tap still leaves a dot
    path.lineTo(x2 === x1 && y2 === y1 ? x2 + 0.01 : x2, y2);
    if (shape.kind === 'arrow' && shapeLength(shape) > 0) {
      const [ax, ay, bx, by] = headPoints(shape);
      path.moveTo(ax, ay);
      path.lineTo(x2, y2);
      path.lineTo(bx, by);
    }
  }
  d.path = path;
  return path;
}
