import { get } from 'svelte/store';
import { actions, plugActions } from './actions';
import type { ToolId } from './tools';
import { Doc, newId, newNotebook, newPageData, newPageMeta, type DocChange } from '$lib/engine/doc';
import { History, type Op } from '$lib/engine/history';
import { Input, penIsDown } from '$lib/engine/input';
import { EraserTool } from '$lib/engine/tools/eraser';
import { HandTool } from '$lib/engine/tools/hand';
import { PenTool } from '$lib/engine/tools/pen';
import { CanvasView } from '$lib/engine/view';
import {
  activeTool,
  addToast,
  history as historyState,
  inputType,
  itemCount,
  notebookKind,
  notebookName,
  notebookOpen,
  pageCount,
  pageIndex,
  paperStyle,
  toolOptions,
  zoomPercent,
  type NotebookKind,
  type ToolOptions
} from '$lib/stores/app';
import { preferences, type Preferences } from '$lib/stores/preferences';

// in dev the view is reachable from the console and from browser tests
declare global {
  interface Window {
    brainotes?: {
      view: CanvasView;
      readonly doc: Doc | null;
      readonly history: History | null;
      newId: () => string;
      actions: typeof actions;
    };
  }
}

// the open notebook lives here, outside of any component, so closing the
// canvas and opening it again keeps it. storage takes over in a later step
let doc: Doc | null = null;
let history: History | null = null;
let view: CanvasView | null = null;
let offDoc: (() => void) | null = null;

let tool: ToolId = get(activeTool);
let options: ToolOptions = get(toolOptions);
let prefs: Preferences = get(preferences);

function current(): number {
  if (!doc || doc.pageCount === 0) return 0;
  return view ? Math.max(0, Math.min(view.currentPage, doc.pageCount - 1)) : 0;
}

function syncCount() {
  if (!doc || doc.pageCount === 0) return itemCount.set(0);
  itemCount.set(doc.pageAt(current()).items.length);
}

function syncPage() {
  if (!doc) return;
  const index = current();
  pageIndex.set(index);
  pageCount.set(doc.pageCount);
  if (doc.pageCount > 0) paperStyle.set(doc.notebook.pages[index].paper.style);
  syncCount();
}

function syncHistory() {
  historyState.set({ canUndo: history?.canUndo ?? false, canRedo: history?.canRedo ?? false });
  syncCount();
}

function onDocChange(change: DocChange) {
  // while the pen is down the counts wait, the gesture ends with a history
  // change that brings them up to date
  if (change.type === 'items') {
    if (!penIsDown()) syncCount();
  } else if (change.type === 'name') {
    notebookName.set(doc?.notebook.name ?? '');
  } else {
    syncPage();
  }
}

function startNotebook(kind: NotebookKind, name: string) {
  doc = new Doc(newNotebook(kind, name, prefs.paper));
  history = new History(doc);
  history.onchange = syncHistory;
  offDoc?.();
  offDoc = doc.on(onDocChange);
  notebookKind.set(kind);
  notebookName.set(name);
  view?.setDoc(doc, history);
  syncHistory();
  syncPage();
}

// after an undo or redo the change should be in sight
function reveal(op: Op) {
  if (!view || !doc) return;
  if (op.type === 'batch') {
    if (op.ops.length > 0) reveal(op.ops[0]);
    return;
  }
  let index: number;
  if (op.type === 'items' || op.type === 'paper') index = doc.indexOf(op.pageId);
  else if (op.type === 'page-move') index = doc.indexOf(doc.notebook.pages[op.to]?.id ?? '');
  else index = Math.min(op.index, doc.pageCount - 1);
  if (index >= 0 && !view.pageShown(index)) view.goToPage(index);
}

function penSettings() {
  const marker = tool === 'highlighter';
  return {
    pen: marker ? ('highlighter' as const) : options.penType,
    color: marker ? options.highlighterColor : options.penColor,
    size: marker ? options.highlighterSize : options.penSize,
    pressure: prefs.pressure,
    smoothing: prefs.smoothing
  };
}

function eraserSettings() {
  return { mode: options.eraserMode, size: options.eraserSize, markersOnly: options.eraseHighlighterOnly };
}

// fraction 0..1 of a paper notebook, for the scroll indicator
export function scrollCanvas(fraction: number) {
  view?.scrollTo(fraction);
}

export function mountCanvas(host: HTMLElement, onscroll: (start: number, size: number) => void): () => void {
  if (!doc || !history) startNotebook('paper', 'My notes');
  const v = new CanvasView(host, doc!, history!, {
    state: () => {
      zoomPercent.set(Math.round(v.cam.zoom * 100));
      syncPage();
    },
    scroll: onscroll
  });
  view = v;

  const pen = new PenTool(v, penSettings);
  const eraser = new EraserTool(v, eraserSettings);
  const hand = new HandTool(v);
  const input = new Input(
    v,
    {
      pick: () => {
        if (tool === 'pen' || tool === 'highlighter') return pen;
        if (tool === 'eraser') return eraser;
        if (tool === 'hand') return hand;
        return null;
      },
      eraser,
      hand
    },
    {
      kind: (kind) => inputType.set(kind),
      fingerDraws: () => prefs.fingerDraws
    }
  );

  const unsubs = [
    activeTool.subscribe((t) => {
      tool = t;
      input.toolChanged();
    }),
    toolOptions.subscribe((o) => (options = o)),
    preferences.subscribe((p) => (prefs = p))
  ];

  if (import.meta.env.DEV) {
    window.brainotes = {
      view: v,
      get doc() {
        return doc;
      },
      get history() {
        return history;
      },
      newId,
      actions
    };
  }

  return () => {
    for (const unsub of unsubs) unsub();
    input.destroy();
    v.destroy();
    if (view === v) view = null;
    if (import.meta.env.DEV) delete window.brainotes;
  };
}

plugActions({
  undo: () => {
    const op = history?.undo();
    if (op) reveal(op);
  },
  redo: () => {
    const op = history?.redo();
    if (op) reveal(op);
  },
  zoomIn: () => view?.zoomStep(1),
  zoomOut: () => view?.zoomStep(-1),
  zoomReset: () => view?.zoomReset(),
  newPage: () => {
    if (!doc || !history) return;
    // after the page on screen, a board gets a fresh board and goes there
    const index = doc.pageCount === 0 ? 0 : current() + 1;
    history.run({ type: 'page-add', index, page: newPageData(newPageMeta(doc.kind, prefs.paper)) });
    view?.goToPage(index);
  },
  deletePage: (index) => {
    if (!doc || !history || index < 0 || index >= doc.pageCount) return;
    if (doc.pageCount === 1) {
      addToast(doc.kind === 'board' ? 'A whiteboard keeps at least one board' : 'A notebook keeps at least one page');
      return;
    }
    history.run({ type: 'page-remove', index, page: doc.pageAt(index) });
  },
  movePage: (from, to) => {
    if (!doc || !history || from === to) return;
    if (from < 0 || to < 0 || from >= doc.pageCount || to >= doc.pageCount) return;
    history.run({ type: 'page-move', from, to });
    view?.goToPage(to);
  },
  goToPage: (index) => view?.goToPage(index),
  nextPage: () => view?.goToPage(current() + 1),
  previousPage: () => view?.goToPage(current() - 1),
  setPaperStyle: (style) => {
    if (!doc || !history || doc.pageCount === 0) return;
    const meta = doc.notebook.pages[current()];
    if (meta.paper.style === style) return;
    history.run({ type: 'paper', pageId: meta.id, before: { ...meta.paper }, after: { ...meta.paper, style } });
  },
  newNotebook: (kind) => {
    startNotebook(kind, kind === 'board' ? 'Whiteboard' : 'My notes');
    notebookOpen.set(true);
  },
  renameNotebook: (name, id) => {
    if (id) return;
    doc?.rename(name);
    notebookName.set(name);
  }
});
