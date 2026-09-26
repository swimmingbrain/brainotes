// x, y is the world point at the top left of the view, zoom is css px per world unit
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const PAGE_GAP = 24;
// css pixels kept free around the pages
export const MARGIN = 24;

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function stepZoom(zoom: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > zoom * 1.01) ?? MAX_ZOOM;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < zoom * 0.99) return ZOOM_STEPS[i];
  }
  return MIN_ZOOM;
}

// paper pages sit under each other, centred on x = 0
export function layoutPages(pages: { w: number; h: number }[]): Rect[] {
  const rects: Rect[] = [];
  let y = 0;
  for (const page of pages) {
    rects.push({ x: -page.w / 2, y, w: page.w, h: page.h });
    y += page.h + PAGE_GAP;
  }
  return rects;
}

export function contentRect(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x + r.w);
  }
  const last = rects[rects.length - 1];
  return { x: minX, y: rects[0].y, w: maxX - minX, h: last.y + last.h - rects[0].y };
}

export function toWorldX(cam: Camera, sx: number): number {
  return cam.x + sx / cam.zoom;
}

export function toWorldY(cam: Camera, sy: number): number {
  return cam.y + sy / cam.zoom;
}

// the world point under (sx, sy) stays where it is
export function zoomAt(cam: Camera, sx: number, sy: number, zoom: number): Camera {
  const next = clampZoom(zoom);
  const wx = toWorldX(cam, sx);
  const wy = toWorldY(cam, sy);
  return { x: wx - sx / next, y: wy - sy / next, zoom: next };
}

export function fitWidthZoom(contentW: number, viewW: number): number {
  if (contentW <= 0 || viewW <= 0) return 1;
  return clampZoom((viewW - MARGIN * 2) / contentW);
}

// centred while the pages fit, else no further than the margin past their edges
export function clampCamera(cam: Camera, content: Rect, viewW: number, viewH: number): Camera {
  const m = MARGIN / cam.zoom;
  const w = viewW / cam.zoom;
  const h = viewH / cam.zoom;
  let { x, y } = cam;
  if (content.w + m * 2 <= w) x = content.x + content.w / 2 - w / 2;
  else x = Math.max(content.x - m, Math.min(x, content.x + content.w + m - w));
  if (content.h + m * 2 <= h) y = content.y + content.h / 2 - h / 2;
  else y = Math.max(content.y - m, Math.min(y, content.y + content.h + m - h));
  return { x, y, zoom: cam.zoom };
}

// whole device pixels, so cached tiles are copied one to one and stay sharp
export function snapCamera(cam: Camera, dpr: number): Camera {
  const s = cam.zoom * dpr;
  return { x: Math.round(cam.x * s) / s, y: Math.round(cam.y * s) / s, zoom: cam.zoom };
}

// first page whose bottom is below y, the rects are sorted by y
function firstBelow(rects: Rect[], y: number): number {
  let lo = 0;
  let hi = rects.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rects[mid].y + rects[mid].h < y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// index range [from, to) of the pages that reach into y0..y1
export function visiblePages(rects: Rect[], y0: number, y1: number): [number, number] {
  const from = firstBelow(rects, y0);
  let to = from;
  while (to < rects.length && rects[to].y <= y1) to++;
  return [from, to];
}

export function pageAt(rects: Rect[], x: number, y: number): number {
  const i = firstBelow(rects, y);
  if (i >= rects.length) return -1;
  const r = rects[i];
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h ? i : -1;
}

// the page closest to y, a point in the gap counts for the page below
export function nearestPage(rects: Rect[], y: number): number {
  if (rects.length === 0) return -1;
  return Math.min(firstBelow(rects, y), rects.length - 1);
}
