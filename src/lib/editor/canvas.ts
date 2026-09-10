import { get } from 'svelte/store';
import { actions, plugActions, type Point } from './actions';
import type { ToolId } from './tools';
import { copyItem, copyPage, Doc, newId, newPageData, newPageMeta, type DocChange, type PageData } from '$lib/engine/doc';
import { History, type Op } from '$lib/engine/history';
import { itemNear } from '$lib/engine/hit';
import { clearBitmaps, setImageLoader } from '$lib/engine/images';
import { Input, penIsDown } from '$lib/engine/input';
import { fontLoaded, fontOf } from '$lib/engine/text';
import { moveBy, transformItem } from '$lib/engine/transform';
import { EraserTool } from '$lib/engine/tools/eraser';
import { HandTool } from '$lib/engine/tools/hand';
import { LaserTool } from '$lib/engine/tools/laser';
import { PenTool } from '$lib/engine/tools/pen';
import { SelectTool } from '$lib/engine/tools/select';
import { ShapeTool } from '$lib/engine/tools/shape';
import { TextTool } from '$lib/engine/tools/text';
import type { Sample, Tool } from '$lib/engine/tools/tool';
import type { Notebook, PageMeta, ShapeKind, TextItem } from '$lib/engine/types';
import { CanvasView } from '$lib/engine/view';
import * as pdf from '$lib/pdf/pdf';
import { keepPdfs, setPdfLoader } from '$lib/pdf/pdf';
import * as storage from '$lib/storage/db';
import type { PageLoader } from '$lib/storage/loader';
import type { Saver } from '$lib/storage/saver';
import {
  activeTool,
  history as historyState,
  inputType,
  itemCount,
  notebookId,
  notebookKind,
  notebookName,
  pageCount,
  pageIndex,
  pageList,
  paperStyle,
  selectionCount,
  toolOptions,
  zoomPercent,
  type ToolOptions
} from '$lib/stores/app';
import { preferences, type PaperStyle, type Preferences } from '$lib/stores/preferences';

// the open notebook with what keeps it in storage
export interface Session {
  doc: Doc;
  loader: PageLoader;
  saver: Saver;
}

// in dev the open notebook is reachable from the console and from browser tests
declare global {
  interface Window {
    brainotes?: {
      readonly view: CanvasView | null;
      readonly doc: Doc | null;
      readonly history: History | null;
      readonly loader: PageLoader | null;
      readonly saver: Saver | null;
      storage: typeof storage;
      pdf: typeof pdf;
      newId: () => string;
      actions: typeof actions;
    };
  }
}

// the open notebook lives here, outside of any component, so closing the
// canvas and opening it again keeps it
let session: Session | null = null;
let doc: Doc | null = null;
let history: History | null = null;
let view: CanvasView | null = null;
let select: SelectTool | null = null;
let text: TextTool | null = null;
let offDoc: (() => void) | null = null;
// where the pointer is over the canvas, in window pixels
let pointer: Point | null = null;

// what the clipboard and the picture import work with
export interface Editor {
  view: CanvasView;
  doc: Doc;
  select: SelectTool;
}

export function editor(): Editor | null {
  return view && doc && select ? { view, doc, select } : null;
}

// a point of the window as a page and a point on it in page units. no
// point means the pointer while it is over the canvas, else the middle of
// the view, which centre asks for always
export function spotAt(at: Point | null, centre = false): { index: number; x: number; y: number } | null {
  if (!view || !doc || doc.pageCount === 0) return null;
  const p = at ?? (centre ? null : pointer);
  let x = p ? p.x - view.left : view.width / 2;
  let y = p ? p.y - view.top : view.height / 2;
  let index = view.pageAtScreen(x, y);
  if (index < 0) {
    // between two pages the page in the middle of the view takes it
    index = current();
    x = view.width / 2;
    y = view.height / 2;
  }
  const cam = view.cam;
  return { index, x: cam.x + x / cam.zoom - view.pageX(index), y: cam.y + y / cam.zoom - view.pageY(index) };
}

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

function syncPages() {
  pageList.set(doc ? doc.notebook.pages.map((p) => ({ id: p.id, w: p.w, h: p.h })) : []);
}

function syncHistory() {
  historyState.set({ canUndo: history?.canUndo ?? false, canRedo: history?.canRedo ?? false });
  syncCount();
}

function onDocChange(change: DocChange) {
  select?.docChanged(change);
  // while the pen is down the counts wait, the gesture ends with a history
  // change that brings them up to date
  if (change.type === 'items') {
    if (!penIsDown()) syncCount();
  } else if (change.type === 'loaded') {
    syncCount();
  } else if (change.type === 'name') {
    notebookName.set(doc?.notebook.name ?? '');
  } else if (change.type === 'pages') {
    syncPages();
    syncPage();
  } else {
    syncPage();
  }
}

// the pdfs a notebook shows: its page backgrounds and its reference files
function pdfsOf(notebook: Notebook | undefined): Set<string> {
  const ids = new Set<string>(notebook?.refs ?? []);
  for (const meta of notebook?.pages ?? []) if (meta.pdf) ids.add(meta.pdf.assetId);
  return ids;
}

// a notebook from the library takes over the canvas, null closes it
export function showNotebook(next: Session | null) {
  text?.commit();
  select?.clear();
  clearBitmaps();
  keepPdfs(pdfsOf(next?.doc.notebook));
  offDoc?.();
  offDoc = null;
  session = next;
  doc = next?.doc ?? null;
  history = doc ? new History(doc) : null;
  if (doc && history) {
    history.onchange = syncHistory;
    offDoc = doc.on(onDocChange);
    notebookId.set(doc.notebook.id);
    notebookKind.set(doc.kind);
    notebookName.set(doc.notebook.name);
    view?.setDoc(doc, history);
  } else {
    notebookId.set('');
  }
  syncHistory();
  syncPages();
  syncPage();
}

export function openDoc(): Doc | null {
  return doc;
}

// the page in the middle of the view, or the board on show
export function currentPage(): number {
  return current();
}

// pages with these metas from index on, one undo step, and the view goes
// to the first of them
export function addPages(index: number, metas: PageMeta[]) {
  if (!doc || !history || metas.length === 0) return;
  const at = Math.max(0, Math.min(index, doc.pageCount));
  const ops: Op[] = metas.map((meta, k) => ({ type: 'page-add', index: at + k, page: newPageData(meta) }));
  history.run(ops.length === 1 ? ops[0] : { type: 'batch', ops });
  view?.goToPage(at);
}

// a page with all its items, read from storage when it is not in memory yet
export async function loadPage(id: string): Promise<PageData | undefined> {
  if (!session) return undefined;
  return session.loader.ensure(id);
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
    smoothing: prefs.smoothing,
    holdToSnap: prefs.holdToSnap
  };
}

const SHAPE_KINDS: Record<ToolOptions['shapeKind'], ShapeKind> = {
  line: 'line',
  arrow: 'arrow',
  rectangle: 'rect',
  ellipse: 'ellipse'
};

function shapeSettings() {
  return { kind: SHAPE_KINDS[options.shapeKind], color: options.shapeColor, size: options.shapeSize };
}

function textSettings() {
  return { size: options.textSize, color: options.textColor };
}

// the text under a point of page index, for editing it
function textAt(index: number, x: number, y: number): TextItem | null {
  if (!doc || !view) return null;
  const items = doc.pageAt(index).items;
  const r = 4 / view.cam.zoom;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === 'text' && itemNear(item, x, y, r)) return item;
  }
  return null;
}

// a click with the image tool picks a picture for that spot
function imageTool(v: CanvasView): Tool {
  let at: Point | null = null;
  return {
    down: (s: Sample) => (at = { x: s.x + v.left, y: s.y + v.top }),
    move: () => {},
    up: () => {
      if (at) actions.insertImage(at);
      at = null;
    },
    cancel: () => (at = null)
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
  if (!doc || !history) return () => {};
  const v = new CanvasView(host, doc, history, {
    state: () => {
      zoomPercent.set(Math.round(v.cam.zoom * 100));
      syncPage();
      // another board is on show, what was selected or typed on the last one ends
      if (v.isBoard && select && select.index >= 0 && select.index !== v.board) select.clear();
      if (v.isBoard) text?.place();
    },
    scroll: onscroll,
    near: (first, last) => session?.loader.near(first, last),
    camera: () => text?.place()
  });
  view = v;

  const pen = new PenTool(v, penSettings);
  const eraser = new EraserTool(v, eraserSettings);
  const hand = new HandTool(v);
  const shape = new ShapeTool(v, shapeSettings);
  const laser = new LaserTool(v);
  const picker = imageTool(v);
  const words = new TextTool(v, textSettings, textAt);
  const sel = new SelectTool(v, {
    changed: (count) => selectionCount.set(count),
    editText: (index, item) => words.edit(index, item),
    source: (source) => actions.showSource(source)
  });
  select = sel;
  text = words;
  const tools: Partial<Record<ToolId, Tool>> = {
    select: sel,
    pen,
    highlighter: pen,
    eraser,
    shape,
    text: words,
    image: picker,
    laser,
    hand
  };
  const input = new Input(
    v,
    {
      pick: () => tools[tool] ?? null,
      eraser,
      hand
    },
    {
      kind: (kind) => inputType.set(kind),
      fingerDraws: () => prefs.fingerDraws
    }
  );

  const track = (e: PointerEvent) => (pointer = { x: e.clientX, y: e.clientY });
  const lose = () => (pointer = null);
  v.live.addEventListener('pointermove', track);
  v.live.addEventListener('pointerdown', track);
  v.live.addEventListener('pointerleave', lose);

  const unsubs = [
    activeTool.subscribe((t) => {
      const before = tool;
      tool = t;
      if (t === before) return;
      // switching tools ends the text being typed and drops the selection
      words.commit();
      if (t !== 'select') sel.clear();
      v.live.style.cursor = '';
      input.toolChanged();
      if (t === 'image') actions.insertImage();
    }),
    toolOptions.subscribe((o) => (options = o))
  ];

  return () => {
    for (const unsub of unsubs) unsub();
    v.live.removeEventListener('pointermove', track);
    v.live.removeEventListener('pointerdown', track);
    v.live.removeEventListener('pointerleave', lose);
    words.destroy();
    sel.clear();
    input.destroy();
    v.destroy();
    if (view === v) view = null;
    if (select === sel) select = null;
    if (text === words) text = null;
  };
}

// a new page looks like the one on screen, without its pdf
function blankLike(meta: PageMeta | undefined): PageData {
  if (!doc || !meta) return newPageData(newPageMeta(doc?.kind ?? 'paper', prefs.paper));
  return newPageData({ id: newId(), w: meta.w, h: meta.h, paper: { ...meta.paper } });
}

// the undo of a page op keeps the page in memory, so its ink has to be
// read before the page can go
async function deletePage(index: number) {
  const d = doc;
  const h = history;
  const meta = d?.notebook.pages[index];
  if (!d || !h || !meta) return;
  const page = await loadPage(meta.id);
  const at = d.indexOf(meta.id);
  if (d !== doc || !page?.ready || at < 0) return;
  if (d.pageCount === 1) {
    // the last page makes room for a fresh one
    const fresh = newPageData(newPageMeta(d.kind, prefs.paper));
    h.run({
      type: 'batch',
      ops: [
        { type: 'page-remove', index: 0, page },
        { type: 'page-add', index: 0, page: fresh }
      ]
    });
    return;
  }
  h.run({ type: 'page-remove', index: at, page });
}

async function duplicatePage(index: number) {
  const d = doc;
  const h = history;
  const meta = d?.notebook.pages[index];
  if (!d || !h || !meta) return;
  const page = await loadPage(meta.id);
  const at = d.indexOf(meta.id);
  if (d !== doc || !page?.ready || at < 0) return;
  h.run({ type: 'page-add', index: at + 1, page: copyPage(page) });
  view?.goToPage(at + 1);
}

function setPagePaper(index: number, style: PaperStyle) {
  const meta = doc?.notebook.pages[index];
  if (!history || !meta || meta.paper.style === style) return;
  history.run({ type: 'paper', pageId: meta.id, before: { ...meta.paper }, after: { ...meta.paper, style } });
}

function paperOnAllPages(index: number) {
  const source = doc?.notebook.pages[index];
  if (!doc || !history || !source) return;
  const paper = source.paper;
  const ops: Op[] = [];
  for (const meta of doc.notebook.pages) {
    const p = meta.paper;
    if (p.style === paper.style && p.spacing === paper.spacing && p.color === paper.color) continue;
    ops.push({ type: 'paper', pageId: meta.id, before: { ...p }, after: { ...paper } });
  }
  if (ops.length > 0) history.run({ type: 'batch', ops });
}

preferences.subscribe((p) => (prefs = p));

if (typeof window !== 'undefined') {
  setImageLoader(async (id) => (await storage.getAsset(id))?.blob);
  setPdfLoader(async (id) => (await storage.getAsset(id))?.blob);
  // text measured before inter arrived is measured again and drawn anew
  void document.fonts?.load(fontOf(16)).then(() => {
    fontLoaded();
    view?.redrawAll();
  });
}

// duplicates sit a little down and to the right of what they copy
const DUPLICATE_SHIFT = 16;

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.brainotes = {
    get view() {
      return view;
    },
    get doc() {
      return doc;
    },
    get history() {
      return history;
    },
    get loader() {
      return session?.loader ?? null;
    },
    get saver() {
      return session?.saver ?? null;
    },
    storage,
    pdf,
    newId,
    actions
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
    history.run({ type: 'page-add', index, page: blankLike(doc.notebook.pages[current()]) });
    view?.goToPage(index);
  },
  deletePage: (index) => void deletePage(index),
  duplicatePage: (index) => void duplicatePage(index),
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
    if (doc && doc.pageCount > 0) setPagePaper(current(), style);
  },
  setPagePaper,
  paperOnAllPages,
  deleteSelection: () => select?.remove(),
  duplicateSelection: () => {
    if (!select || select.items.length === 0) return;
    const shift = moveBy(DUPLICATE_SHIFT, DUPLICATE_SHIFT);
    select.insert(
      select.index,
      select.items.map((item) => transformItem(copyItem(item), shift))
    );
  },
  recolorSelection: (color) => select?.recolor(color),
  nudgeSelection: (dx, dy) => select?.nudge(dx, dy),
  selectAll: () => {
    if (!doc || !select || doc.pageCount === 0) return;
    text?.commit();
    activeTool.set('select');
    const index = current();
    select.select(index, doc.pageAt(index).items);
  },
  clearSelection: () => select?.clear()
});
