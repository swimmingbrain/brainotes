import RBush from 'rbush';
import { emptyBox, growBox, itemBox } from './bounds';
import type { Box, Item, Notebook, NotebookKind, PageMeta, Paper } from './types';
import type { PageSize } from '$lib/stores/preferences';

// what the spatial index holds. z is the place of the item in the page,
// tiles sort by it so the newest ink stays on top
export interface Entry extends Box {
  item: Item;
  z: number;
}

export interface Placed {
  item: Item;
  index: number;
}

export interface PageData {
  meta: PageMeta;
  items: Item[];
  tree: RBush<Entry>;
}

export type DocChange =
  | { type: 'items'; pageId: string; box: Box; added: Item[]; removed: Item[]; append: boolean }
  | { type: 'pages' }
  | { type: 'paper'; pageId: string }
  | { type: 'name' };

// page sizes in points, like a pdf
export const PAGE_POINTS: Record<PageSize, { w: number; h: number }> = {
  a4: { w: 595, h: 842 },
  letter: { w: 612, h: 792 },
  wide: { w: 960, h: 540 }
};

export interface PaperSetup extends Paper {
  size: PageSize;
}

let counter = 0;

export function newId(): string {
  counter = (counter + 1) % 46656;
  const rand = Math.floor(Math.random() * 1679616).toString(36);
  return Date.now().toString(36) + counter.toString(36).padStart(3, '0') + rand;
}

export function newPageMeta(kind: NotebookKind, setup: PaperSetup): PageMeta {
  // a board has no edges, the wide size is only its frame for thumbnails
  const size = kind === 'board' ? PAGE_POINTS.wide : PAGE_POINTS[setup.size];
  return {
    id: newId(),
    w: size.w,
    h: size.h,
    paper: { style: setup.style, spacing: setup.spacing, color: setup.color }
  };
}

export function newNotebook(kind: NotebookKind, name: string, setup: PaperSetup): Notebook {
  const now = Date.now();
  return { id: newId(), name, kind, createdAt: now, updatedAt: now, pages: [newPageMeta(kind, setup)], refs: [] };
}

const entries = new WeakMap<Item, Entry>();

function makeEntry(item: Item, z: number): Entry {
  const box = itemBox(item);
  const entry = { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY, item, z };
  entries.set(item, entry);
  return entry;
}

export function newPageData(meta: PageMeta, items: Item[] = []): PageData {
  const tree = new RBush<Entry>(16);
  tree.load(items.map(makeEntry));
  return { meta, items, tree };
}

export class Doc {
  notebook: Notebook;
  private loaded = new Map<string, PageData>();
  private unordered = new Set<PageData>();
  private listeners = new Set<(change: DocChange) => void>();

  constructor(notebook: Notebook, items: Record<string, Item[]> = {}) {
    this.notebook = notebook;
    for (const meta of notebook.pages) this.loaded.set(meta.id, newPageData(meta, items[meta.id]));
  }

  get kind(): NotebookKind {
    return this.notebook.kind;
  }

  get pageCount(): number {
    return this.notebook.pages.length;
  }

  page(id: string): PageData | undefined {
    return this.loaded.get(id);
  }

  // a page that is not loaded yet shows up empty until its items arrive
  pageAt(index: number): PageData {
    const meta = this.notebook.pages[index];
    let page = this.loaded.get(meta.id);
    if (!page) {
      page = newPageData(meta);
      this.loaded.set(meta.id, page);
    }
    return page;
  }

  indexOf(pageId: string): number {
    return this.notebook.pages.findIndex((p) => p.id === pageId);
  }

  on(fn: (change: DocChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(change: DocChange) {
    this.notebook.updatedAt = Date.now();
    for (const fn of this.listeners) fn(change);
  }

  // takes `remove` out and puts `insert` in. insert is sorted by index and
  // the indices count in the array as it is afterwards. returns where the
  // removed items were, so the change can be undone
  changeItems(pageId: string, remove: Item[], insert: Placed[]): Placed[] {
    const page = this.loaded.get(pageId);
    if (!page) return [];
    const box = emptyBox();
    const removed: Placed[] = [];

    if (remove.length > 0) {
      const gone = new Set(remove);
      const kept: Item[] = [];
      const items = page.items;
      for (let i = 0; i < items.length; i++) {
        if (gone.has(items[i])) removed.push({ item: items[i], index: i });
        else kept.push(items[i]);
      }
      for (const { item } of removed) {
        const entry = entries.get(item);
        if (entry) page.tree.remove(entry);
        growBox(box, itemBox(item));
      }
      page.items = kept;
    }

    let append = removed.length === 0;
    if (append && insert.every((p, i) => p.index === page.items.length + i)) {
      for (const p of insert) {
        page.tree.insert(makeEntry(p.item, page.items.length));
        page.items.push(p.item);
        growBox(box, itemBox(p.item));
      }
    } else {
      append = false;
      const kept = page.items;
      const out: Item[] = new Array(kept.length + insert.length);
      let k = 0;
      let j = 0;
      for (let i = 0; i < out.length; i++) {
        if (j < insert.length && (insert[j].index <= i || k >= kept.length)) out[i] = insert[j++].item;
        else out[i] = kept[k++];
      }
      page.items = out;
      for (const p of insert) {
        page.tree.insert(makeEntry(p.item, 0));
        growBox(box, itemBox(p.item));
      }
      this.unordered.add(page);
    }

    if (removed.length > 0 || insert.length > 0) {
      this.emit({ type: 'items', pageId, box, added: insert.map((p) => p.item), removed: remove, append });
    }
    return removed;
  }

  addItems(pageId: string, items: Item[]) {
    const page = this.loaded.get(pageId);
    if (!page) return;
    const start = page.items.length;
    this.changeItems(
      pageId,
      [],
      items.map((item, i) => ({ item, index: start + i }))
    );
  }

  // after inserts in the middle the z values are renumbered once, the next
  // time someone needs them in order
  ensureOrder(page: PageData) {
    if (!this.unordered.has(page)) return;
    const items = page.items;
    for (let i = 0; i < items.length; i++) {
      const entry = entries.get(items[i]);
      if (entry) entry.z = i;
    }
    this.unordered.delete(page);
  }

  insertPage(index: number, page: PageData) {
    this.loaded.set(page.meta.id, page);
    this.notebook.pages.splice(index, 0, page.meta);
    this.emit({ type: 'pages' });
  }

  removePage(index: number): PageData {
    const page = this.pageAt(index);
    this.notebook.pages.splice(index, 1);
    this.loaded.delete(page.meta.id);
    this.emit({ type: 'pages' });
    return page;
  }

  movePage(from: number, to: number) {
    const [meta] = this.notebook.pages.splice(from, 1);
    this.notebook.pages.splice(to, 0, meta);
    this.emit({ type: 'pages' });
  }

  setPaper(pageId: string, paper: Paper) {
    const page = this.loaded.get(pageId);
    if (!page) return;
    page.meta.paper = { ...paper };
    this.emit({ type: 'paper', pageId });
  }

  rename(name: string) {
    this.notebook.name = name;
    this.emit({ type: 'name' });
  }
}
