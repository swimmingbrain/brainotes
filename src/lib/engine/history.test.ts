import { describe, expect, it } from 'vitest';
import { Doc, newNotebook, newPageData, newPageMeta, type DocChange, type PaperSetup } from './doc';
import { History, HISTORY_LIMIT } from './history';
import type { Stroke } from './types';

const SETUP: PaperSetup = { style: 'dots', spacing: 24, color: 'white', size: 'a4' };

let n = 0;
function stroke(x: number, y: number): Stroke {
  return { id: `s${n++}`, type: 'stroke', pen: 'ballpoint', color: '#000', size: 2, pts: new Float32Array([x, y, 0.5, x + 10, y + 5, 0.5]) };
}

function setup() {
  const doc = new Doc(newNotebook('paper', 'Test', SETUP));
  const history = new History(doc);
  const pageId = doc.notebook.pages[0].id;
  return { doc, history, pageId, page: () => doc.page(pageId)! };
}

function add(history: History, pageId: string, index: number, item: Stroke) {
  history.run({ type: 'items', pageId, removed: [], added: [{ item, index }] });
}

describe('doc', () => {
  it('appends items and finds them in the index', () => {
    const { doc, pageId, page } = setup();
    const a = stroke(0, 0);
    const b = stroke(100, 100);
    doc.addItems(pageId, [a, b]);
    expect(page().items).toEqual([a, b]);
    const hits = page().tree.search({ minX: 95, minY: 95, maxX: 120, maxY: 120 });
    expect(hits.map((e) => e.item)).toEqual([b]);
  });

  it('tells what changed and where', () => {
    const { doc, pageId } = setup();
    const changes: DocChange[] = [];
    doc.on((c) => changes.push(c));
    const a = stroke(0, 0);
    doc.addItems(pageId, [a]);
    expect(changes).toHaveLength(1);
    const change = changes[0];
    expect(change.type).toBe('items');
    if (change.type !== 'items') return;
    expect(change.append).toBe(true);
    expect(change.box.minX).toBeLessThanOrEqual(0);
    expect(change.box.maxX).toBeGreaterThanOrEqual(10);
  });

  it('keeps the order when items go back in the middle', () => {
    const { doc, pageId, page } = setup();
    const items = [stroke(0, 0), stroke(1, 1), stroke(2, 2), stroke(3, 3)];
    doc.addItems(pageId, items);
    const removed = doc.changeItems(pageId, [items[1], items[2]], []);
    expect(removed.map((p) => p.index)).toEqual([1, 2]);
    expect(page().items).toEqual([items[0], items[3]]);
    doc.changeItems(pageId, [], removed);
    expect(page().items).toEqual(items);
    doc.ensureOrder(page());
    const all = page().tree.all().sort((a, b) => a.z - b.z);
    expect(all.map((e) => e.item)).toEqual(items);
  });
});

describe('history', () => {
  it('undoes and redoes a stroke', () => {
    const { history, pageId, page } = setup();
    const a = stroke(0, 0);
    add(history, pageId, 0, a);
    expect(page().items).toEqual([a]);
    expect(history.canUndo).toBe(true);
    history.undo();
    expect(page().items).toEqual([]);
    expect(page().tree.all()).toHaveLength(0);
    expect(history.canRedo).toBe(true);
    history.redo();
    expect(page().items).toEqual([a]);
  });

  it('undoes an erase that cut one stroke into pieces', () => {
    const { history, doc, pageId, page } = setup();
    const items = [stroke(0, 0), stroke(1, 1), stroke(2, 2)];
    doc.addItems(pageId, items);
    const left = stroke(1, 1);
    const right = stroke(5, 5);
    history.run({
      type: 'items',
      pageId,
      removed: [{ item: items[1], index: 1 }],
      added: [
        { item: left, index: 1 },
        { item: right, index: 2 }
      ]
    });
    expect(page().items).toEqual([items[0], left, right, items[2]]);
    history.undo();
    expect(page().items).toEqual(items);
    history.redo();
    expect(page().items).toEqual([items[0], left, right, items[2]]);
  });

  it('a new op clears the redo stack', () => {
    const { history, pageId } = setup();
    add(history, pageId, 0, stroke(0, 0));
    history.undo();
    add(history, pageId, 0, stroke(1, 1));
    expect(history.canRedo).toBe(false);
  });

  it('forgets the oldest ops past the limit', () => {
    const { history, pageId, page } = setup();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) add(history, pageId, i, stroke(i, i));
    let undone = 0;
    while (history.undo()) undone++;
    expect(undone).toBe(HISTORY_LIMIT);
    expect(page().items).toHaveLength(20);
  });

  it('undoes page adds, deletes and moves', () => {
    const { history, doc } = setup();
    const first = doc.notebook.pages[0];
    const second = newPageData(newPageMeta('paper', SETUP));
    history.run({ type: 'page-add', index: 1, page: second });
    expect(doc.notebook.pages.map((p) => p.id)).toEqual([first.id, second.meta.id]);

    history.run({ type: 'page-move', from: 1, to: 0 });
    expect(doc.notebook.pages.map((p) => p.id)).toEqual([second.meta.id, first.id]);

    const ink = stroke(0, 0);
    doc.addItems(first.id, [ink]);
    history.run({ type: 'page-remove', index: 1, page: doc.page(first.id)! });
    expect(doc.pageCount).toBe(1);
    expect(doc.page(first.id)).toBeUndefined();

    history.undo();
    expect(doc.pageCount).toBe(2);
    expect(doc.page(first.id)!.items).toEqual([ink]);
    history.undo();
    expect(doc.notebook.pages.map((p) => p.id)).toEqual([first.id, second.meta.id]);
    history.undo();
    expect(doc.pageCount).toBe(1);
  });

  it('undoes a paper change', () => {
    const { history, doc, pageId } = setup();
    const before = { ...doc.page(pageId)!.meta.paper };
    history.run({ type: 'paper', pageId, before, after: { ...before, style: 'grid' } });
    expect(doc.page(pageId)!.meta.paper.style).toBe('grid');
    history.undo();
    expect(doc.page(pageId)!.meta.paper.style).toBe('dots');
  });

  it('plays a batch backwards in reverse order', () => {
    const { history, pageId, page } = setup();
    const a = stroke(0, 0);
    const b = stroke(1, 1);
    history.run({
      type: 'batch',
      ops: [
        { type: 'items', pageId, removed: [], added: [{ item: a, index: 0 }] },
        { type: 'items', pageId, removed: [], added: [{ item: b, index: 1 }] }
      ]
    });
    expect(page().items).toEqual([a, b]);
    history.undo();
    expect(page().items).toEqual([]);
  });
});
