import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  contentRect,
  fitWidthZoom,
  layoutPages,
  MARGIN,
  MAX_ZOOM,
  MIN_ZOOM,
  nearestPage,
  PAGE_GAP,
  pageAt,
  snapCamera,
  stepZoom,
  toScreenX,
  toScreenY,
  toWorldX,
  toWorldY,
  visiblePages,
  zoomAt
} from './camera';

const A4 = { w: 595, h: 842 };

describe('camera', () => {
  it('turns screen points into world points and back', () => {
    const cam = { x: 100, y: -50, zoom: 2 };
    expect(toWorldX(cam, 40)).toBe(120);
    expect(toWorldY(cam, 40)).toBe(-30);
    expect(toScreenX(cam, toWorldX(cam, 123))).toBeCloseTo(123);
    expect(toScreenY(cam, toWorldY(cam, 77))).toBeCloseTo(77);
  });

  it('keeps the point under the cursor in place when zooming', () => {
    const cam = { x: 10, y: 20, zoom: 1 };
    const next = zoomAt(cam, 300, 200, 2.5);
    expect(next.zoom).toBe(2.5);
    expect(toWorldX(next, 300)).toBeCloseTo(toWorldX(cam, 300));
    expect(toWorldY(next, 200)).toBeCloseTo(toWorldY(cam, 200));
  });

  it('stays inside the zoom range', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 100).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 0.001).zoom).toBe(MIN_ZOOM);
  });

  it('steps through the zoom levels', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(1.1, -1)).toBe(1);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });

  it('fits the page width with a margin on both sides', () => {
    const zoom = fitWidthZoom(595, 1000);
    expect(zoom * 595 + MARGIN * 2).toBeCloseTo(1000);
  });

  it('snaps the camera onto device pixels', () => {
    const snapped = snapCamera({ x: 10.123, y: 5.777, zoom: 1.5 }, 2);
    expect(snapped.x * 3).toBeCloseTo(Math.round(snapped.x * 3), 9);
    expect(snapped.y * 3).toBeCloseTo(Math.round(snapped.y * 3), 9);
    expect(Math.abs(snapped.x - 10.123)).toBeLessThan(1 / 3);
  });
});

describe('page layout', () => {
  const rects = layoutPages([A4, A4, { w: 960, h: 540 }]);

  it('stacks the pages with a gap, centred on x', () => {
    expect(rects[0]).toEqual({ x: -297.5, y: 0, w: 595, h: 842 });
    expect(rects[1].y).toBe(842 + PAGE_GAP);
    expect(rects[2].x).toBe(-480);
    expect(rects[2].y).toBe((842 + PAGE_GAP) * 2);
  });

  it('measures the content of all pages', () => {
    const content = contentRect(rects);
    expect(content.x).toBe(-480);
    expect(content.w).toBe(960);
    expect(content.h).toBe(842 * 2 + 540 + PAGE_GAP * 2);
  });

  it('finds the page under a point', () => {
    expect(pageAt(rects, 0, 10)).toBe(0);
    expect(pageAt(rects, 0, 842 + 10)).toBe(-1);
    expect(pageAt(rects, 0, 842 + PAGE_GAP + 10)).toBe(1);
    expect(pageAt(rects, 400, 10)).toBe(-1);
    expect(pageAt(rects, 400, rects[2].y + 10)).toBe(2);
    expect(pageAt(rects, 0, 99999)).toBe(-1);
  });

  it('finds the nearest page, the gap belongs to the page below', () => {
    expect(nearestPage(rects, -500)).toBe(0);
    expect(nearestPage(rects, 842 + 5)).toBe(1);
    expect(nearestPage(rects, 99999)).toBe(2);
    expect(nearestPage([], 0)).toBe(-1);
  });

  it('lists the pages that reach into a band', () => {
    expect(visiblePages(rects, 0, 100)).toEqual([0, 1]);
    expect(visiblePages(rects, 800, 900)).toEqual([0, 2]);
    expect(visiblePages(rects, 845, 860)).toEqual([1, 1]);
    expect(visiblePages(rects, -100, 99999)).toEqual([0, 3]);
  });

  it('centres content that fits and clamps content that does not', () => {
    const content = contentRect(rects);
    const small = clampCamera({ x: 5000, y: 5000, zoom: 0.1 }, content, 1000, 800);
    expect(small.x + 1000 / 0.1 / 2).toBeCloseTo(content.x + content.w / 2);
    expect(small.y + 800 / 0.1 / 2).toBeCloseTo(content.y + content.h / 2);

    const top = clampCamera({ x: 0, y: -5000, zoom: 1 }, content, 1000, 800);
    expect(top.y).toBe(content.y - MARGIN);
    const bottom = clampCamera({ x: 0, y: 99999, zoom: 1 }, content, 1000, 800);
    expect(bottom.y).toBe(content.y + content.h + MARGIN - 800);
  });
});
