import type { Box } from '../types';

export type PointerKind = 'pen' | 'mouse' | 'touch';

// one pointer sample in css pixels from the top left of the canvas
export interface Sample {
  x: number;
  y: number;
  pressure: number;
  time: number;
  // shift keeps shapes straight and square
  shift?: boolean;
}

// every tool (pen, eraser, hand and later select, shape, text, laser) has
// the same few hooks. the input calls them, the view draws their overlay
export interface Tool {
  down(s: Sample, kind: PointerKind): void;
  move(s: Sample): void;
  // where the browser thinks the pointer goes next, only ever a preview
  predict?(list: Sample[]): void;
  up(): void;
  cancel(): void;
  // runs at the start of every frame while the tool is the view's tool
  frame?(): void;
  // the pointer moves without pressing, null once it left the canvas
  hover?(s: Sample | null): void;
  // draws on the live canvas in device pixels, returns what it covered
  drawLive?(ctx: CanvasRenderingContext2D): Box | null;
  // the same on the highlighter canvas, under the ink
  drawUnder?(ctx: CanvasRenderingContext2D): Box | null;
}
