import { describe, expect, it } from 'vitest';
import { layoutOf, placePdfPage, type PdfLayout } from './layout';

const SLIDE = { w: 960, h: 540 };
const A4 = { w: 595.28, h: 841.89 };

describe('pdf page layouts', () => {
  it('keeps the pdf page as it is for a full page', () => {
    expect(placePdfPage(A4.w, A4.h, 'full')).toEqual({ w: A4.w, h: A4.h, x: 0, y: 0, pw: A4.w, ph: A4.h });
  });

  it('puts a slide on top of a portrait page with room to write under it', () => {
    const p = placePdfPage(SLIDE.w, SLIDE.h, 'below');
    expect(p.w).toBe(960);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    expect(p.h).toBe(Math.round(960 * Math.SQRT2));
    // more room for notes than the slide itself takes
    expect(p.h - p.ph).toBeGreaterThan(p.ph);
  });

  it('gives a tall page below as much room as the page itself', () => {
    const p = placePdfPage(A4.w, A4.h, 'below');
    expect(p.w).toBe(A4.w);
    expect(p.h).toBe(Math.round(A4.h * 2));
    expect(p.ph).toBe(A4.h);
  });

  it('puts the slide on the left of a wider page for notes beside', () => {
    const p = placePdfPage(SLIDE.w, SLIDE.h, 'beside');
    expect(p.h).toBe(540);
    expect(p.w).toBe(960 + 576);
    expect(p.pw).toBe(960);
    const tall = placePdfPage(A4.w, A4.h, 'beside');
    expect(tall.h).toBe(A4.h);
    expect(tall.w).toBe(Math.round(A4.w + A4.h * 0.6));
  });

  it('tells the layout back from a page', () => {
    for (const layout of ['full', 'below', 'beside'] as PdfLayout[]) {
      for (const size of [SLIDE, A4]) {
        const p = placePdfPage(size.w, size.h, layout);
        expect(layoutOf({ w: p.w, h: p.h, pdf: { w: p.pw, h: p.ph } })).toBe(layout);
      }
    }
    expect(layoutOf({ w: 595, h: 842 })).toBe('full');
  });
});
