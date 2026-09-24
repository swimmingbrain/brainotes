import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { newId } from '$lib/engine/doc';
import type { Item, Notebook, PageMeta } from '$lib/engine/types';
import type { AssetKind, AssetRecord } from './db';
import { itemsFromJson, itemsToJson } from './pack';

// a notebook as a .brainotes file: a zip with manifest.json, notebook.json,
// one json file per page with ink, and the pdfs and pictures as they are
export const FORMAT = 'brainotes';
export const VERSION = 1;

export interface NotebookFile {
  notebook: Notebook;
  // items by page id, a page without any has no entry
  pages: Record<string, Item[]>;
  assets: AssetRecord[];
}

interface AssetEntry {
  id: string;
  kind: AssetKind;
  name: string;
  type: string;
  w?: number;
  h?: number;
  pageCount?: number;
  file: string;
}

interface Manifest {
  format: string;
  version: number;
  assets: AssetEntry[];
}

export class FileFormatError extends Error {
  constructor(
    message: string,
    readonly newer = false
  ) {
    super(message);
  }
}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp'
};
// a big file goes into the zip in pieces, with a breath in between
const PIECE = 4 << 20;
// pages read from the zip in one go
const GROUP = 25;

type Pause = () => Promise<void>;

const noPause: Pause = () => Promise.resolve();

function pagePath(id: string): string {
  return `pages/${id}.json`;
}

export async function writeNotebookFile(file: NotebookFile, pause: Pause = noPause): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  let failed: Error | null = null;
  const zip = new Zip((err, data) => {
    if (err) failed = err;
    else chunks.push(data);
  });
  const add = (name: string, text: string) => {
    const entry = new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    entry.push(strToU8(text), true);
  };

  const entries: AssetEntry[] = file.assets.map((a) => {
    const entry: AssetEntry = { id: a.id, kind: a.kind, name: a.name, type: a.type, file: '' };
    if (a.w !== undefined) entry.w = a.w;
    if (a.h !== undefined) entry.h = a.h;
    if (a.pageCount !== undefined) entry.pageCount = a.pageCount;
    entry.file = `assets/${a.id}.${EXTENSIONS[a.type] ?? (a.kind === 'pdf' ? 'pdf' : 'bin')}`;
    return entry;
  });
  const manifest: Manifest = { format: FORMAT, version: VERSION, assets: entries };
  add('manifest.json', JSON.stringify(manifest));
  add('notebook.json', JSON.stringify(file.notebook));

  for (const meta of file.notebook.pages) {
    const items = file.pages[meta.id];
    if (!items || items.length === 0) continue;
    add(pagePath(meta.id), JSON.stringify({ items: itemsToJson(items) }));
    await pause();
  }

  // pdfs and pictures are compressed already, they are stored as they are
  for (let i = 0; i < file.assets.length; i++) {
    const bytes = new Uint8Array(await file.assets[i].blob.arrayBuffer());
    const entry = new ZipPassThrough(entries[i].file);
    zip.add(entry);
    if (bytes.length === 0) entry.push(bytes, true);
    for (let at = 0; at < bytes.length; at += PIECE) {
      entry.push(bytes.subarray(at, at + PIECE), at + PIECE >= bytes.length);
      await pause();
    }
  }
  zip.end();
  if (failed) throw failed;
  return new Blob(chunks as Uint8Array<ArrayBuffer>[], { type: 'application/zip' });
}

function json(bytes: Uint8Array | undefined): unknown {
  if (!bytes) return undefined;
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    return undefined;
  }
}

const STYLES = ['blank', 'lines', 'grid', 'dots'];
const COLORS = ['white', 'cream', 'dark'];

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// a page the canvas can draw, a paper it does not know would break it
function isPage(p: PageMeta): boolean {
  if (!p || typeof p.id !== 'string' || !isNumber(p.w) || !isNumber(p.h) || p.w <= 0 || p.h <= 0) return false;
  const paper = p.paper;
  if (!paper || !STYLES.includes(paper.style) || !COLORS.includes(paper.color) || !isNumber(paper.spacing) || paper.spacing <= 0) {
    return false;
  }
  const bg = p.pdf;
  return !bg || (typeof bg.assetId === 'string' && [bg.page, bg.x, bg.y, bg.w, bg.h].every(isNumber));
}

function isNotebook(value: unknown): value is Notebook {
  const nb = value as Notebook;
  return (
    !!nb &&
    typeof nb.id === 'string' &&
    typeof nb.name === 'string' &&
    (nb.kind === 'paper' || nb.kind === 'board') &&
    Array.isArray(nb.pages) &&
    nb.pages.every(isPage) &&
    new Set(nb.pages.map((p) => p.id)).size === nb.pages.length
  );
}

export async function readNotebookFile(blob: Blob, pause: Pause = noPause): Promise<NotebookFile> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const pick = (names: Set<string>) => unzipSync(data, { filter: (f) => names.has(f.name) });
  let head;
  try {
    head = pick(new Set(['manifest.json', 'notebook.json']));
  } catch {
    throw new FileFormatError('not a zip file');
  }
  const manifest = json(head['manifest.json']) as Manifest | undefined;
  if (!manifest || manifest.format !== FORMAT) throw new FileFormatError('not a brainotes file');
  if (typeof manifest.version !== 'number' || manifest.version > VERSION) {
    throw new FileFormatError('made by a newer version', true);
  }
  const notebook = json(head['notebook.json']);
  if (!isNotebook(notebook)) throw new FileFormatError('the notebook in it is broken');
  notebook.refs = Array.isArray(notebook.refs) ? notebook.refs : [];

  // pages a few at a time, a big notebook must not hold the tab up
  const pages: Record<string, Item[]> = {};
  const ids = notebook.pages.map((p) => p.id);
  for (let i = 0; i < ids.length; i += GROUP) {
    const group = ids.slice(i, i + GROUP);
    const found = pick(new Set(group.map(pagePath)));
    for (const id of group) {
      const page = json(found[pagePath(id)]) as { items?: unknown } | undefined;
      const items = itemsFromJson(page?.items);
      if (items.length > 0) pages[id] = items;
    }
    await pause();
  }

  const assets: AssetRecord[] = [];
  for (const entry of Array.isArray(manifest.assets) ? manifest.assets : []) {
    if (!entry || typeof entry.file !== 'string' || typeof entry.id !== 'string') continue;
    const bytes = pick(new Set([entry.file]))[entry.file];
    if (!bytes) continue;
    const asset: AssetRecord = {
      id: entry.id,
      notebookId: notebook.id,
      kind: entry.kind === 'pdf' ? 'pdf' : 'image',
      name: String(entry.name ?? ''),
      type: String(entry.type ?? ''),
      blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: String(entry.type ?? '') })
    };
    if (entry.w !== undefined) asset.w = entry.w;
    if (entry.h !== undefined) asset.h = entry.h;
    if (entry.pageCount !== undefined) asset.pageCount = entry.pageCount;
    assets.push(asset);
    await pause();
  }
  return { notebook, pages, assets };
}

// an import is always a new notebook: every id in it is new, so the same
// file read twice gives two notebooks that do not share anything
export function withFreshIds(file: NotebookFile): NotebookFile {
  const ids = new Map<string, string>();
  const fresh = (id: string) => {
    let next = ids.get(id);
    if (!next) {
      next = newId();
      ids.set(id, next);
    }
    return next;
  };
  const notebookId = newId();
  const now = Date.now();
  const pages: Record<string, Item[]> = {};
  const metas = file.notebook.pages.map((meta) => {
    const id = fresh(meta.id);
    const next: PageMeta = { ...meta, id, paper: { ...meta.paper } };
    if (meta.pdf) next.pdf = { ...meta.pdf, assetId: fresh(meta.pdf.assetId) };
    const items = file.pages[meta.id];
    if (items) {
      pages[id] = items.map((item) => {
        if (item.type !== 'image') return { ...item, id: newId() };
        const image = { ...item, id: newId(), assetId: fresh(item.assetId) };
        if (item.source) image.source = { ...item.source, assetId: fresh(item.source.assetId) };
        return image;
      });
    }
    return next;
  });
  return {
    notebook: { ...file.notebook, id: notebookId, createdAt: now, updatedAt: now, pages: metas, refs: file.notebook.refs.map(fresh) },
    pages,
    assets: file.assets.map((asset) => ({ ...asset, id: fresh(asset.id), notebookId }))
  };
}
