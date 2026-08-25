import type { CanvasView } from '../view';
import type { Sample, Tool } from './tool';

// drags the page around, for the hand tool, space and the middle button
export class HandTool implements Tool {
  private x = 0;
  private y = 0;

  constructor(private view: CanvasView) {}

  down(s: Sample) {
    this.x = s.x;
    this.y = s.y;
  }

  move(s: Sample) {
    this.view.panBy(s.x - this.x, s.y - this.y);
    this.x = s.x;
    this.y = s.y;
  }

  up() {}

  cancel() {}
}
