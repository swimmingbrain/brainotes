import type { Item, Stroke } from '$lib/engine/types';

// a page as it is stored: the points of every stroke one after the other
// as 32 bit floats, everything else as json, both as blobs. the browser
// copies whatever goes into storage in one go on the main thread, a list
// of 10,000 strokes as objects took it about 75 ms. blobs are put
// together from small ones made slice by slice, so nothing big is copied
// at once
export interface PackedItems {
  items: Blob;
  pts: Blob;
}

// ms of packing before the next slice
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
