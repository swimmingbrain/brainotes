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

// the input calls these hooks, the view draws the overlay
export interface Tool {
  down(s: Sample, kind: PointerKind): void;
  move(s: Sample): void;
  // where the browser thinks the pointer goes next, only ever a preview
  predict?(list: Sample[]): void;
  // s is where the pointer was let go, missing when the stroke was cut off
  up(s?: Sample): void;
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
