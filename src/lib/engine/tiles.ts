import type { Camera } from './camera';
import type { Box } from './types';

// tiles are squares of the world rendered at one exact scale (device
// pixels per unit). drawing a frame is then only a few drawImage calls
export const TILE = 512;
const MIN_CANVASES = 64;
const MAX_TILES = 4096;
const POOL = 16;

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

// paints what lies in box. it calls open() only when there is something to
// draw, open hands out the tile canvas already set to world units
export type Paint = (box: Box, open: () => TileCtx) => void;

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

function makeCanvas(): TileCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(TILE, TILE);
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  return canvas;
}

export class TileLayer {
  scale = 0;
  private tiles = new Map<number, Tile>();
  // the tiles of the scale before a zoom, shown stretched until the new
  // ones are ready
  private old: { scale: number; tiles: Map<number, Tile> } | null = null;
  private pool: TileCanvas[] = [];
  private canvases = 0;
  private stamp = 0;
  private missing: number[] = [];
  private range: TileRange = { x0: 0, y0: 0, x1: -1, y1: -1 };
  private ring: TileRange = { x0: 0, y0: 0, x1: -1, y1: -1 };
  private scratch: TileRange = { x0: 0, y0: 0, x1: -1, y1: -1 };

  constructor(private paint: Paint) {}

  get busy(): boolean {
    return this.old !== null;
  }

  setScale(scale: number) {
    if (scale === this.scale) return;
    if (this.old) this.releaseAll(this.tiles);
    else if (this.tiles.size > 0) this.old = { scale: this.scale, tiles: this.tiles };
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

    // nearest to the middle first, at least one per frame so it never stalls
    const midX = (range.x0 + range.x1) / 2;
    const midY = (range.y0 + range.y1) / 2;
    let rendered = 0;
    while (missing.length > 0 && (rendered === 0 || performance.now() < deadline)) {
      const i = this.nearest(missing, midX, midY);
      const tile = this.render(missing[i], missing[i + 1]);
      missing.splice(i, 2);
      this.blit(ctx, tile, cam, target);
      rendered++;
    }

    if (missing.length > 0) {
      this.drawOld(ctx, cam, target);
    } else if (this.old) {
      this.releaseAll(this.old.tiles);
      this.old = null;
    }

    let more = missing.length > 0;
    if (!more && prefetch) more = this.prefetch(deadline);
    this.evict(range);
    return more;
  }

  // a new stroke goes straight into the tiles that are already there
  drawInto(box: Box, draw: (ctx: TileCtx) => void) {
    this.each(this.tiles, this.scale, box, (tile) => {
      const ctx = this.open(tile, this.scale);
      ctx.save();
      draw(ctx);
      ctx.restore();
    });
    const old = this.old;
    if (old) {
      this.each(old.tiles, old.scale, box, (tile) => {
        const ctx = this.open(tile, old.scale);
        ctx.save();
        draw(ctx);
        ctx.restore();
      });
    }
  }

  // tiles on screen are rendered again right away so nothing flickers,
  // the others are dropped and come back when needed
  invalidate(box: Box) {
    const range = this.range;
    this.each(this.tiles, this.scale, box, (tile) => {
      this.release(tile);
      this.tiles.delete(tileKey(tile.tx, tile.ty));
      if (tile.tx >= range.x0 && tile.tx <= range.x1 && tile.ty >= range.y0 && tile.ty <= range.y1) {
        this.render(tile.tx, tile.ty).used = this.stamp;
      }
    });
    const old = this.old;
    if (old) {
      this.each(old.tiles, old.scale, box, (tile) => {
        this.release(tile);
        old.tiles.delete(tileKey(tile.tx, tile.ty));
      });
    }
  }

  clear() {
    this.releaseAll(this.tiles);
    this.tiles = new Map();
    if (this.old) this.releaseAll(this.old.tiles);
    this.old = null;
  }

  private each(map: Map<number, Tile>, scale: number, box: Box, fn: (tile: Tile) => void) {
    const r = tilesFor(box, scale, this.scratch);
    const count = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    const found: Tile[] = [];
    if (count > map.size) {
      for (const tile of map.values()) {
        if (tile.tx >= r.x0 && tile.tx <= r.x1 && tile.ty >= r.y0 && tile.ty <= r.y1) found.push(tile);
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

  // the stretched tiles of the old scale, only where new ones are missing
  private drawOld(ctx: CanvasRenderingContext2D, cam: Camera, target: number) {
    const old = this.old;
    if (!old) return;
    const span = TILE / this.scale;
    const size = (TILE * target) / this.scale;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < this.missing.length; i += 2) {
      ctx.rect((this.missing[i] * span - cam.x) * target, (this.missing[i + 1] * span - cam.y) * target, size, size);
    }
    ctx.clip();
    const oldSpan = TILE / old.scale;
    const oldSize = (TILE * target) / old.scale;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    for (const tile of old.tiles.values()) {
      if (!tile.canvas) continue;
      const x = (tile.tx * oldSpan - cam.x) * target;
      const y = (tile.ty * oldSpan - cam.y) * target;
      if (x > w || y > h || x + oldSize < 0 || y + oldSize < 0) continue;
      ctx.drawImage(tile.canvas, x, y, oldSize, oldSize);
    }
    ctx.restore();
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
        this.render(tx, ty).used = this.stamp;
      }
    }
    return false;
  }

  private render(tx: number, ty: number): Tile {
    const span = TILE / this.scale;
    const tile: Tile = { tx, ty, canvas: null, ctx: null, used: this.stamp };
    const box = { minX: tx * span, minY: ty * span, maxX: (tx + 1) * span, maxY: (ty + 1) * span };
    const scale = this.scale;
    this.paint(box, () => this.open(tile, scale));
    this.tiles.set(tileKey(tx, ty), tile);
    return tile;
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
