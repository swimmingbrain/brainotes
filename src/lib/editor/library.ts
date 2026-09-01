import { get } from 'svelte/store';
import { plugActions } from './actions';
import { showNotebook, type Session } from './canvas';
import { Doc, newNotebook } from '$lib/engine/doc';
import type { Notebook, NotebookKind } from '$lib/engine/types';
import { deleteNotebook, getNotebook, importNotebook, listNotebooks, putNotebook } from '$lib/storage/db';
import { PageLoader } from '$lib/storage/loader';
import { packItems } from '$lib/storage/pack';
import { Saver } from '$lib/storage/saver';
import {
  activeTool,
  addToast,
  library,
  notebookOpen,
  saveState,
  starting,
  type NotebookSummary
} from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';

// the id of the notebook that was open last, empty once it was closed
const LAST_KEY = 'brainotes-last';

let session: Session | null = null;
// library work runs one step after the other, a double click must not
// open two notebooks at once
let queue: Promise<void> = Promise.resolve();

function run(work: () => Promise<void>): Promise<void> {
  queue = queue.then(work).catch((err) => {
    console.error(err);
    addToast('Something went wrong with the browser storage', 'error');
  });
  return queue;
}

function summary(notebook: Notebook): NotebookSummary {
  return {
    id: notebook.id,
    name: notebook.name,
    kind: notebook.kind,
    pageCount: notebook.pages.length,
    modifiedAt: notebook.updatedAt
  };
}

function newestFirst(list: NotebookSummary[]): NotebookSummary[] {
  return list.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

function remember(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {}
}

function lastOpened(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

async function refresh() {
  const all = await listNotebooks();
  library.set(newestFirst(all.map(summary)));
}

// for code that writes notebooks into storage on its own, like an import
export function refreshLibrary(): Promise<void> {
  return run(refresh);
}

// the open notebook's row follows what is in memory, it is added when it
// came into storage some other way
function updateRow() {
  if (!session) return;
  const row = summary(session.doc.notebook);
  library.update((list) => newestFirst([row, ...list.filter((n) => n.id !== row.id)]));
}

function uniqueName(base: string): string {
  const names = new Set(get(library).map((n) => n.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

// ready means the pages are all in memory already, a new notebook has
// nothing to read
function start(notebook: Notebook, ready: boolean) {
  const doc = new Doc(notebook, ready ? {} : null);
  const loader = new PageLoader(doc);
  const saver = new Saver(doc, {
    state: (state) => saveState.set(state),
    saved: updateRow
  });
  session = { doc, loader, saver };
  saveState.set('saved');
  updateRow();
  showNotebook(session);
  notebookOpen.set(true);
  remember(notebook.id);
}

async function stop() {
  const current = session;
  if (!current) return;
  session = null;
  current.loader.close();
  await current.saver.flush();
  current.saver.close();
}

function hide() {
  showNotebook(null);
  notebookOpen.set(false);
  saveState.set('saved');
  remember('');
}

// a new notebook goes into storage before anything else changes, so a
// failed write leaves the open one as it was
async function create(kind: NotebookKind, name: string): Promise<Notebook> {
  const notebook = newNotebook(kind, name, get(preferences).paper);
  const empty = await packItems([]);
  const pages = notebook.pages.map((p) => ({ id: p.id, notebookId: notebook.id, ...empty }));
  await importNotebook(notebook, pages);
  library.update((list) => [summary(notebook), ...list]);
  return notebook;
}

// reads the library and opens the notebook from last time. the very first
// launch gets a notebook to write in right away
export function startLibrary(): () => void {
  void navigator.storage?.persist?.().catch(() => {});

  const flush = () => {
    void session?.saver.flush();
  };
  const onvisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onvisibility);
  window.addEventListener('pagehide', flush);

  void run(async () => {
    try {
      const all = newestFirst((await listNotebooks()).map(summary));
      library.set(all);
      const last = lastOpened();
      if (all.length === 0 && last === null) {
        start(await create('paper', 'My notes'), true);
        activeTool.set('pen');
      } else {
        // no note of the last one means its record got lost, the newest will do
        const id = last ?? all[0]?.id;
        const notebook = id ? await getNotebook(id) : undefined;
        if (notebook) start(notebook, false);
      }
    } catch (err) {
      // no storage at all (a locked down browser): notes still work, they
      // just do not stay
      console.error(err);
      addToast('This browser does not let brainotes keep your notes', 'warning', 6000);
      start(newNotebook('paper', 'My notes', get(preferences).paper), true);
    } finally {
      starting.set(false);
    }
  });

  return () => {
    document.removeEventListener('visibilitychange', onvisibility);
    window.removeEventListener('pagehide', flush);
  };
}

plugActions({
  newNotebook: (kind) => {
    void run(async () => {
      const notebook = await create(kind, uniqueName(kind === 'board' ? 'Whiteboard' : 'Notebook'));
      await stop();
      start(notebook, true);
    });
  },
  openNotebook: (id) => {
    void run(async () => {
      if (session?.doc.notebook.id === id) return;
      const notebook = await getNotebook(id);
      if (!notebook) {
        addToast('That notebook is not there any more', 'warning');
        await refresh();
        return;
      }
      await stop();
      start(notebook, false);
    });
  },
  closeNotebook: () => {
    void run(async () => {
      await stop();
      hide();
    });
  },
  renameNotebook: (name, id) => {
    if (!id || id === session?.doc.notebook.id) {
      // the saver writes it with the next save
      session?.doc.rename(name);
      updateRow();
      return;
    }
    void run(async () => {
      const notebook = await getNotebook(id);
      if (!notebook) return;
      notebook.name = name;
      await putNotebook(notebook);
      await refresh();
    });
  },
  deleteNotebook: (id) => {
    void run(async () => {
      if (session?.doc.notebook.id === id) {
        const current = session;
        session = null;
        current.loader.close();
        current.saver.close();
        // a write that was already on its way finishes before the delete
        await current.saver.settled();
        hide();
      }
      await deleteNotebook(id);
      await refresh();
    });
  }
});
