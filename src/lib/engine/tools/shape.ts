import { itemBox } from '../bounds';
import { newId } from '../doc';
import { inkColor, isDark } from '../render';
import { shapePath } from '../shapes';
import type { Box, Shape, ShapeKind } from '../types';
import type { CanvasView } from '../view';
import type { Sample, Tool } from './tool';

export interface ShapeSettings {
  kind: ShapeKind;
  color: string;
  size: number;
}

// with shift a line goes in steps of 45 degrees and a box is a square
export function constrain(kind: ShapeKind, x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (kind === 'line' || kind === 'arrow') {
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    const len = Math.hypot(dx, dy);
    return [x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len];
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return [x1 + (dx < 0 ? -side : side), y1 + (dy < 0 ? -side : side)];
}

export class ShapeTool implements Tool {
  private shape: Shape | null = null;
  private page = -1;
  private pageId = '';
  private shown = '';
  private ghost: Shape | null = null;
  private ghostPage = 0;

  constructor(
    private view: CanvasView,
    private settings: () => ShapeSettings
  ) {}

  private toPage(s: Sample): [number, number] {
    const cam = this.view.cam;
    return [cam.x + s.x / cam.zoom - this.view.pageX(this.page), cam.y + s.y / cam.zoom - this.view.pageY(this.page)];
  }

  down(s: Sample) {
    const page = this.view.pageAtScreen(s.x, s.y);
    if (page < 0) return;
    const set = this.settings();
    const meta = this.view.doc.notebook.pages[page];
    this.page = page;
    this.pageId = meta.id;
    this.shown = inkColor(set.color, isDark(meta.paper));
    const [x, y] = this.toPage(s);
    this.shape = { id: newId(), type: 'shape', kind: set.kind, x1: x, y1: y, x2: x, y2: y, color: set.color, size: set.size };
    this.view.requestLive();
  }

  move(s: Sample) {
    const shape = this.shape;
    if (!shape) return;
    let [x, y] = this.toPage(s);
    if (s.shift) [x, y] = constrain(shape.kind, shape.x1, shape.y1, x, y);
    this.shape = { ...shape, x2: x, y2: y };
    this.view.requestLive();
  }

  up() {
    const shape = this.shape;
    this.shape = null;
    this.view.requestLive();
    if (!shape) return;
    const min = 3 / this.view.cam.zoom;
    if (Math.abs(shape.x2 - shape.x1) < min && Math.abs(shape.y2 - shape.y1) < min) return;
    const page = this.view.doc.page(this.pageId);
    if (!page) return;
    this.view.history.run({ type: 'items', pageId: this.pageId, removed: [], added: [{ item: shape, index: page.items.length }] });
    // it stays on the live canvas one more frame, until the ink canvas shows it
    this.ghost = shape;
    this.ghostPage = this.page;
  }

  cancel() {
    this.shape = null;
    this.view.requestLive();
  }

  drawLive(ctx: CanvasRenderingContext2D): Box | null {
    let shape = this.shape;
    let page = this.page;
    if (!shape && this.ghost) {
      shape = this.ghost;
      page = this.ghostPage;
      this.ghost = null;
      this.view.requestLive();
    }
    if (!shape || page >= this.view.doc.pageCount) return null;
    this.view.applyPage(ctx, page);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.shown;
    ctx.lineWidth = shape.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(shapePath(shape));
    return this.view.toDevice(page, itemBox(shape));
  }
}
