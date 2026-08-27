import type { Camera } from './camera';
import type { Box } from './types';

// tiles are squares of the world rendered at one exact scale (device
// pixels per unit). drawing a frame is then only a few drawImage calls
export const TILE = 512;
const MIN_CANVASES = 64;
const MAX_TILES = 4096;
const POOL = 16;
const SPARE = 4;
// items per step of a tile that is drawn over several frames
const CHUNK = 48;

type TileCanvas = OffscreenCanvas | HTMLCanvasElement;
export type TileCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

interface Tile {
  tx: number;
  ty: number;
  canvas: TileCanvas | null;
  ctx: TileCtx | null;
  used: number;
}

// inclusive tile indices
export interface TileRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// the drawing of one tile. draw puts up to count more items on the tile
// (set to world units) and says when it is through
export interface TileJob {
  draw(ctx: TileCtx, count: number): boolean;
}

// what lies in box at scale, null when there is nothing to draw
export type Paint = (box: Box, scale: number) => TileJob | null;

export function tileKey(tx: number, ty: number): number {
  return (tx + 1048576) * 2097152 + (ty + 1048576);
}

export function tilesFor(box: Box, scale: number, out: TileRange = { x0: 0, y0: 0, x1: 0, y1: 0 }): TileRange {
  const span = TILE / scale;
  out.x0 = Math.floor(box.minX / span);
  out.y0 = Math.floor(box.minY / span);
  out.x1 = Math.floor(box.maxX / span);
  out.y1 = Math.floor(box.maxY / span);
  return out;
}

export function visibleTiles(cam: Camera, viewW: number, viewH: number, scale: number, out?: TileRange): TileRange {
  const span = TILE / scale;
  out = out ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
  out.x0 = Math.floor(cam.x / span);
  out.y0 = Math.floor(cam.y / span);
  // a view that ends right on a tile edge does not need the next tile
  out.x1 = Math.ceil((cam.x + viewW / cam.zoom) / span) - 1;
  out.y1 = Math.ceil((cam.y + viewH / cam.zoom) / span) - 1;
  return out;
}

function makeCanvas(size = TILE): TileCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function inRange(tile: Tile, r: TileRange): boolean {
  return tile.tx >= r.x0 && tile.tx <= r.x1 && tile.ty >= r.y0 && tile.ty <= r.y1;
}

export class TileLayer {
  scale = 0;
  private tiles = new Map<number, Tile>();
  // tiles half way through their drawing, they only show once complete
  private pending = new Map<number, { tile: Tile; job: TileJob }>();
  // a copy of the screen from when the scale changed. it is shown
  // stretched where the new tiles are not ready yet
  private old: { x: number; y: number; scale: number } | null = null;
  private oldCanvas: TileCanvas | null = null;
  private oldCtx: TileCtx | null = null;
  // the camera of the last compose, so the copy knows where it was taken
  private shown: Camera = { x: 0, y: 0, zoom: 1 };
  private shownScale = 0;
  private pool: TileCanvas[] = [];
  private canvases = 0;
  private stamp = 0;
  private missing: number[] = [];
  private range: TileRange = { x0: 0, y0: 0, x1: -1, y1: -1 };
  private ring: TileRange = { x0: 0, y0: 0, x1: -1, y1: -1 };
  private scratch: TileRange = { x0: 0, y0: 0, x1: -1, y1: -1 };
  private sink: TileCtx | null = null;

  constructor(private paint: Paint) {}

  get busy(): boolean {
    return this.old !== null || this.pending.size > 0;
  }

  // screen is the layer canvas, still showing the last frame
  setScale(scale: number, screen: CanvasRenderingContext2D) {
    if (scale === this.scale) return;
    this.dropPending();
    if (this.shownScale > 0 && (this.tiles.size > 0 || this.old)) {
      const { width, height } = screen.canvas;
      if (!this.oldCanvas || this.oldCanvas.width !== width || this.oldCanvas.height !== height) {
        this.oldCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : makeCanvas();
        this.oldCanvas.width = width;
        this.oldCanvas.height = height;
        this.oldCtx = this.oldCanvas.getContext('2d') as TileCtx;
      }
      const ctx = this.oldCtx!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(screen.canvas, 0, 0);
      this.old = { x: this.shown.x, y: this.shown.y, scale: this.shownScale };
    }
    this.releaseAll(this.tiles);
    this.tiles = new Map();
    this.scale = scale;
  }

  // draws the tiles on screen into ctx and renders the missing ones until
  // the deadline. true means there is more to do next frame
  compose(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    dpr: number,
    viewW: number,
    viewH: number,
    deadline: number,
    prefetch: boolean
  ): boolean {
    const target = cam.zoom * dpr;
    if (this.scale === 0) this.scale = target;
    this.stamp++;
    const range = visibleTiles(cam, viewW, viewH, this.scale, this.range);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const missing = this.missing;
    missing.length = 0;
    for (let ty = range.y0; ty <= range.y1; ty++) {
      for (let tx = range.x0; tx <= range.x1; tx++) {
        const tile = this.tiles.get(tileKey(tx, ty));
        if (tile) {
          tile.used = this.stamp;
          this.blit(ctx, tile, cam, target);
        } else {
          missing.push(tx, ty);
        }
      }
    }

    // nearest to the middle first, at least one step per frame so it never stalls
    const midX = (range.x0 + range.x1) / 2;
    const midY = (range.y0 + range.y1) / 2;
    let first = true;
    while (missing.length > 0 && (first || performance.now() < deadline)) {
      first = false;
      const i = this.nearest(missing, midX, midY);
      const tile = this.work(missing[i], missing[i + 1], deadline);
      if (!tile) break;
      missing.splice(i, 2);
      this.blit(ctx, tile, cam, target);
    }

    if (missing.length > 0) this.drawOld(ctx, cam, target);
    else this.old = null;
    this.shown.x = cam.x;
    this.shown.y = cam.y;
    this.shownScale = target;

    let more = missing.length > 0;
    if (!more && prefetch) more = this.prefetch(deadline);
    this.evict(range);
    return more;
  }

  // a new stroke goes straight into the tiles that are already there
  drawInto(box: Box, draw: (ctx: TileCtx, scale: number) => void) {
    this.dropPending(box);
    this.each(this.tiles, this.scale, box, (tile) => {
      const ctx = this.open(tile, this.scale);
      ctx.save();
      draw(ctx, this.scale);
      ctx.restore();
    });
    const old = this.old;
    if (old && this.oldCtx) {
      const ctx = this.oldCtx;
      ctx.save();
      ctx.setTransform(old.scale, 0, 0, old.scale, -old.x * old.scale, -old.y * old.scale);
      draw(ctx, old.scale);
      ctx.restore();
    }
  }

  // tiles on screen are rendered again right away so nothing flickers,
  // the others are dropped and come back when needed
  invalidate(box: Box) {
    this.dropPending(box);
    const range = this.range;
    this.each(this.tiles, this.scale, box, (tile) => {
      this.release(tile);
      this.tiles.delete(tileKey(tile.tx, tile.ty));
      if (inRange(tile, range)) this.work(tile.tx, tile.ty, Infinity);
    });
    // the copy loses what changed, the fresh tiles cover the hole
    const old = this.old;
    if (old && this.oldCtx) {
      const ctx = this.oldCtx;
      const x = (box.minX - old.x) * old.scale;
      const y = (box.minY - old.y) * old.scale;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(x - 1, y - 1, (box.maxX - box.minX) * old.scale + 2, (box.maxY - box.minY) * old.scale + 2);
    }
  }

  // forgets the tiles in box, the frames render them again in their budget.
  // for ink that arrives from storage, where nothing on screen goes away
  drop(box: Box) {
    this.dropPending(box);
    this.each(this.tiles, this.scale, box, (tile) => {
      this.release(tile);
      this.tiles.delete(tileKey(tile.tx, tile.ty));
    });
  }

  // a new canvas costs a few ms the first time it is drawn on, so some are
  // made ahead in idle time and a stroke on an empty spot never waits
  reserve() {
    while (this.pool.length < SPARE) {
      const canvas = makeCanvas();
      const ctx = canvas.getContext('2d') as TileCtx;
      ctx.fillRect(0, 0, 1, 1);
      ctx.clearRect(0, 0, 1, 1);
      this.pool.push(canvas);
    }
  }

  clear() {
    this.dropPending();
    this.releaseAll(this.tiles);
    this.tiles = new Map();
    this.old = null;
  }

  // starts or goes on with the drawing of a tile. returns the tile once it
  // is complete, null while it still needs more frames
  private work(tx: number, ty: number, deadline: number): Tile | null {
    const key = tileKey(tx, ty);
    let entry = this.pending.get(key);
    if (!entry) {
      const span = TILE / this.scale;
      const job = this.paint({ minX: tx * span, minY: ty * span, maxX: (tx + 1) * span, maxY: (ty + 1) * span }, this.scale);
      const tile: Tile = { tx, ty, canvas: null, ctx: null, used: this.stamp };
      if (!job) {
        this.tiles.set(key, tile);
        return tile;
      }
      entry = { tile, job };
    }
    const { tile, job } = entry;
    let done = false;
    if (deadline === Infinity) {
      done = job.draw(this.open(tile, this.scale), Infinity);
    } else {
      // canvas draws lazily, so after each chunk the tile is made to
      // rasterize and the clock sees what it really cost
      while (!done) {
        done = job.draw(this.open(tile, this.scale), CHUNK);
        this.flush(tile);
        if (performance.now() >= deadline) break;
      }
    }
    tile.used = this.stamp;
    if (!done) {
      this.pending.set(key, entry);
      return null;
    }
    this.pending.delete(key);
    this.tiles.set(key, tile);
    return tile;
  }

  private flush(tile: Tile) {
    if (!tile.canvas) return;
    if (!this.sink) this.sink = makeCanvas(1).getContext('2d') as TileCtx;
    // clearing first lets the canvas forget the copies of earlier flushes
    this.sink.clearRect(0, 0, 1, 1);
    this.sink.drawImage(tile.canvas, 0, 0, 1, 1);
  }

  private dropPending(box?: Box) {
    if (this.pending.size === 0) return;
    const r = box ? tilesFor(box, this.scale, this.scratch) : null;
    for (const [key, { tile }] of this.pending) {
      if (r && !inRange(tile, r)) continue;
      this.release(tile);
      this.pending.delete(key);
    }
  }

  private each(map: Map<number, Tile>, scale: number, box: Box, fn: (tile: Tile) => void) {
    const r = tilesFor(box, scale, this.scratch);
    const count = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    const found: Tile[] = [];
    if (count > map.size) {
      for (const tile of map.values()) {
        if (inRange(tile, r)) found.push(tile);
      }
    } else {
      for (let ty = r.y0; ty <= r.y1; ty++) {
        for (let tx = r.x0; tx <= r.x1; tx++) {
          const tile = map.get(tileKey(tx, ty));
          if (tile) found.push(tile);
        }
      }
    }
    for (const tile of found) fn(tile);
  }

  private nearest(list: number[], midX: number, midY: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < list.length; i += 2) {
      const d = (list[i] - midX) ** 2 + (list[i + 1] - midY) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private blit(ctx: CanvasRenderingContext2D, tile: Tile, cam: Camera, target: number) {
    if (!tile.canvas) return;
    const span = TILE / this.scale;
    const x = (tile.tx * span - cam.x) * target;
    const y = (tile.ty * span - cam.y) * target;
    if (target === this.scale) ctx.drawImage(tile.canvas, Math.round(x), Math.round(y));
    else ctx.drawImage(tile.canvas, x, y, (TILE * target) / this.scale, (TILE * target) / this.scale);
  }

  // the copy of the old screen, stretched to the camera, only where new
  // tiles are missing. one piece per tile, a clip of many rects is slow
  private drawOld(ctx: CanvasRenderingContext2D, cam: Camera, target: number) {
    const old = this.old;
    const canvas = this.oldCanvas;
    if (!old || !canvas) return;
    const span = TILE / this.scale;
    const size = (TILE * target) / this.scale;
    const k = old.scale / target;
    for (let i = 0; i < this.missing.length; i += 2) {
      let dx = (this.missing[i] * span - cam.x) * target;
      let dy = (this.missing[i + 1] * span - cam.y) * target;
      let dw = size;
      let dh = size;
      let sx = (dx / target + cam.x - old.x) * old.scale;
      let sy = (dy / target + cam.y - old.y) * old.scale;
      // keep the source inside the copy, the target shrinks with it
      if (sx < 0) {
        dx -= sx / k;
        dw += sx / k;
        sx = 0;
      }
      if (sy < 0) {
        dy -= sy / k;
        dh += sy / k;
        sy = 0;
      }
      dw = Math.min(dw, (canvas.width - sx) / k);
      dh = Math.min(dh, (canvas.height - sy) / k);
      if (dw <= 0 || dh <= 0) continue;
      ctx.drawImage(canvas, sx, sy, dw * k, dh * k, dx, dy, dw, dh);
    }
  }

  // one ring of tiles around the view, so a small scroll finds them ready
  private prefetch(deadline: number): boolean {
    const r = this.range;
    const ring = this.ring;
    ring.x0 = r.x0 - 1;
    ring.y0 = r.y0 - 1;
    ring.x1 = r.x1 + 1;
    ring.y1 = r.y1 + 1;
    for (let ty = ring.y0; ty <= ring.y1; ty++) {
      for (let tx = ring.x0; tx <= ring.x1; tx++) {
        if (tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1) continue;
        if (this.tiles.has(tileKey(tx, ty))) continue;
        if (performance.now() >= deadline) return true;
        this.work(tx, ty, deadline);
      }
    }
    return false;
  }

  private open(tile: Tile, scale: number): TileCtx {
    if (!tile.ctx) {
      const canvas = this.pool.pop() ?? makeCanvas();
      const ctx = canvas.getContext('2d') as TileCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, TILE, TILE);
      tile.canvas = canvas;
      tile.ctx = ctx;
      this.canvases++;
    }
    tile.ctx.setTransform(scale, 0, 0, scale, -tile.tx * TILE, -tile.ty * TILE);
    return tile.ctx;
  }

  private release(tile: Tile) {
    if (!tile.canvas) return;
    if (this.pool.length < POOL) this.pool.push(tile.canvas);
    tile.canvas = null;
    tile.ctx = null;
    this.canvases--;
  }

  private releaseAll(map: Map<number, Tile>) {
    for (const tile of map.values()) this.release(tile);
  }

  // least recently used tiles go first, never the ones on screen
  private evict(range: TileRange) {
    const visible = (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1);
    const cap = Math.max(MIN_CANVASES, visible * 2 + 16);
    if (this.canvases <= cap && this.tiles.size <= MAX_TILES) return;
    const list = [...this.tiles.values()].filter((t) => t.used !== this.stamp).sort((a, b) => a.used - b.used);
    for (const tile of list) {
      if (this.canvases <= cap * 0.8 && this.tiles.size <= MAX_TILES * 0.8) break;
      this.release(tile);
      this.tiles.delete(tileKey(tile.tx, tile.ty));
    }
  }
}
