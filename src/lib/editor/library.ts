import { get } from 'svelte/store';
import { plugActions } from './actions';
import { commitText, showNotebook, type Session } from './canvas';
import { Doc, newNotebook } from '$lib/engine/doc';
import type { Item, Notebook, NotebookKind } from '$lib/engine/types';
import {
  deleteNotebook,
  getNotebook,
  importNotebook,
  listNotebooks,
  putNotebook,
  type AssetRecord
} from '$lib/storage/db';
import { PageLoader } from '$lib/storage/loader';
import { packItems } from '$lib/storage/pack';
import { dropRescue, keepRescue, recover } from '$lib/storage/rescue';
import { Saver } from '$lib/storage/saver';
import { lockNotebook, openElsewhere, unlockNotebook } from './locks';
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

export function uniqueName(base: string): string {
  const names = new Set(get(library).map((n) => n.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

// ready means the pages are all in memory already, a new notebook has
// nothing to read. the caller holds the lock of the notebook
function start(notebook: Notebook, ready: boolean) {
  const doc = new Doc(notebook, ready ? {} : null);
  const loader = new PageLoader(doc, (index) => addToast(`Page ${index + 1} could not be read from the browser storage`, 'error', 8000));
  const saver = new Saver(doc, {
    state: (state) => {
      saveState.set(state);
      if (state === 'saved') dropRescue(notebook.id);
      // the dot alone is easy to miss, it keeps trying in the meantime
      if (state === 'failed') addToast('Could not save, the browser storage may be full. Trying again...', 'error', 8000);
    },
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
  commitText();
  session = null;
  current.loader.close();
  await current.saver.flush();
  // ink drawn while that write ran goes as well
  if (current.saver.pending) await current.saver.flush();
  current.saver.close();
  // a write that failed leaves its pages in local storage for the next open
  if (current.saver.pending) {
    const name = current.doc.notebook.name;
    if (keepRescue(current.saver.unsaved())) {
      addToast(`The last changes to "${name}" are kept until the browser storage works again`, 'warning', 8000);
    } else {
      addToast(`The last changes to "${name}" could not be stored`, 'error', 8000);
    }
  }
  unlockNotebook(current.doc.notebook.id);
}

function hide() {
  showNotebook(null);
  notebookOpen.set(false);
  saveState.set('saved');
  remember('');
}

// the name in quotes for a toast, another tab may have made the notebook
async function nameOf(id: string): Promise<string> {
  const name = get(library).find((n) => n.id === id)?.name ?? (await getNotebook(id).catch(() => undefined))?.name;
  return name ? `"${name}"` : 'That notebook';
}

// a stored notebook opens unless another tab has it, then this tab stays
// where it is. quiet leaves out the toast for a notebook that is gone
async function openStored(id: string, quiet = false) {
  if (session?.doc.notebook.id === id) return;
  if (!(await lockNotebook(id))) {
    addToast(`${await nameOf(id)} is open in another tab`, 'warning', 5000);
    return;
  }
  // the stored copy is older than what the last tab kept, it waits for that
  if (!(await recover(id))) {
    unlockNotebook(id);
    addToast(`${await nameOf(id)} has changes the browser storage did not take yet, try again in a moment`, 'error', 8000);
    return;
  }
  const notebook = await getNotebook(id);
  if (!notebook) {
    unlockNotebook(id);
    if (!quiet) addToast('That notebook is not there any more', 'warning');
    await refresh();
    return;
  }
  await stop();
  start(notebook, false);
}

// items by page id. a page without items is not written at all, it reads
// as empty, so a pdf of 500 pages goes in as one record and its file
async function store(notebook: Notebook, items: Record<string, Item[]> = {}, assets: AssetRecord[] = []) {
  const pages = [];
  for (const meta of notebook.pages) {
    const list = items[meta.id];
    if (list && list.length > 0) pages.push({ id: meta.id, notebookId: notebook.id, ...(await packItems(list)) });
  }
  await importNotebook(notebook, pages, assets);
}

// a new notebook goes into storage before anything else changes, so a
// failed write leaves the open one as it was
async function create(kind: NotebookKind, name: string): Promise<Notebook> {
  const notebook = newNotebook(kind, name, get(preferences).paper);
  await store(notebook);
  library.update((list) => [summary(notebook), ...list]);
  return notebook;
}

// a whole notebook made somewhere else (a pdf to write on, a file) goes
// into storage with its pages and files, then it opens
export function addNotebook(notebook: Notebook, items: Record<string, Item[]> = {}, assets: AssetRecord[] = []) {
  return run(async () => {
    await store(notebook, items, assets);
    await lockNotebook(notebook.id);
    await stop();
    start(notebook, false);
  });
}

// reads the library and opens the notebook from last time. the very first
// launch gets a notebook to write in right away
export function startLibrary(): () => void {
  void navigator.storage?.persist?.().catch(() => {});

  // a tab on its way out may not finish the write, what it holds goes into
  // local storage as well
  const flush = () => {
    keepRescue(session?.saver.unsaved() ?? null);
    void session?.saver.flush();
  };
  // coming back to the tab shows what other tabs made in the meantime
  const onvisibility = () => {
    if (document.visibilityState === 'hidden') flush();
    else void run(refresh);
  };
  // a closing tab also keeps the text that was still being typed
  const onpagehide = () => {
    if (session) commitText();
    flush();
  };
  document.addEventListener('visibilitychange', onvisibility);
  window.addEventListener('pagehide', onpagehide);

  void run(async () => {
    try {
      const all = newestFirst((await listNotebooks()).map(summary));
      library.set(all);
      const last = lastOpened();
      if (all.length === 0 && last === null) {
        const notebook = await create('paper', 'My notes');
        await lockNotebook(notebook.id);
        start(notebook, true);
        activeTool.set('pen');
      } else {
        // no note of the last one means its record got lost, the newest will do
        const id = last ?? all[0]?.id;
        if (id) await openStored(id, true);
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
    window.removeEventListener('pagehide', onpagehide);
  };
}

plugActions({
  newNotebook: (kind) => {
    void run(async () => {
      const notebook = await create(kind, uniqueName(kind === 'board' ? 'Whiteboard' : 'Notebook'));
      await lockNotebook(notebook.id);
      await stop();
      start(notebook, true);
    });
  },
  openNotebook: (id) => {
    void run(() => openStored(id));
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
      // the tab that has it open would write its old name back
      if (await openElsewhere(id)) {
        addToast(`${await nameOf(id)} is open in another tab, rename it there`, 'warning', 5000);
        return;
      }
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
        unlockNotebook(id);
        hide();
      } else if (await openElsewhere(id)) {
        addToast(`${await nameOf(id)} is open in another tab, close it there first`, 'warning', 5000);
        return;
      }
      await deleteNotebook(id);
      dropRescue(id);
      await refresh();
    });
  }
});
