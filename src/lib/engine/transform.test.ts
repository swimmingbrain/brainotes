import { describe, expect, it } from 'vitest';
import { itemBox } from './bounds';
import { moveBy, recolorItem, transformItem } from './transform';
import type { ImageItem, Shape, Stroke, TextItem } from './types';

const stroke: Stroke = {
  id: 's',
  type: 'stroke',
  pen: 'ballpoint',
  color: '#000',
  size: 2,
  pts: new Float32Array([0, 0, 0.3, 10, 20, 0.6, 30, 10, 0.9])
};

describe('moving items', () => {
  it('moves every point of a stroke and keeps the pressure', () => {
    const moved = transformItem(stroke, moveBy(5, -5)) as Stroke;
    expect([...moved.pts]).toEqual([5, -5, expect.closeTo(0.3), 15, 15, expect.closeTo(0.6), 35, 5, expect.closeTo(0.9)]);
    expect(moved.size).toBe(2);
    expect(moved.id).toBe('s');
    // the original is left alone
    expect(stroke.pts[0]).toBe(0);
  });

  it('moves shapes, pictures and text by their points', () => {
    const shape: Shape = { id: 'r', type: 'shape', kind: 'rect', x1: 0, y1: 0, x2: 10, y2: 20, color: '#000', size: 2 };
    expect(transformItem(shape, moveBy(3, 4))).toMatchObject({ x1: 3, y1: 4, x2: 13, y2: 24, size: 2 });
    const pic: ImageItem = { id: 'p', type: 'image', assetId: 'a', x: 10, y: 10, w: 100, h: 50 };
    expect(transformItem(pic, moveBy(-10, 0))).toMatchObject({ x: 0, y: 10, w: 100, h: 50, assetId: 'a' });
    const text: TextItem = { id: 't', type: 'text', x: 0, y: 0, w: 50, text: 'hi', size: 20, color: '#000' };
    expect(transformItem(text, moveBy(1, 2))).toMatchObject({ x: 1, y: 2, w: 50, size: 20, text: 'hi' });
  });

  it('moves the box with the item', () => {
    const before = itemBox(stroke);
    const after = itemBox(transformItem(stroke, moveBy(100, 50)));
    expect(after.minX - before.minX).toBeCloseTo(100);
    expect(after.maxY - before.maxY).toBeCloseTo(50);
  });
});

describe('scaling items', () => {
  it('scales a stroke around a corner, the width too', () => {
    const big = transformItem(stroke, { k: 2, ax: 30, ay: 20, dx: 0, dy: 0 }) as Stroke;
    expect(big.pts[0]).toBe(-30);
    expect(big.pts[1]).toBe(-20);
    expect(big.pts[6]).toBe(30);
    expect(big.size).toBe(4);
  });

  it('scales a picture and keeps its ratio', () => {
    const pic: ImageItem = { id: 'p', type: 'image', assetId: 'a', x: 10, y: 10, w: 100, h: 50 };
    expect(transformItem(pic, { k: 0.5, ax: 10, ay: 10, dx: 0, dy: 0 })).toMatchObject({ x: 10, y: 10, w: 50, h: 25 });
  });

  it('scales the size of a text and its width', () => {
    const text: TextItem = { id: 't', type: 'text', x: 0, y: 0, w: 22, text: 'ab', size: 20, color: '#000' };
    const out = transformItem(text, { k: 1.5, ax: 0, ay: 0, dx: 0, dy: 0 }) as TextItem;
    expect(out.size).toBe(30);
    // without a canvas a letter is 0.55 of the size wide
    expect(out.w).toBeCloseTo(33);
  });

  it('scales a shape and its line width', () => {
    const line: Shape = { id: 'l', type: 'shape', kind: 'arrow', x1: 0, y1: 0, x2: 10, y2: 0, color: '#000', size: 2 };
    expect(transformItem(line, { k: 3, ax: 0, ay: 0, dx: 1, dy: 1 })).toMatchObject({ x1: 1, y1: 1, x2: 31, y2: 1, size: 6 });
  });
});

describe('recoloring', () => {
  it('gives ink a new color and leaves pictures alone', () => {
    expect(recolorItem(stroke, '#f00')).toMatchObject({ color: '#f00', pts: stroke.pts });
    const pic: ImageItem = { id: 'p', type: 'image', assetId: 'a', x: 0, y: 0, w: 1, h: 1 };
    expect(recolorItem(pic, '#f00')).toBe(pic);
  });
});
