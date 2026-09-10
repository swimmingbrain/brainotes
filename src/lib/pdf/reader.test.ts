import { describe, expect, it } from 'vitest';
import { pageAtY, pagesIn, READER_GAP, READER_PAD, readerLayout, scrollOf, spotOf } from './reader';

const pages = [
  { w: 600, h: 800 },
  { w: 600, h: 800 },
  { w: 1200, h: 600 },
  { w: 600, h: 800 }
];

describe('the reader layout', () => {
  it('fits the widest page into the view at zoom 1', () => {
    const l = readerLayout(pages, 600 + READER_PAD * 2, 1);
    expect(l.scale).toBe(0.5);
    expect(l.tops[0]).toBe(READER_PAD);
    expect(l.tops[1]).toBe(READER_PAD + 400 + READER_GAP);
    expect(l.tops.length).toBe(5);
    expect(l.height).toBe(l.tops[4] - READER_GAP + READER_PAD);
    expect(l.width).toBe(600 + READER_PAD * 2);
  });

  it('grows wider than the view when zoomed in', () => {
    const l = readerLayout(pages, 624, 2);
    expect(l.scale).toBe(1);
    expect(l.width).toBe(1200 + READER_PAD * 2);
  });

  it('finds the pages in a stretch of the scroll', () => {
    const { tops } = readerLayout(pages, 624, 1);
    expect(pageAtY(tops, 0)).toBe(0);
    expect(pageAtY(tops, tops[1] + 5)).toBe(1);
    // the gap under a page belongs to the next one
    expect(pageAtY(tops, tops[1] - 2)).toBe(1);
    expect(pageAtY(tops, 1e9)).toBe(3);
    expect(pagesIn(tops, 0, 300)).toEqual([0, 1]);
    expect(pagesIn(tops, 300, tops[2] + 1)).toEqual([0, 3]);
  });

  it('keeps the spot in the document when the zoom changes', () => {
    const before = readerLayout(pages, 624, 1);
    const top = before.tops[2] + 100;
    const spot = spotOf(before.tops, top);
    expect(spot).toBeGreaterThan(2);
    expect(spot).toBeLessThan(3);
    const after = readerLayout(pages, 624, 2);
    const y = scrollOf(after.tops, spot);
    expect(pageAtY(after.tops, y)).toBe(2);
    expect(spotOf(after.tops, y)).toBeCloseTo(spot, 6);
  });
});
