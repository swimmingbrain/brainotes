import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { runCommand } from './commands';
import { showNotebook } from '$lib/editor/canvas';
import { Doc, newNotebook, newPageMeta, type PaperSetup } from '$lib/engine/doc';
import type { Item, Shape, Stroke, TextItem } from '$lib/engine/types';
import type { PageLoader } from '$lib/storage/loader';
import type { Saver } from '$lib/storage/saver';
import { library, notebookTex } from '$lib/stores/app';

const SETUP: PaperSetup = { style: 'lines', spacing: 24, color: 'white', size: 'a4' };

type Any = Record<string, any>;
const run = (name: string, args: Record<string, unknown> = {}): Promise<Any> => runCommand(name, args) as Promise<Any>;

// a notebook in memory as if the library had opened it, without a canvas
function open(): Doc {
  const notebook = newNotebook('paper', 'Analysis', SETUP);
  notebook.pages.push(newPageMeta('paper', SETUP));
  notebook.pages[1].pdf = { assetId: 'pdf1', page: 2, x: 0, y: 0, w: 595, h: 842 };
  const stroke: Stroke = {
    id: 's1',
    type: 'stroke',
    pen: 'ballpoint',
    color: '#1f1f22',
    size: 2,
    pts: new Float32Array([10.04, 20.06, 0.333, 30.56, 25.12, 0.5])
  };
  const text: TextItem = { id: 't1', type: 'text', x: 40.04, y: 100, w: 200, text: 'f(x) = x^2', size: 18, color: '#1f1f22' };
  const shape: Shape = { id: 'r1', type: 'shape', kind: 'rect', x1: 1, y1: 2, x2: 300.06, y2: 40, color: '#d63a3a', size: 2.5 };
  const items: Record<string, Item[]> = { [notebook.pages[0].id]: [stroke, text, shape] };
  const doc = new Doc(notebook, items);
  const loader = { ensure: async (id: string) => doc.page(id), close() {}, near() {} } as unknown as PageLoader;
  showNotebook({ doc, loader, saver: {} as Saver });
  return doc;
}

describe('the bridge commands', () => {
  afterEach(() => {
    showNotebook(null);
    library.set([]);
  });

  it('answers unknown command for anything it does not have', async () => {
    for (const name of ['nope', 'toString', '__proto__', 'constructor']) {
      await expect(run(name)).rejects.toThrow(/^unknown command$/);
    }
  });

  it('says that no notebook is open to every command that needs one', async () => {
    const needs = ['pages', 'goto', 'page_image', 'page_strokes', 'add_text', 'add_image', 'new_page', 'link', 'export_pdf'];
    for (const name of needs) {
      await expect(run(name, { page: 0 })).rejects.toThrow(/No notebook is open/);
    }
  });

  it('reports the version and no notebook when nothing is open', async () => {
    const status = await run('status');
    expect(status.notebook).toBeNull();
    expect(status.page).toBeNull();
    expect(typeof status.version).toBe('string');
    expect(status.tool).toBe('pen');
  });

  it('lists the notebooks of this browser with their texbrain link', async () => {
    library.set([
      { id: 'a', name: 'Analysis', kind: 'paper', pageCount: 3, modifiedAt: 2, tex: 'analysis-script' },
      { id: 'b', name: 'Board', kind: 'board', pageCount: 1, modifiedAt: 1, tex: '' }
    ]);
    expect(await run('notebooks')).toEqual([
      { id: 'a', name: 'Analysis', kind: 'paper', pages: 3, updatedAt: 2, tex: 'analysis-script' },
      { id: 'b', name: 'Board', kind: 'board', pages: 1, updatedAt: 1, tex: null }
    ]);
  });

  it('tells the open notebook and its pages', async () => {
    const doc = open();
    const status = await run('status');
    expect(status.notebook).toEqual({ id: doc.notebook.id, name: 'Analysis', kind: 'paper', pages: 2, tex: null });
    expect(status.page).toBe(0);
    const pages = await run('pages');
    expect(pages).toEqual([
      { index: 0, id: doc.notebook.pages[0].id, w: 595, h: 842, items: 3, pdf: false },
      { index: 1, id: doc.notebook.pages[1].id, w: 595, h: 842, items: 0, pdf: true }
    ]);
  });

  it('reads what is on a page with the points to one decimal', async () => {
    open();
    const page = await run('page_strokes', { page: 0 });
    expect(page.w).toBe(595);
    expect(page.strokes).toEqual([
      {
        id: 's1',
        pen: 'ballpoint',
        color: '#1f1f22',
        size: 2,
        box: { x: 9, y: 19.1, w: 22.5, h: 7.1 },
        points: [
          [10, 20.1, 0.33],
          [30.6, 25.1, 0.5]
        ]
      }
    ]);
    expect(page.texts).toEqual([{ id: 't1', x: 40, y: 100, w: 200, text: 'f(x) = x^2', size: 18, color: '#1f1f22' }]);
    expect(page.shapes).toEqual([{ id: 'r1', kind: 'rect', x1: 1, y1: 2, x2: 300.1, y2: 40, color: '#d63a3a', size: 2.5 }]);
    expect(page.images).toEqual([]);
    expect((await run('page_strokes', { page: 1 })).strokes).toEqual([]);
  });

  it('turns down pages that are not there and arguments of the wrong kind', async () => {
    open();
    await expect(run('page_strokes', { page: 2 })).rejects.toThrow('There is no page 2, they go from 0 to 1; see pages');
    await expect(run('page_strokes', { page: -1 })).rejects.toThrow(/no page -1/);
    await expect(run('page_strokes', { page: 'two' })).rejects.toThrow('page must be a number');
    await expect(run('export_pdf', { pages: [] })).rejects.toThrow(/pages must be a list/);
    await expect(run('export_pdf', { pages: [0, 5] })).rejects.toThrow(/no page 5/);
    await expect(run('link', { tex: 42 })).rejects.toThrow(/tex must be a project name or null/);
    await expect(run('open', {})).rejects.toThrow(/id or name/);
    await expect(run('create', { kind: 'scroll' })).rejects.toThrow(/kind must be/);
  });

  it('links the open notebook to a texbrain project and takes the link away again', async () => {
    const doc = open();
    library.set([{ id: doc.notebook.id, name: 'Analysis', kind: 'paper', pageCount: 2, modifiedAt: 1, tex: '' }]);
    expect(await run('link', { tex: ' analysis-script ' })).toEqual({ tex: 'analysis-script' });
    expect(doc.notebook.tex).toBe('analysis-script');
    expect(get(notebookTex)).toBe('analysis-script');
    expect((await run('notebooks'))[0].tex).toBe('analysis-script');
    expect((await run('status')).notebook.tex).toBe('analysis-script');

    expect(await run('link', { tex: null })).toEqual({ tex: null });
    expect('tex' in doc.notebook).toBe(false);
    expect(get(notebookTex)).toBe('');
  });
});
