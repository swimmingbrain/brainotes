import { newId, type Placed } from '../doc';
import type { Op } from '../history';
import { cutStroke, inkNear, strokeNear } from '../hit';
import type { Box, Item, Stroke } from '../types';
import type { CanvasView } from '../view';
import type { Sample, Tool } from './tool';

export interface EraserSettings {
  mode: 'stroke' | 'area';
  // diameter in css pixels, the same on screen at any zoom
  size: number;
  markersOnly: boolean;
}

function pathLength(pts: Float32Array): number {
  let len = 0;
  for (let i = 3; i < pts.length; i += 3) len += Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2]);
  return len;
}

export class EraserTool implements Tool {
  private on = false;
  private shown = false;
  private x = 0;
  private y = 0;
  private lastX = 0;
  private lastY = 0;
  // samples that came in since the last frame, x, y, x, y, ...
  private path: number[] = [];
  private mode: EraserSettings['mode'] = 'stroke';
  private radius = 8;
  private markersOnly = false;
  // the items of each touched page from before the gesture, for the undo op
  private before = new Map<string, Item[]>();

  constructor(
    private view: CanvasView,
    private settings: () => EraserSettings
  ) {}

  down(s: Sample) {
    const set = this.settings();
    this.mode = set.mode;
    this.radius = set.size / 2;
    this.markersOnly = set.markersOnly;
    this.on = true;
    this.shown = true;
    this.before.clear();
    this.x = this.lastX = s.x;
    this.y = this.lastY = s.y;
    this.path = [s.x, s.y];
    this.view.requestLive();
  }

  move(s: Sample) {
    this.x = s.x;
    this.y = s.y;
    if (this.on) this.path.push(s.x, s.y);
    this.view.requestLive();
  }

  hover(s: Sample | null) {
    this.shown = s !== null;
    if (s) {
      this.radius = this.settings().size / 2;
      this.x = s.x;
      this.y = s.y;
    }
    this.view.requestLive();
  }

  // the erasing itself happens once per frame, not once per sample
  frame() {
    if (!this.on || this.path.length === 0) return;
    const path = this.path;
    for (let i = 0; i < path.length; i += 2) {
      this.erase(this.lastX, this.lastY, path[i], path[i + 1]);
      this.lastX = path[i];
      this.lastY = path[i + 1];
    }
    path.length = 0;
  }

  up() {
    this.frame();
    this.on = false;
    const ops: Op[] = [];
    for (const [pageId, before] of this.before) {
      const page = this.view.doc.page(pageId);
      if (!page) continue;
      const was = new Set(before);
      const is = new Set(page.items);
      const removed: Placed[] = [];
      const added: Placed[] = [];
      before.forEach((item, index) => {
        if (!is.has(item)) removed.push({ item, index });
      });
      page.items.forEach((item, index) => {
        if (!was.has(item)) added.push({ item, index });
      });
      if (removed.length > 0 || added.length > 0) ops.push({ type: 'items', pageId, removed, added });
    }
    this.before.clear();
    if (ops.length === 1) this.view.history.push(ops[0]);
    else if (ops.length > 1) this.view.history.push({ type: 'batch', ops });
    this.view.requestLive();
  }

  cancel() {
    this.up();
  }

  drawLive(ctx: CanvasRenderingContext2D): Box | null {
    if (!this.shown) return null;
    const dpr = this.view.dpr;
    const x = this.x * dpr;
    const y = this.y * dpr;
    const r = this.radius * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.stroke();
    // a light ring around the dark one, so it shows on dark paper too
    ctx.beginPath();
    ctx.arc(x, y, r + dpr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.stroke();
    const pad = r + dpr * 3;
    return { minX: x - pad, minY: y - pad, maxX: x + pad, maxY: y + pad };
  }

  private erase(ax: number, ay: number, bx: number, by: number) {
    const view = this.view;
    const cam = view.cam;
    const r = this.radius / cam.zoom;
    const wax = cam.x + ax / cam.zoom;
    const way = cam.y + ay / cam.zoom;
    const wbx = cam.x + bx / cam.zoom;
    const wby = cam.y + by / cam.zoom;
    const world = {
      minX: Math.min(wax, wbx) - r,
      minY: Math.min(way, wby) - r,
      maxX: Math.max(wax, wbx) + r,
      maxY: Math.max(way, wby) + r
    };

    for (const index of view.pagesIn(world)) {
      const page = view.doc.pageAt(index);
      const ox = view.pageX(index);
      const oy = view.pageY(index);
      const lax = wax - ox;
      const lay = way - oy;
      const lbx = wbx - ox;
      const lby = wby - oy;
      const hits = page.tree.search({
        minX: world.minX - ox,
        minY: world.minY - oy,
        maxX: world.maxX - ox,
        maxY: world.maxY - oy
      });

      const remove: Item[] = [];
      const pieces = new Map<Item, Stroke[]>();
      for (const hit of hits) {
        const item = hit.item;
        // a shape can not be cut, it goes as a whole in both modes
        if (item.type === 'shape' && !this.markersOnly) {
          if (inkNear(item, lax, lay, lbx, lby, r)) remove.push(item);
          continue;
        }
        if (item.type !== 'stroke') continue;
        if (this.markersOnly && item.pen !== 'highlighter') continue;
        const reach = r + item.size / 2;
        if (this.mode === 'stroke') {
          if (strokeNear(item.pts, lax, lay, lbx, lby, reach)) remove.push(item);
          continue;
        }
        const cut = cutStroke(item.pts, lax, lay, lbx, lby, reach);
        if (!cut) continue;
        remove.push(item);
        // crumbs shorter than the pen is wide only look like dirt
        const kept = cut.filter((pts) => pathLength(pts) >= item.size * 0.5);
        pieces.set(
          item,
          kept.map((pts) => ({ ...item, id: newId(), pts }))
        );
      }
      if (remove.length === 0) continue;
      if (!this.before.has(page.meta.id)) this.before.set(page.meta.id, page.items.slice());

      // the pieces of a line take its place, so nothing jumps above or below
      const insert: Placed[] = [];
      if (pieces.size > 0) {
        const order = remove.map((item) => ({ item, index: page.items.indexOf(item) })).sort((a, b) => a.index - b.index);
        let shift = 0;
        for (const { item, index } of order) {
          const list = pieces.get(item) ?? [];
          list.forEach((piece, i) => insert.push({ item: piece, index: index + shift + i }));
          shift += list.length - 1;
        }
      }
      view.doc.changeItems(page.meta.id, remove, insert);
    }
  }
}
