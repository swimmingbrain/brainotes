import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Doc, newNotebook, newPageData, newPageMeta, type PaperSetup } from '$lib/engine/doc';
import { History } from '$lib/engine/history';
import type { Stroke } from '$lib/engine/types';
import { deleteNotebook, getAsset, getNotebook, getPage, importNotebook, listAssets, listNotebooks, putAsset } from './db';
import { PageLoader } from './loader';
import { SAVE_DELAY, Saver } from './saver';

const SETUP: PaperSetup = { style: 'lines', spacing: 24, color: 'cream', size: 'a4' };

let n = 0;
function stroke(x: number, y: number): Stroke {
  return {
    id: `s${n++}`,
    type: 'stroke',
    pen: 'fountain',
    color: '#1f5fd1',
    size: 3.5,
    pts: new Float32Array([x, y, 0.25, x + 12.5, y + 4.75, 0.5, x + 20, y + 1, 0.75])
  };
}

// a notebook with some pages, written to storage the way a new one is
async function storedDoc(pages: number) {
  const notebook = newNotebook('paper', 'Test', SETUP);
  for (let i = 1; i < pages; i++) notebook.pages.push(newPageMeta('paper', SETUP));
  const doc = new Doc(notebook);
  const records = notebook.pages.map((p) => ({ id: p.id, notebookId: notebook.id, items: [] }));
  await importNotebook(structuredClone(notebook), records);
  return { doc, ids: notebook.pages.map((p) => p.id) };
}

describe('storage', () => {
  it('reads back a notebook with its strokes', async () => {
    const doc = new Doc(newNotebook('paper', 'Round trip', SETUP));
    const pageId = doc.notebook.pages[0].id;
    const items = [stroke(0, 0), stroke(40, 80)];
    doc.addItems(pageId, items);
    await importNotebook(doc.notebook, [{ id: pageId, notebookId: doc.notebook.id, items: doc.page(pageId)!.items }]);

    const notebook = await getNotebook(doc.notebook.id);
    expect(notebook).toEqual(doc.notebook);
    expect((await listNotebooks()).some((nb) => nb.id === doc.notebook.id)).toBe(true);

    // opened again, the page waits in storage until someone asks for it
    const lazy = new Doc(notebook!, null);
    expect(lazy.isReady(pageId)).toBe(false);
    const page = await new PageLoader(lazy).ensure(pageId);
    expect(page!.ready).toBe(true);
    expect(page!.items).toHaveLength(2);
    const back = page!.items[1] as Stroke;
    expect(back.pts).toBeInstanceOf(Float32Array);
    expect(Array.from(back.pts)).toEqual(Array.from(items[1].pts));
    expect({ ...back, pts: null }).toEqual({ ...items[1], pts: null });
    expect(page!.tree.search({ minX: 35, minY: 75, maxX: 70, maxY: 90 })).toHaveLength(1);
  });

  it('deletes a notebook with its pages and files', async () => {
    const { doc, ids } = await storedDoc(3);
    const id = doc.notebook.id;
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    await putAsset({ id: 'a1', notebookId: id, kind: 'pdf', name: 'slides.pdf', type: 'application/pdf', blob, pageCount: 3 });
    expect(await listAssets(id)).toHaveLength(1);
    await deleteNotebook(id);
    expect(await getNotebook(id)).toBeUndefined();
    for (const pageId of ids) expect(await getPage(pageId)).toBeUndefined();
    expect(await getAsset('a1')).toBeUndefined();
  });
});

describe('saver', () => {
  beforeEach(() => {
    // only the save delay is faked, the database keeps its own clock
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function wait(saver: Saver) {
    vi.advanceTimersByTime(SAVE_DELAY);
    await saver.settled();
  }

  it('writes only the pages that changed', async () => {
    const { doc, ids } = await storedDoc(3);
    const saver = new Saver(doc);
    doc.addItems(ids[1], [stroke(10, 10)]);
    expect(saver.state).toBe('saving');
    vi.advanceTimersByTime(SAVE_DELAY - 100);
    doc.addItems(ids[1], [stroke(20, 20)]);
    await wait(saver);
    expect(saver.last).toEqual({ pages: [ids[1]], deleted: [], notebook: false });
    expect(saver.state).toBe('saved');
    expect((await getPage(ids[1]))!.items).toHaveLength(2);
    expect((await getPage(ids[0]))!.items).toHaveLength(0);
    saver.close();
  });

  it('writes the page list, removes deleted pages and brings them back on undo', async () => {
    const { doc, ids } = await storedDoc(2);
    const history = new History(doc);
    const saver = new Saver(doc);
    doc.addItems(ids[0], [stroke(5, 5)]);
    await wait(saver);

    const added = newPageData(newPageMeta('paper', SETUP));
    history.run({ type: 'page-add', index: 2, page: added });
    await wait(saver);
    expect(saver.last).toEqual({ pages: [added.meta.id], deleted: [], notebook: true });
    expect((await getNotebook(doc.notebook.id))!.pages).toHaveLength(3);

    history.run({ type: 'page-remove', index: 0, page: doc.pageAt(0) });
    await wait(saver);
    expect(saver.last).toEqual({ pages: [], deleted: [ids[0]], notebook: true });
    expect(await getPage(ids[0])).toBeUndefined();

    history.undo();
    await wait(saver);
    expect(saver.last).toEqual({ pages: [ids[0]], deleted: [], notebook: true });
    expect((await getPage(ids[0]))!.items).toHaveLength(1);
    expect((await getNotebook(doc.notebook.id))!.pages.map((p) => p.id)).toEqual([ids[0], ids[1], added.meta.id]);
    saver.close();
  });

  it('writes the notebook record for a new name or paper', async () => {
    const { doc, ids } = await storedDoc(1);
    const saver = new Saver(doc);
    doc.rename('Lectures');
    await wait(saver);
    expect(saver.last).toEqual({ pages: [], deleted: [], notebook: true });
    doc.setPaper(ids[0], { style: 'grid', spacing: 20, color: 'white' });
    await wait(saver);
    const notebook = await getNotebook(doc.notebook.id);
    expect(notebook!.name).toBe('Lectures');
    expect(notebook!.pages[0].paper.style).toBe('grid');
    saver.close();
  });

  it('never writes a page before its items are loaded', async () => {
    const { doc, ids } = await storedDoc(1);
    const first = new Saver(doc);
    doc.addItems(ids[0], [stroke(1, 1), stroke(2, 2)]);
    await wait(first);
    first.close();

    // the notebook opened again, ink lands on the page before it is read
    const lazy = new Doc((await getNotebook(doc.notebook.id))!, null);
    const saver = new Saver(lazy);
    lazy.addItems(ids[0], [stroke(3, 3)]);
    await wait(saver);
    expect(saver.last).toBeNull();
    expect(saver.state).toBe('saving');
    expect((await getPage(ids[0]))!.items).toHaveLength(2);

    await new PageLoader(lazy).ensure(ids[0]);
    await wait(saver);
    expect(saver.last!.pages).toEqual([ids[0]]);
    expect((await getPage(ids[0]))!.items.map((i) => i.id)).toEqual(lazy.page(ids[0])!.items.map((i) => i.id));
    expect(saver.state).toBe('saved');
    saver.close();
  });

  it('a flush writes at once and refreshes the date of the notebook', async () => {
    const { doc, ids } = await storedDoc(1);
    const saver = new Saver(doc);
    doc.addItems(ids[0], [stroke(1, 1)]);
    await saver.flush();
    expect(saver.last).toEqual({ pages: [ids[0]], deleted: [], notebook: true });
    expect((await getNotebook(doc.notebook.id))!.updatedAt).toBe(doc.notebook.updatedAt);
    saver.close();
  });
});
