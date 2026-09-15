import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { newNotebook, newPageMeta, type PaperSetup } from '$lib/engine/doc';
import type { ImageItem, Item, Shape, Stroke, TextItem } from '$lib/engine/types';
import type { AssetRecord } from './db';
import { FileFormatError, readNotebookFile, withFreshIds, writeNotebookFile, type NotebookFile } from './file';

const SETUP: PaperSetup = { style: 'grid', spacing: 20, color: 'cream', size: 'a4' };

function bytes(n: number, seed: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + seed) & 255;
  return out;
}

// a notebook with every kind of item, a page on a pdf, a clip of that pdf
// and a picture open on the side
function sample(): NotebookFile {
  const notebook = newNotebook('paper', 'Linear algebra', SETUP);
  notebook.pages.push(newPageMeta('paper', SETUP), newPageMeta('paper', SETUP));
  const [first, second] = notebook.pages;
  second.pdf = { assetId: 'pdf1', page: 3, x: 0, y: 0, w: 595, h: 421 };
  notebook.refs = ['pdf1', 'pic2'];
  const stroke: Stroke = {
    id: 's1',
    type: 'stroke',
    pen: 'fountain',
    color: '#1f5fd1',
    size: 3.5,
    pts: new Float32Array([10.123, 20.456, 0.25, 30.5, 40.25, 0.5, 52.777, 41.001, 0.75])
  };
  const marker: Stroke = { ...stroke, id: 's2', pen: 'highlighter', color: '#ffd43b', size: 18 };
  const shape: Shape = { id: 'r1', type: 'shape', kind: 'arrow', x1: 1, y1: 2, x2: 300, y2: 40, color: '#d63a3a', size: 2 };
  const text: TextItem = { id: 't1', type: 'text', x: 40, y: 500, w: 220, text: 'Eigenwerte: λ₁ = 2\nok', size: 18, color: '#1f1f22' };
  const clip: ImageItem = {
    id: 'i1',
    type: 'image',
    assetId: 'pic1',
    x: 100,
    y: 200,
    w: 300,
    h: 120,
    source: { assetId: 'pdf1', page: 3, x: 50, y: 60, w: 400, h: 160 }
  };
  const assets: AssetRecord[] = [
    { id: 'pdf1', notebookId: notebook.id, kind: 'pdf', name: 'slides.pdf', type: 'application/pdf', blob: new Blob([bytes(5000, 1)]), pageCount: 12 },
    { id: 'pic1', notebookId: notebook.id, kind: 'image', name: 'clip', type: 'image/png', blob: new Blob([bytes(900, 2)]), w: 1111, h: 444 },
    { id: 'pic2', notebookId: notebook.id, kind: 'image', name: 'board.jpg', type: 'image/jpeg', blob: new Blob([bytes(700, 3)]), w: 800, h: 600 }
  ];
  return { notebook, pages: { [first.id]: [stroke, marker, shape, text], [second.id]: [clip] }, assets };
}

async function blobBytes(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

describe('the .brainotes file', () => {
  it('brings back strokes, shapes, text, pictures, pdf pages and reference files', async () => {
    const file = sample();
    const blob = await writeNotebookFile(file, () => Promise.resolve());
    const back = await readNotebookFile(blob);

    expect(back.notebook).toEqual(file.notebook);
    const [first, second] = file.notebook.pages;
    const items = back.pages[first.id];
    expect(items).toHaveLength(4);
    const stroke = items[0] as Stroke;
    expect(stroke.pts).toBeInstanceOf(Float32Array);
    // points are kept to 2 decimals
    const original = file.pages[first.id][0] as Stroke;
    stroke.pts.forEach((v, i) => expect(Math.abs(v - original.pts[i])).toBeLessThan(0.006));
    expect({ ...stroke, pts: null }).toEqual({ ...original, pts: null });
    expect((items[1] as Stroke).pen).toBe('highlighter');
    expect(items.slice(2)).toEqual(file.pages[first.id].slice(2));
    expect(back.pages[second.id]).toEqual(file.pages[second.id]);

    expect(back.assets.map((a) => ({ ...a, blob: null }))).toEqual(file.assets.map((a) => ({ ...a, blob: null })));
    for (let i = 0; i < file.assets.length; i++) {
      expect(await blobBytes(back.assets[i].blob)).toEqual(await blobBytes(file.assets[i].blob));
      expect(back.assets[i].blob.type).toBe(file.assets[i].type);
    }
  });

  it('is a zip with the pages compressed and the files stored as they are', async () => {
    const file = sample();
    const data = new Uint8Array(await (await writeNotebookFile(file)).arrayBuffer());
    const seen: Record<string, number> = {};
    unzipSync(data, {
      filter: (f) => {
        seen[f.name] = f.compression;
        return false;
      }
    });
    expect(seen['manifest.json']).toBe(8);
    expect(seen['notebook.json']).toBe(8);
    expect(seen[`pages/${file.notebook.pages[0].id}.json`]).toBe(8);
    // the empty page has no file
    expect(seen[`pages/${file.notebook.pages[2].id}.json`]).toBeUndefined();
    expect(seen['assets/pdf1.pdf']).toBe(0);
    expect(seen['assets/pic1.png']).toBe(0);
    expect(seen['assets/pic2.jpg']).toBe(0);
    const manifest = JSON.parse(new TextDecoder().decode(unzipSync(data, { filter: (f) => f.name === 'manifest.json' })['manifest.json']));
    expect(manifest.format).toBe('brainotes');
    expect(manifest.version).toBe(1);
  });

  it('gives an import new ids everywhere and keeps what points where', async () => {
    const read = await readNotebookFile(await writeNotebookFile(sample()));
    const a = withFreshIds(read);
    const b = withFreshIds(read);
    expect(a.notebook.id).not.toBe(read.notebook.id);
    expect(a.notebook.id).not.toBe(b.notebook.id);
    expect(a.notebook.name).toBe('Linear algebra');

    const assetIds = new Set(a.assets.map((x) => x.id));
    expect(a.assets.every((x) => x.notebookId === a.notebook.id)).toBe(true);
    expect(read.assets.some((x) => assetIds.has(x.id))).toBe(false);
    expect(a.notebook.refs.every((id) => assetIds.has(id))).toBe(true);

    const pdfPage = a.notebook.pages[1];
    expect(pdfPage.id).not.toBe(read.notebook.pages[1].id);
    expect(assetIds.has(pdfPage.pdf!.assetId)).toBe(true);
    const clip = a.pages[pdfPage.id][0] as ImageItem;
    expect(clip.id).not.toBe('i1');
    expect(assetIds.has(clip.assetId)).toBe(true);
    // the clip still leads back to the same pdf as the page
    expect(clip.source!.assetId).toBe(pdfPage.pdf!.assetId);

    const all = (f: NotebookFile) => Object.values(f.pages).flat().map((item: Item) => item.id);
    expect(all(a).some((id) => all(b).includes(id))).toBe(false);
    expect(Object.keys(a.pages).every((id) => a.notebook.pages.some((p) => p.id === id))).toBe(true);
  });

  it('turns down files that are not notebooks', async () => {
    await expect(readNotebookFile(new Blob(['%PDF-1.7 not a zip']))).rejects.toBeInstanceOf(FileFormatError);
    const other = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'something', version: 1 })) });
    await expect(readNotebookFile(new Blob([other]))).rejects.toThrow('not a brainotes file');
    const newer = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'brainotes', version: 99, assets: [] })) });
    await expect(readNotebookFile(new Blob([newer]))).rejects.toMatchObject({ newer: true });
  });
});
