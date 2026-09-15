import { bitmapReady } from '$lib/engine/images';
import { renderPage } from '$lib/engine/render';
import type { Item, PageMeta } from '$lib/engine/types';
import { ensureShot, pdfDark } from '$lib/pdf/pdf';
import { boardFrame } from './ops';

const SCALE = 2;
const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 16384;

// one page as a png at twice its size, with its pdf page under the ink. a
// board is cut to its ink like in the pdf
export async function exportPng(page: { meta: PageMeta; items: Item[] }, board: boolean): Promise<Blob> {
  const { meta, items } = page;
  const frame = board ? boardFrame(meta, items) : { x: 0, y: 0, w: meta.w, h: meta.h };
  let scale = SCALE;
  if (frame.w * frame.h * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (frame.w * frame.h));
  scale = Math.min(scale, MAX_SIDE / frame.w, MAX_SIDE / frame.h);
  for (const item of items) if (item.type === 'image') await bitmapReady(item.assetId);
  if (meta.pdf) {
    // the blend of the highlighter and a sharp picture of the pdf page
    await pdfDark(meta.pdf.assetId, meta.pdf.page, meta.pdf.w);
    await ensureShot(meta.pdf.assetId, meta.pdf.page, scale);
  }
  const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(frame.w * scale)), Math.max(1, Math.ceil(frame.h * scale)));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas for the png');
  renderPage(ctx, page, scale, board ? frame : undefined);
  return canvas.convertToBlob({ type: 'image/png' });
}
