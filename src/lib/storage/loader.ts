import type { Doc, PageData } from '$lib/engine/doc';
import { penIsDown } from '$lib/engine/input';
import type { Item } from '$lib/engine/types';
import { getPages } from './db';
import { unpackItems } from './pack';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// the items of a page are read from storage when the page gets near the
// view, then they stay in memory while the notebook is open. so a notebook
// with hundreds of pages opens as fast as one with a single page
export class PageLoader {
  private waiting = new Map<string, Promise<void>>();
  private closed = false;

  constructor(private doc: Doc) {}

  // pages first to last (indices) should be in memory soon
  near(first: number, last: number) {
    const pages = this.doc.notebook.pages;
    const ids: string[] = [];
    for (let i = Math.max(0, first); i <= Math.min(last, pages.length - 1); i++) {
      const id = pages[i].id;
      if (!this.doc.isReady(id) && !this.waiting.has(id)) ids.push(id);
    }
    if (ids.length > 0) this.load(ids);
  }

  // the page with its items, for work that needs all of them
  async ensure(id: string): Promise<PageData | undefined> {
    if (!this.doc.isReady(id)) {
      if (!this.waiting.has(id)) this.load([id]);
      await this.waiting.get(id);
    }
    return this.doc.page(id);
  }

  close() {
    this.closed = true;
  }

  private load(ids: string[]) {
    const job = this.read(ids);
    for (const id of ids) this.waiting.set(id, job);
    void job.finally(() => {
      for (const id of ids) this.waiting.delete(id);
    });
  }

  private async read(ids: string[]) {
    let lists: Item[][];
    try {
      const records = await getPages(ids);
      lists = await Promise.all(records.map((record) => (record ? unpackItems(record) : [])));
    } catch {
      // the pages stay as they are and the next try reads them again
      return;
    }
    // indexing a page full of ink is real work, it waits for the pen to lift
    while (penIsDown() && !this.closed) await sleep(100);
    if (this.closed) return;
    ids.forEach((id, i) => this.doc.fill(id, lists[i]));
  }
}
