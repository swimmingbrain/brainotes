import { describe, expect, it } from 'vitest';
import { itemBox } from './bounds';
import { layoutText, LINE_HEIGHT, textLayout, textWidth } from './text';
import type { TextItem } from './types';

// every letter and space is 10 units wide
const measure = (text: string) => text.length * 10;

describe('text layout', () => {
  it('keeps short lines and the line breaks typed', () => {
    expect(layoutText('hello', 100, measure)).toEqual(['hello']);
    expect(layoutText('one\ntwo\n\nfour', 100, measure)).toEqual(['one', 'two', '', 'four']);
  });

  it('never wraps without a width', () => {
    expect(layoutText('a very long line that goes on', Infinity, measure)).toEqual(['a very long line that goes on']);
  });

  it('wraps at spaces, the space stays at the end of the line', () => {
    expect(layoutText('the quick brown fox', 100, measure)).toEqual(['the quick ', 'brown fox']);
    expect(layoutText('aa bb cc dd', 50, measure)).toEqual(['aa bb ', 'cc dd']);
  });

  it('keeps spaces at the start of a line', () => {
    expect(layoutText('  indented', 200, measure)).toEqual(['  indented']);
  });

  it('cuts a word longer than the line between letters', () => {
    expect(layoutText('abcdefghijkl', 50, measure)).toEqual(['abcde', 'fghij', 'kl']);
    expect(layoutText('go abcdefghijkl', 50, measure)).toEqual(['go ', 'abcde', 'fghij', 'kl']);
  });

  it('measures the widest line, no wider than the width', () => {
    expect(textWidth(['ab', 'abcd'], 100, measure)).toBe(40);
    expect(textWidth(['the quick '], 90, measure)).toBe(90);
  });

  it('gives a text item its lines and box', () => {
    // without a canvas a letter is 0.55 of the size wide
    const item: TextItem = { id: 't', type: 'text', x: 10, y: 20, w: 1000, text: 'one\ntwo', size: 20, color: '#000' };
    const layout = textLayout(item);
    expect(layout.lines).toEqual(['one', 'two']);
    expect(layout.width).toBeCloseTo(33);
    const box = itemBox(item);
    expect(box.minY).toBe(20);
    expect(box.maxY).toBeCloseTo(20 + 2 * 20 * LINE_HEIGHT + 3);
  });

  it('wraps a stored text at its width', () => {
    const item: TextItem = { id: 't', type: 'text', x: 0, y: 0, w: 80, text: 'aaa bbb ccc', size: 20, color: '#000' };
    expect(textLayout(item).lines).toEqual(['aaa bbb ', 'ccc']);
  });
});
