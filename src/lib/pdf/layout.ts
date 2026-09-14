import type { PdfLayout } from '$lib/stores/preferences';

export type { PdfLayout };

export const PDF_LAYOUTS: { id: PdfLayout; label: string }[] = [
  { id: 'full', label: 'Full page' },
  { id: 'below', label: 'Notes below' },
  { id: 'beside', label: 'Notes beside' }
];

// a notebook page made from a pdf page: its size and where the pdf page
// sits on it, all in points
export interface PdfPlacement {
  w: number;
  h: number;
  x: number;
  y: number;
  pw: number;
  ph: number;
}

const BESIDE = 0.6;

export function placePdfPage(pw: number, ph: number, layout: PdfLayout): PdfPlacement {
  if (layout === 'below') {
    // at least as much room as the slide takes, and never flatter than a
    // portrait sheet, so a wide slide gets a page like a handout
    const h = Math.round(Math.max(ph * 2, pw * Math.SQRT2));
    return { w: pw, h, x: 0, y: 0, pw, ph };
  }
  if (layout === 'beside') {
    const w = Math.round(pw + Math.max(pw, ph) * BESIDE);
    return { w, h: ph, x: 0, y: 0, pw, ph };
  }
  return { w: pw, h: ph, x: 0, y: 0, pw, ph };
}

// which layout a page was made with, so a page added next to it looks the same
export function layoutOf(page: { w: number; h: number; pdf?: { w: number; h: number } }): PdfLayout {
  const pdf = page.pdf;
  if (!pdf) return 'full';
  if (pdf.h < page.h - 1) return 'below';
  if (pdf.w < page.w - 1) return 'beside';
  return 'full';
}
