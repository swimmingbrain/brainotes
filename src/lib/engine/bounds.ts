import { derived } from './cache';
import { shapePad } from './shapes';
import { textHeight } from './text';
import type { Box, Item } from './types';

export function emptyBox(): Box {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isEmpty(box: Box): boolean {
  return box.minX > box.maxX || box.minY > box.maxY;
}

// grows box so it also covers other, returns box
export function growBox(box: Box, other: Box): Box {
  if (other.minX < box.minX) box.minX = other.minX;
  if (other.minY < box.minY) box.minY = other.minY;
  if (other.maxX > box.maxX) box.maxX = other.maxX;
  if (other.maxY > box.maxY) box.maxY = other.maxY;
  return box;
}

export function padBox(box: Box, pad: number): Box {
  return { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad };
}

export function moveBox(box: Box, dx: number, dy: number): Box {
  return { minX: box.minX + dx, minY: box.minY + dy, maxX: box.maxX + dx, maxY: box.maxY + dy };
}

export function boxesTouch(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function pointsBox(pts: Float32Array, pad: number): Box {
  const box = emptyBox();
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i];
    const y = pts[i + 1];
    if (x < box.minX) box.minX = x;
    if (y < box.minY) box.minY = y;
    if (x > box.maxX) box.maxX = x;
    if (y > box.maxY) box.maxY = y;
  }
  return padBox(box, pad);
}

// items never change in place, so the box is worked out once per item
export function itemBox(item: Item): Box {
  const d = derived(item);
  if (d.box) return d.box;
  let box: Box;
  if (item.type === 'stroke') {
    // the outline stays within the pen size of the line, plus 1 for anti aliasing
    box = pointsBox(item.pts, item.size + 1);
  } else if (item.type === 'shape') {
    const pad = shapePad(item);
    box = {
      minX: Math.min(item.x1, item.x2) - pad,
      minY: Math.min(item.y1, item.y2) - pad,
      maxX: Math.max(item.x1, item.x2) + pad,
      maxY: Math.max(item.y1, item.y2) + pad
    };
  } else if (item.type === 'text') {
    // letters like j and f can reach a little past the box of the lines
    const pad = item.size * 0.15;
    box = {
      minX: item.x - pad,
      minY: item.y,
      maxX: item.x + item.w + pad,
      maxY: item.y + textHeight(item) + pad
    };
  } else {
    box = { minX: item.x, minY: item.y, maxX: item.x + item.w, maxY: item.y + item.h };
  }
  d.box = box;
  return box;
}
