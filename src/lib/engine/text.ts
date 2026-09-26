import { derived } from './cache';
import type { TextItem } from './types';

// the textarea editor uses the same font and line height, so the text never moves
export const TEXT_FONT = 'Inter, system-ui, sans-serif';
export const LINE_HEIGHT = 1.4;

export type Measure = (text: string) => number;

export interface TextLayout {
  // layouts from before the font loaded are made again
  epoch: number;
  lines: string[];
  // the widest line, never more than the width it was laid out in
  width: number;
  baseline: number;
}

// breaks like css pre-wrap: at spaces, which hang at the end of the line, and
// a word longer than the whole line is cut between letters
function wrapLine(line: string, max: number, measure: Measure, out: string[]) {
  if (measure(line) <= max) {
    out.push(line);
    return;
  }
  const parts = line.match(/\s*\S+|\s+$/g) ?? [line];
  let current = '';
  for (const part of parts) {
    if (current.trim() !== '' && measure((current + part).trimEnd()) > max) {
      const word = part.trimStart();
      out.push(current + part.slice(0, part.length - word.length));
      current = word;
    } else {
      current += part;
    }
    while (current.trim().length > 1 && measure(current.trimEnd()) > max) {
      let cut = current.length - 1;
      while (cut > 1 && measure(current.slice(0, cut)) > max) cut--;
      out.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  out.push(current);
}

export function layoutText(text: string, max: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) wrapLine(line, max, measure, out);
  return out;
}

export function textWidth(lines: string[], max: number, measure: Measure): number {
  let width = 0;
  for (const line of lines) width = Math.max(width, measure(line));
  return Math.min(width, max);
}

export function fontOf(size: number): string {
  return `400 ${size}px ${TEXT_FONT}`;
}

let ctx: CanvasRenderingContext2D | null = null;
let epoch = 0;

// text measured with the fallback font is measured again
export function fontLoaded() {
  epoch++;
}

function context(): CanvasRenderingContext2D | null {
  if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
  return ctx;
}

// without a canvas (the unit tests) a letter is about half an em wide
export function measurer(size: number): Measure {
  const c = context();
  if (!c) return (text) => text.length * size * 0.55;
  const font = fontOf(size);
  return (text) => {
    if (c.font !== font) c.font = font;
    return c.measureText(text).width;
  };
}

// like the css line box: ascent and descent sit in the middle of the line height
export function firstBaseline(size: number): number {
  const c = context();
  let ascent = size * 0.97;
  let descent = size * 0.24;
  if (c) {
    c.font = fontOf(size);
    const m = c.measureText('Hg');
    if (m.fontBoundingBoxAscent) {
      ascent = m.fontBoundingBoxAscent;
      descent = m.fontBoundingBoxDescent;
    }
  }
  return (size * LINE_HEIGHT - ascent - descent) / 2 + ascent;
}

// a little room so a line laid out at exactly the stored width never wraps
const SLACK = 0.5;

export function textLayout(item: TextItem): TextLayout {
  const d = derived(item);
  if (d.text && d.text.epoch === epoch) return d.text;
  const measure = measurer(item.size);
  const lines = layoutText(item.text, item.w + SLACK, measure);
  const width = textWidth(lines, item.w + SLACK, measure);
  const layout = { epoch, lines, width, baseline: firstBaseline(item.size) };
  d.text = layout;
  return layout;
}

export function textHeight(item: TextItem): number {
  return textLayout(item).lines.length * item.size * LINE_HEIGHT;
}
