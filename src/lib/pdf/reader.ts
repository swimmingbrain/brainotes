import type { PageSize } from './pdf';

// css pixels around and between the pages of the reader
export const READER_PAD = 12;
export const READER_GAP = 10;
export const MIN_READER_ZOOM = 0.25;
export const MAX_READER_ZOOM = 5;

export interface ReaderLayout {
  // css pixels per point
  scale: number;
  // where each page starts, and one more for the end of the last
  tops: number[];
  width: number;
  height: number;
}

// the pages under each other at a zoom over fit width, the widest page fits the view
export function readerLayout(pages: PageSize[], viewW: number, zoom: number): ReaderLayout {
  let widest = 1;
  for (const p of pages) widest = Math.max(widest, p.w);
  const fit = Math.max(0.05, (viewW - READER_PAD * 2) / widest);
  const scale = fit * zoom;
  const tops: number[] = [];
  let y = READER_PAD;
  for (const p of pages) {
    tops.push(y);
    y += Math.round(p.h * scale) + READER_GAP;
  }
  tops.push(y);
  const height = y - READER_GAP + READER_PAD;
  const width = Math.max(viewW, Math.round(widest * scale) + READER_PAD * 2);
  return { scale, tops, width, height };
}

// the page whose bottom is below y, counting from 0
export function pageAtY(tops: number[], y: number): number {
  let lo = 0;
  let hi = tops.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid + 1] - READER_GAP <= y) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo);
}

// index range [from, to) of the pages that reach into y0..y1
export function pagesIn(tops: number[], y0: number, y1: number): [number, number] {
  const count = tops.length - 1;
  if (count <= 0) return [0, 0];
  const from = pageAtY(tops, y0);
  let to = from;
  while (to < count && tops[to] < y1) to++;
  return [from, Math.max(to, from + 1)];
}

// a scroll position as the page at the top and how far into it, 2.5 is
// half way down the third page. it survives a zoom and a new panel width
export function spotOf(tops: number[], scrollTop: number): number {
  const i = pageAtY(tops, scrollTop);
  const span = tops[i + 1] - tops[i];
  return i + Math.max(0, Math.min(1, (scrollTop - tops[i]) / span));
}

export function scrollOf(tops: number[], spot: number): number {
  const count = tops.length - 1;
  if (count <= 0) return 0;
  const i = Math.max(0, Math.min(count - 1, Math.floor(spot)));
  return tops[i] + (spot - i) * (tops[i + 1] - tops[i]);
}

export function clampReaderZoom(zoom: number): number {
  return Math.max(MIN_READER_ZOOM, Math.min(MAX_READER_ZOOM, zoom));
}
