import type { Doc, PageData } from '$lib/engine/doc';
import { penIsDown } from '$lib/engine/input';
import type { Item } from '$lib/engine/types';
import { getPages } from './db';
import { unpackItems } from './pack';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// pages are read when they get near the view and then stay in memory, so
// hundreds of pages open as fast as one
export class PageLoader {
  private waiting = new Map<string, Promise<void>>();
  private closed = false;
  // pages that could not be read, each one is told about once
  private broken = new Set<string>();

  constructor(
    private doc: Doc,
    private failed: (index: number) => void = () => {}
  ) {}

  near(first: number, last: number) {
    const pages = this.doc.notebook.pages;
    const ids: string[] = [];
    for (let i = Math.max(0, first); i <= Math.min(last, pages.length - 1); i++) {
      const id = pages[i].id;
      if (!this.doc.isReady(id) && !this.waiting.has(id)) ids.push(id);
    }
    if (ids.length > 0) this.load(ids);
  }

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
    let records: Awaited<ReturnType<typeof getPages>>;
    try {
      records = await getPages(ids);
    } catch {
      // the pages stay as they are and the next try reads them again
      return;
    }
    // one page that can not be unpacked must not keep the others out
    const lists: (Item[] | null)[] = [];
    for (const record of records) {
      try {
        lists.push(record ? await unpackItems(record) : []);
      } catch {
        lists.push(null);
      }
    }
    // indexing a page full of ink is real work, it waits for the pen to lift
    while (penIsDown() && !this.closed) await sleep(100);
    if (this.closed) return;
    ids.forEach((id, i) => {
      const list = lists[i];
      if (list) this.doc.fill(id, list);
      else if (!this.broken.has(id)) {
        this.broken.add(id);
        this.failed(this.doc.indexOf(id));
      }
    });
  }
}
