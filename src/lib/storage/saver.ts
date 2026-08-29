import type { Doc, DocChange } from '$lib/engine/doc';
import { penIsDown } from '$lib/engine/input';
import { writeChanges, type PageRecord } from './db';

export type SaveState = 'saved' | 'saving' | 'failed';

// what one write put into storage
export interface SaveReport {
  pages: string[];
  deleted: string[];
  notebook: boolean;
}

export interface SaverHooks {
  state?: (state: SaveState) => void;
  saved?: (report: SaveReport) => void;
}

// ms after the last change before the notebook is written
export const SAVE_DELAY = 800;
const PEN_WAIT = 200;
const RETRY = 5000;
// new ink alone does not touch the notebook record, only its date is
// refreshed now and then so the library knows when it was last changed
const TOUCH_EVERY = 60000;

// writes the open notebook by itself. only the pages that changed are
// written, the notebook record only when its page list, name or paper did
export class Saver {
  state: SaveState = 'saved';
  last: SaveReport | null = null;
  private dirty = new Set<string>();
  // the page ids that are in storage right now
  private stored: Set<string>;
  private notebookDirty = false;
  private touched = false;
  private touchedAt = Date.now();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  private off: () => void;

  constructor(
    private doc: Doc,
    private hooks: SaverHooks = {}
  ) {
    this.stored = new Set(doc.notebook.pages.map((p) => p.id));
    this.off = doc.on(this.onChange);
  }

  get pending(): boolean {
    return this.dirty.size > 0 || this.notebookDirty || this.timer !== null;
  }

  // writes what is left right away, also with the pen down. for hiding the
  // tab, closing the notebook and switching to another one
  flush(): Promise<void> {
    this.stop();
    this.queue = this.queue.then(() => this.write(true));
    return this.queue;
  }

  // resolves once the writes asked for so far are through
  settled(): Promise<void> {
    return this.queue;
  }

  close() {
    this.closed = true;
    this.stop();
    this.off();
  }

  private onChange = (change: DocChange) => {
    if (change.type === 'items') {
      this.dirty.add(change.pageId);
      this.touched = true;
    } else if (change.type === 'loaded') {
      // a page that got ink before it arrived can be written now
      if (!this.dirty.has(change.pageId)) return;
    } else {
      this.notebookDirty = true;
    }
    this.schedule(SAVE_DELAY);
  };

  private schedule(delay: number) {
    if (this.closed) return;
    // a failed save keeps saying so until a write works again
    if (this.state !== 'failed') this.setState('saving');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(this.tick, delay);
  }

  private stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private tick = () => {
    this.timer = null;
    // never in the middle of a stroke, the write waits until the pen lifts
    if (penIsDown()) {
      this.timer = setTimeout(this.tick, PEN_WAIT);
      return;
    }
    this.queue = this.queue.then(() => this.write(false));
  };

  private async write(final: boolean) {
    // a deleted notebook must not come back with a late write
    if (this.closed) return;
    const notebook = this.doc.notebook;
    const ids = notebook.pages.map((p) => p.id);
    const current = new Set(ids);
    const deleted = [...this.stored].filter((id) => !current.has(id));
    const pages: PageRecord[] = [];
    const later = new Set<string>();
    for (const id of ids) {
      if (this.stored.has(id) && !this.dirty.has(id)) continue;
      const page = this.doc.page(id);
      // a page whose items are still in storage would be written empty
      if (!page || !page.ready) {
        later.add(id);
        continue;
      }
      pages.push({ id, notebookId: notebook.id, items: page.items });
    }
    const now = Date.now();
    const touch = this.touched && (final || now - this.touchedAt >= TOUCH_EVERY);
    const withNotebook = this.notebookDirty || deleted.length > 0 || touch;

    if (pages.length === 0 && !withNotebook) {
      this.dirty = later;
      if (!this.pending) this.setState('saved');
      return;
    }

    // changes from now on mark their pages again for the next write
    this.dirty = later;
    this.notebookDirty = false;
    if (withNotebook) {
      this.touched = false;
      this.touchedAt = now;
    }
    try {
      await writeChanges({ notebook: withNotebook ? notebook : undefined, pages, deleted });
    } catch {
      for (const page of pages) this.dirty.add(page.id);
      if (withNotebook) this.notebookDirty = true;
      this.setState('failed');
      this.schedule(RETRY);
      return;
    }
    for (const id of deleted) this.stored.delete(id);
    for (const page of pages) this.stored.add(page.id);
    this.last = { pages: pages.map((p) => p.id), deleted, notebook: withNotebook };
    this.hooks.saved?.(this.last);
    if (this.state === 'failed') this.setState('saving');
    if (!this.pending) this.setState('saved');
  }

  private setState(state: SaveState) {
    if (state === this.state) return;
    this.state = state;
    this.hooks.state?.(state);
  }
}
