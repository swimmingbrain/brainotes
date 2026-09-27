// the cache only needs a size and a close, so tests can hand it plain objects
export interface Picture {
  width: number;
  height: number;
  close(): void;
}

export interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Shot<P extends Picture = ImageBitmap> extends Part {
  id: string;
  key: string;
  scale: number;
  // the whole page, else only the part x, y, w, h (in points)
  full: boolean;
  picture: P;
}

export function pageKey(file: string, page: number): string {
  return `${file}:${page}`;
}

export function shotId(key: string, scale: number, part?: Part): string {
  const s = scale.toFixed(4);
  return part ? `${key}@${s}:${part.x},${part.y},${part.w},${part.h}` : `${key}@${s}`;
}

// not blurry and not so big that drawing it is a waste
export function sharp(shot: { scale: number }, scale: number): boolean {
  return shot.scale >= scale * 0.95 && shot.scale <= scale * 2;
}

// the best whole page for a scale, and the sharp parts made for it on top
export function pickShots<P extends Picture>(shots: Shot<P>[], scale: number): { base: Shot<P> | null; parts: Shot<P>[] } {
  let base: Shot<P> | null = null;
  let above: Shot<P> | null = null;
  const parts: Shot<P>[] = [];
  for (const shot of shots) {
    if (!shot.full) {
      if (Math.abs(shot.scale - scale) <= scale * 0.01) parts.push(shot);
      continue;
    }
    if (shot.scale >= scale * 0.95 && (!above || shot.scale < above.scale)) above = shot;
    if (!base || shot.scale > base.scale) base = shot;
  }
  return { base: above ?? base, parts };
}

// the shots not looked at for the longest close first once there are too many pixels
export class ShotCache<P extends Picture = ImageBitmap> {
  pixels = 0;
  private lru = new Map<string, Shot<P>>();
  private pages = new Map<string, Shot<P>[]>();

  constructor(
    private maxPixels: number,
    // this many stay whatever their size, the ones on screen never thrash
    private keep: number,
    private perPage: number
  ) {}

  get size(): number {
    return this.lru.size;
  }

  has(id: string): boolean {
    return this.lru.has(id);
  }

  of(key: string): Shot<P>[] {
    return this.pages.get(key) ?? [];
  }

  touch(shot: Shot<P>) {
    if (!this.lru.has(shot.id)) return;
    this.lru.delete(shot.id);
    this.lru.set(shot.id, shot);
  }

  add(shot: Shot<P>) {
    const old = this.lru.get(shot.id);
    if (old) this.remove(old);
    this.lru.set(shot.id, shot);
    const list = this.pages.get(shot.key) ?? [];
    list.push(shot);
    this.pages.set(shot.key, list);
    this.pixels += shot.picture.width * shot.picture.height;
    // a page keeps its smallest shot, the quick one, and the newest others
    if (list.length > this.perPage) {
      const smallest = list.reduce((a, b) => (b.scale < a.scale ? b : a));
      const oldest = list.find((s) => s !== smallest && s !== shot);
      if (oldest) this.remove(oldest);
    }
    this.evict(shot);
  }

  private evict(fresh: Shot<P>) {
    for (const shot of this.lru.values()) {
      if (this.pixels <= this.maxPixels || this.lru.size <= this.keep) return;
      if (shot !== fresh) this.remove(shot);
    }
  }

  remove(shot: Shot<P>) {
    if (this.lru.get(shot.id) !== shot) return;
    this.lru.delete(shot.id);
    const list = this.pages.get(shot.key);
    if (list) {
      const rest = list.filter((s) => s !== shot);
      if (rest.length > 0) this.pages.set(shot.key, rest);
      else this.pages.delete(shot.key);
    }
    this.pixels -= shot.picture.width * shot.picture.height;
    shot.picture.close();
  }

  clear(file?: string) {
    for (const shot of [...this.lru.values()]) {
      if (file === undefined || shot.key.startsWith(file + ':')) this.remove(shot);
    }
  }
}
