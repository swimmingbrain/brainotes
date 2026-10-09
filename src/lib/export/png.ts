import { bitmapReady } from '$lib/engine/images';
import { renderPage, type Frame } from '$lib/engine/render';
import type { Item, PageMeta } from '$lib/engine/types';
import { ensureShot, pdfDark } from '$lib/pdf/pdf';
import { boardFrame } from './ops';

const SCALE = 2;
const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 16384;

export interface PngOptions {
  scale?: number;
  // a part of the page in page units, else the whole page or the ink of a board
  region?: Frame;
  // the longest side in pixels
  maxSide?: number;
}

export interface Png {
  blob: Blob;
  w: number;
  h: number;
  // the scale it came out at, smaller than asked when it would be too big
  scale: number;
}

export async function renderPng(page: { meta: PageMeta; items: Item[] }, board: boolean, options: PngOptions = {}): Promise<Png> {
  const { meta, items } = page;
  const frame = options.region ?? (board ? boardFrame(meta, items) : { x: 0, y: 0, w: meta.w, h: meta.h });
  const maxSide = options.maxSide ?? MAX_SIDE;
  let scale = options.scale ?? SCALE;
  if (frame.w * frame.h * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (frame.w * frame.h));
  scale = Math.min(scale, maxSide / frame.w, maxSide / frame.h);
  for (const item of items) if (item.type === 'image') await bitmapReady(item.assetId);
  if (meta.pdf) {
    await pdfDark(meta.pdf.assetId, meta.pdf.page, meta.pdf.w);
    await ensureShot(meta.pdf.assetId, meta.pdf.page, scale);
  }
  const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(frame.w * scale)), Math.max(1, Math.ceil(frame.h * scale)));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas for the png');
  // a part of a paper page keeps the pattern one step in from the edges like the whole page
  renderPage(ctx, page, scale, board || options.region ? frame : undefined, board);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { blob, w: canvas.width, h: canvas.height, scale };
}

export async function exportPng(page: { meta: PageMeta; items: Item[] }, board: boolean): Promise<Blob> {
  return (await renderPng(page, board)).blob;
}
