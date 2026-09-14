import { describe, expect, it } from 'vitest';
import type { PageMeta, Shape } from '$lib/engine/types';
import {
  blendOver,
  BOARD_MARGIN,
  boardFrame,
  dotsOf,
  MAX_SIDE,
  outlinePath,
  pageSetup,
  parseColor,
  patternOps,
  pdfMatrix,
  shapePathOps
} from './ops';

function apply(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const META: PageMeta = { id: 'p', w: 960, h: 540, paper: { style: 'dots', spacing: 24, color: 'white' } };

describe('export ops', () => {
  it('reads hex and rgba colors and lays a see through one over paper', () => {
    expect(parseColor('#1f5fd1')).toEqual([31, 95, 209, 1]);
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('rgba(60, 90, 140, 0.22)')).toEqual([60, 90, 140, 0.22]);
    const [r, g, b] = blendOver('rgba(0, 0, 0, 0.5)', '#ffffff');
    expect([r, g, b]).toEqual([127.5, 127.5, 127.5]);
  });

  it('writes the outline as cubic curves that follow the quadratic ones', () => {
    const outline = [
      [0, 0],
      [40, 0],
      [40, 40],
      [0, 40]
    ];
    const path = outlinePath(outline).split('\n');
    expect(path[0]).toBe('0 5 m');
    expect(path.at(-1)).toBe('h');
    expect(path.filter((p) => p.endsWith(' c'))).toHaveLength(4);
    // the first curve runs from (0, 5) around the corner (0, 0) to (5, 0) in
    // page units, its middle is where the quadratic one has it
    const [c1x, c1y, c2x, c2y, ex, ey] = path[1].split(' ').slice(0, 6).map(Number);
    const mx = 0.125 * 0 + 0.375 * c1x + 0.375 * c2x + 0.125 * ex;
    const my = 0.125 * 5 + 0.375 * c1y + 0.375 * c2y + 0.125 * ey;
    expect(mx).toBeCloseTo(0.25 * 0 + 0.5 * 0 + 0.25 * 5, 1);
    expect(my).toBeCloseTo(0.25 * 5 + 0.5 * 0 + 0.25 * 0, 1);
    expect(outlinePath([[1, 1]])).toBe('');
  });

  it('draws shapes the way the canvas does', () => {
    const base: Shape = { id: 's', type: 'shape', kind: 'rect', x1: 30, y1: 40, x2: 10, y2: 10, color: '#000', size: 2 };
    expect(shapePathOps(base)).toBe('10 10 20 30 re');
    const ellipse = shapePathOps({ ...base, kind: 'ellipse' });
    expect(ellipse.split('\n').filter((p) => p.endsWith(' c'))).toHaveLength(4);
    expect(shapePathOps({ ...base, kind: 'line' })).toBe('30 40 m 10 10 l');
    expect(shapePathOps({ ...base, kind: 'arrow' }).split('\n')).toHaveLength(2);
    expect(shapePathOps({ ...base, kind: 'line', x2: 30, y2: 40 })).toBe('30 40 m 30.01 40 l');
  });

  it('rules a page one step in from its edges and a board everywhere', () => {
    const lines = patternOps({ style: 'lines', spacing: 24, color: 'white' }, { x: 0, y: 0, w: 595, h: 842 }, false);
    // 24, 48 ... 840
    expect(lines.split('\n').filter((p) => p.endsWith(' l'))).toHaveLength(35);
    const grid = patternOps({ style: 'grid', spacing: 100, color: 'cream' }, { x: -250, y: -150, w: 500, h: 300 }, true);
    // rows at -100, 0, 100 and columns at -200 ... 200
    expect(grid.split('\n').filter((p) => p.endsWith(' l'))).toHaveLength(3 + 5);
    expect(patternOps({ style: 'blank', spacing: 24, color: 'white' }, { x: 0, y: 0, w: 100, h: 100 }, false)).toBe('');
    expect(patternOps({ style: 'dots', spacing: 24, color: 'white' }, { x: 0, y: 0, w: 100, h: 100 }, false)).toBe('');
  });

  it('puts the dots of a tile where the canvas has them', () => {
    const frame = { x: 0, y: 0, w: 595, h: 842 };
    const setup = pageSetup(frame);
    const dots = dotsOf({ style: 'dots', spacing: 24, color: 'white' }, frame, false, setup.m)!;
    expect(dots.step).toBe(24);
    // the middle of the first tile lands on the page point (0, 0), of the
    // next one on (24, 24), both in the default space of the pdf page
    expect(apply(dots.matrix, 12, 12)).toEqual(apply(setup.m, 0, 0));
    expect(apply(dots.matrix, 36, 36)).toEqual(apply(setup.m, 24, 24));
    expect(dots.area).toBe('12 12 583 830 re');
    const board = dotsOf({ style: 'dots', spacing: 24, color: 'dark' }, { x: -100, y: -50, w: 200, h: 100 }, true, setup.m)!;
    expect(board.area).toBe('-100 -50 200 100 re');
    expect(dotsOf({ style: 'lines', spacing: 24, color: 'white' }, frame, false, setup.m)).toBeNull();
  });

  it('lays a pdf page onto its place for every turn', () => {
    const crop = { x: 10, y: 20, w: 600, h: 800 };
    // the top left corner a viewer shows lands on the top left of the rect
    const rect = { x: 50, y: 70, w: 400, h: 300 };
    const tl = (r: number): [number, number] => {
      if (r === 90) return [crop.x, crop.y];
      if (r === 180) return [crop.x + crop.w, crop.y];
      if (r === 270) return [crop.x + crop.w, crop.y + crop.h];
      return [crop.x, crop.y + crop.h];
    };
    for (const r of [0, 90, 180, 270, -90, 450]) {
      const m = pdfMatrix(crop, r, rect);
      const [x, y] = apply(m, ...tl(((r % 360) + 360) % 360));
      expect(x).toBeCloseTo(rect.x);
      expect(y).toBeCloseTo(rect.y);
      // and the opposite corner on the bottom right
      const [cx, cy] = apply(m, crop.x + crop.w / 2, crop.y + crop.h / 2);
      expect(cx).toBeCloseTo(rect.x + rect.w / 2);
      expect(cy).toBeCloseTo(rect.y + rect.h / 2);
    }
  });

  it('fits a board page to its ink with a margin', () => {
    expect(boardFrame(META, [])).toEqual({ x: -480, y: -270, w: 960, h: 540 });
    const shape: Shape = { id: 's', type: 'shape', kind: 'line', x1: 1000, y1: 2000, x2: 1200, y2: 2100, color: '#000', size: 2 };
    const frame = boardFrame(META, [shape]);
    expect(frame.x).toBeCloseTo(1000 - 2 - BOARD_MARGIN);
    expect(frame.w).toBeCloseTo(200 + 4 + BOARD_MARGIN * 2);
    const withPdf = boardFrame({ ...META, pdf: { assetId: 'a', page: 1, x: -480, y: -270, w: 960, h: 540 } }, []);
    expect(withPdf).toEqual({ x: -480 - BOARD_MARGIN, y: -270 - BOARD_MARGIN, w: 960 + BOARD_MARGIN * 2, h: 540 + BOARD_MARGIN * 2 });
  });

  it('turns a frame into a page with y going down', () => {
    const { w, h, m } = pageSetup({ x: 100, y: 50, w: 600, h: 400 });
    expect([w, h]).toEqual([600, 400]);
    expect(apply(m, 100, 50)).toEqual([0, 400]);
    expect(apply(m, 700, 450)).toEqual([600, 0]);
    const big = pageSetup({ x: 0, y: 0, w: MAX_SIDE * 2, h: 1000 });
    expect(big.w).toBe(MAX_SIDE);
    expect(big.h).toBe(500);
  });
});
