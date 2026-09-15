// decoded pictures by asset id. a decoded photo is big, so only so many
// pixels stay around, the ones used longest ago are closed first
const MAX_PIXELS = 40_000_000;
// these stay whatever their size, so the pictures on screen never thrash
const KEEP = 6;

interface Entry {
  bitmap: ImageBitmap | null;
  failed: boolean;
}

type Loader = (assetId: string) => Promise<Blob | undefined>;

let load: Loader | null = null;
// a map keeps its order, the last one used is moved to the end
const cache = new Map<string, Entry>();
const listeners = new Set<(assetId: string) => void>();
let pixels = 0;

// where the blobs come from, the storage hands its reader in
export function setImageLoader(fn: Loader) {
  load = fn;
}

// called with the asset id once a picture is ready to draw
export function onBitmap(fn: (assetId: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function store(assetId: string, bitmap: ImageBitmap) {
  const old = cache.get(assetId);
  if (old?.bitmap && old.bitmap !== bitmap) {
    pixels -= old.bitmap.width * old.bitmap.height;
    old.bitmap.close();
  }
  cache.delete(assetId);
  cache.set(assetId, { bitmap, failed: false });
  pixels += bitmap.width * bitmap.height;
  evict();
  for (const fn of listeners) fn(assetId);
}

function evict() {
  for (const [id, entry] of cache) {
    if (pixels <= MAX_PIXELS || cache.size <= KEEP) return;
    if (!entry.bitmap) continue;
    pixels -= entry.bitmap.width * entry.bitmap.height;
    entry.bitmap.close();
    cache.delete(id);
  }
}

// a picture that was just imported is decoded already
export function rememberBitmap(assetId: string, bitmap: ImageBitmap) {
  store(assetId, bitmap);
}

async function decode(assetId: string) {
  try {
    const blob = load ? await load(assetId) : undefined;
    if (!blob) throw new Error('no blob');
    const bitmap = await createImageBitmap(blob);
    // dropped while it was decoding
    if (!cache.has(assetId)) {
      bitmap.close();
      return;
    }
    store(assetId, bitmap);
  } catch {
    const entry = cache.get(assetId);
    if (entry) entry.failed = true;
  }
}

// null until the picture is decoded, the first ask starts the decoding
export function bitmapFor(assetId: string): ImageBitmap | null {
  const entry = cache.get(assetId);
  if (entry) {
    if (entry.bitmap) {
      cache.delete(assetId);
      cache.set(assetId, entry);
    }
    return entry.bitmap;
  }
  if (typeof createImageBitmap === 'undefined') return null;
  cache.set(assetId, { bitmap: null, failed: false });
  void decode(assetId);
  return null;
}

// for an export: waits until the picture is decoded, null when it can not be
export function bitmapReady(assetId: string): Promise<ImageBitmap | null> {
  const now = bitmapFor(assetId);
  if (now || cache.get(assetId)?.failed) return Promise.resolve(now);
  return new Promise((resolve) => {
    const check = () => {
      const entry = cache.get(assetId);
      if (entry?.bitmap || entry?.failed || !entry) {
        listeners.delete(onDone);
        clearInterval(timer);
        resolve(entry?.bitmap ?? null);
      }
    };
    const onDone = (id: string) => {
      if (id === assetId) check();
    };
    listeners.add(onDone);
    // a failed decode tells nobody, it is looked for now and then
    const timer = setInterval(check, 100);
  });
}

// another notebook opens, its pictures are others
export function clearBitmaps() {
  for (const entry of cache.values()) entry.bitmap?.close();
  cache.clear();
  pixels = 0;
}
