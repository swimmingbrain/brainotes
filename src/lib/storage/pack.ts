import type { Item, Stroke } from '$lib/engine/types';

// points as 32 bit floats, the rest as json. 10,000 strokes stored as objects
// took the browser about 75 ms to copy in one go
export interface PackedItems {
  items: Blob;
  pts: Blob;
}

// ms of packing per slice
const SLICE = 4;
const CHUNK = 500;

type Bare = Omit<Stroke, 'pts'> & { n: number };

// pause is awaited between slices, without one it all happens at once
export async function packItems(items: Item[], pause?: () => Promise<void>): Promise<PackedItems> {
  const texts: BlobPart[] = ['['];
  const floats: Blob[] = [];
  let started = performance.now();
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    let total = 0;
    for (const item of chunk) if (item.type === 'stroke') total += item.pts.length;
    const pts = new Float32Array(total);
    let offset = 0;
    const bare = chunk.map((item) => {
      if (item.type !== 'stroke') return item;
      pts.set(item.pts, offset);
      offset += item.pts.length;
      // undefined keys are left out of the json
      return { ...item, pts: undefined, n: item.pts.length / 3 };
    });
    if (i > 0) texts.push(',');
    texts.push(new Blob([JSON.stringify(bare).slice(1, -1)]));
    floats.push(new Blob([pts]));
    const more = i + CHUNK < items.length;
    if (pause && more && performance.now() - started > SLICE) {
      await pause();
      started = performance.now();
    }
  }
  texts.push(']');
  return { items: new Blob(texts, { type: 'application/json' }), pts: new Blob(floats) };
}

export async function unpackItems(packed: PackedItems): Promise<Item[]> {
  const [text, buffer] = await Promise.all([packed.items.text(), packed.pts.arrayBuffer()]);
  const all = new Float32Array(buffer);
  const list = JSON.parse(text) as (Item | Bare)[];
  let offset = 0;
  return list.map((raw) => {
    if (raw.type !== 'stroke') return raw;
    const { n, ...rest } = raw as Bare;
    const pts = all.slice(offset, offset + n * 3);
    offset += n * 3;
    return { ...rest, pts };
  });
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// strokes keep their points as a plain list, rounded to 2 decimals
export function itemsToJson(items: Item[]): unknown[] {
  return items.map((item) => (item.type === 'stroke' ? { ...item, pts: Array.from(item.pts, round) } : item));
}

const TYPES = new Set(['stroke', 'shape', 'text', 'image']);

// what a file says a page holds, anything that is not an item is left out
export function itemsFromJson(list: unknown): Item[] {
  if (!Array.isArray(list)) return [];
  const items: Item[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || !TYPES.has(raw.type) || typeof raw.id !== 'string') continue;
    if (raw.type === 'stroke') {
      if (!Array.isArray(raw.pts) || raw.pts.length < 3) continue;
      items.push({ ...raw, pts: Float32Array.from(raw.pts.slice(0, raw.pts.length - (raw.pts.length % 3)), Number) });
    } else {
      items.push(raw as Item);
    }
  }
  return items;
}
