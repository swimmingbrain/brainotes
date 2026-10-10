// the commands brainbridge can run in this tab. each one is a thin layer over
// the same code the buttons use, so an edit made from here is one undo step
// like any other and shows up on the page as it happens

import { get } from 'svelte/store';
import { actions } from '$lib/editor/actions';
import { currentPage, editor, loadPage, openDoc, type Editor } from '$lib/editor/canvas';
import { pageOf } from '$lib/editor/exports';
import { imageItemFor, storeImage } from '$lib/editor/images';
import { createNotebook, openNotebookById } from '$lib/editor/library';
import { pointsBox } from '$lib/engine/bounds';
import { newId, type Doc } from '$lib/engine/doc';
import type { Frame } from '$lib/engine/render';
import { layoutText, measurer, textWidth } from '$lib/engine/text';
import type { Box, ImageItem, Item, PageMeta, TextItem } from '$lib/engine/types';
import { listNotebooks } from '$lib/storage/db';
import { activeTool, library, toolOptions, zoomPercent } from '$lib/stores/app';
import { version } from '$lib/version';

export type CommandArgs = Record<string, unknown>;

type Command = (args: CommandArgs) => Promise<unknown> | unknown;

// ms the canvas gets to show up after a notebook opened
const CANVAS_WAIT = 5000;
// a page picture stays small enough for the server to hand on
const PNG_SIDE = 3000;

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(value: unknown, name: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (value === null || value === '' || !Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

function optNum(value: unknown, name: string): number | undefined {
  return value === undefined || value === null ? undefined : num(value, name);
}

function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function requireDoc(): Doc {
  const doc = openDoc();
  if (!doc) throw new Error('No notebook is open. Call open or create, or open one in the tab.');
  return doc;
}

// pages count from 0 like the list of pages, no page means the one on screen
function pageIndex(doc: Doc, value: unknown): number {
  if (value === undefined || value === null) return currentPage();
  const page = num(value, 'page');
  if (!Number.isInteger(page) || page < 0 || page >= doc.pageCount) {
    throw new Error(`There is no page ${page}, they go from 0 to ${doc.pageCount - 1}; see pages`);
  }
  return page;
}

// btoa wants a string, a big page in one go would blow the call stack
function base64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

// a part of the page in page units, cut to the page on paper. a board has no edges
function regionOf(value: unknown, meta: PageMeta | null): Frame {
  if (!value || typeof value !== 'object') throw new Error('region must be { x, y, w, h } in page units');
  const r = value as Record<string, unknown>;
  let x = num(r.x, 'region.x');
  let y = num(r.y, 'region.y');
  let right = x + num(r.w, 'region.w');
  let bottom = y + num(r.h, 'region.h');
  if (meta) {
    x = Math.max(0, x);
    y = Math.max(0, y);
    right = Math.min(meta.w, right);
    bottom = Math.min(meta.h, bottom);
  }
  if (right - x < 1 || bottom - y < 1) throw new Error('region has to lie on the page and be at least 1 unit wide and high');
  return { x, y, w: right - x, h: bottom - y };
}

function bytesOf(data: string): Uint8Array<ArrayBuffer> {
  let text: string;
  try {
    text = atob(data.replace(/^data:[^,]*,/, ''));
  } catch {
    throw new Error('png must be base64');
  }
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function frameOf(box: Box) {
  return { x: r1(box.minX), y: r1(box.minY), w: r1(box.maxX - box.minX), h: r1(box.maxY - box.minY) };
}

// the canvas mounts a moment after the notebook opened, edits go through it
async function requireEditor(): Promise<Editor> {
  requireDoc();
  const until = Date.now() + CANVAS_WAIT;
  for (;;) {
    const ed = editor();
    if (ed) return ed;
    if (Date.now() > until) throw new Error('The notebook is open but its pages did not show up in the tab');
    await sleep(50);
  }
}

// one undo step, and the page comes into sight when it is not
async function insert(ed: Editor, index: number, items: Item[]): Promise<void> {
  const page = await loadPage(ed.doc.notebook.pages[index].id);
  if (!page?.ready) throw new Error(`Page ${index} could not be read from the browser storage`);
  if (editor()?.doc !== ed.doc) throw new Error('Another notebook was opened in the meantime');
  const added = items.map((item, i) => ({ item, index: page.items.length + i }));
  ed.view.history.run({ type: 'items', pageId: page.meta.id, removed: [], added });
  if (!ed.view.pageShown(index)) ed.view.goToPage(index);
}

// the same name in another case counts too, the exact one wins
async function idByName(name: string): Promise<string> {
  const all = (await listNotebooks()).sort((a, b) => b.updatedAt - a.updatedAt);
  const found = all.find((n) => n.name === name) ?? all.find((n) => n.name.toLowerCase() === name.trim().toLowerCase());
  if (!found) throw new Error(`No notebook called "${name}"; see notebooks`);
  return found.id;
}

function describe(doc: Doc | null) {
  if (!doc) return null;
  const { id, name, kind, tex } = doc.notebook;
  return { id, name, kind, pages: doc.pageCount, tex: tex ?? null };
}

function status() {
  const doc = openDoc();
  return {
    notebook: describe(doc),
    page: doc ? currentPage() : null,
    tool: get(activeTool),
    zoom: get(zoomPercent) / 100,
    version
  };
}

const commands: Record<string, Command> = {
  status,

  // the open notebook's row can be ahead of the stored one, memory has the newest
  notebooks() {
    const doc = openDoc();
    return get(library).map((row) => {
      const open = row.id === doc?.notebook.id ? doc : null;
      return {
        id: row.id,
        name: open ? open.notebook.name : row.name,
        kind: row.kind,
        pages: open ? open.pageCount : row.pageCount,
        updatedAt: row.modifiedAt,
        tex: (open ? open.notebook.tex : row.tex) || null
      };
    });
  },

  async open({ id, name }) {
    const wanted = optStr(id) ?? (await idByName(str(name, 'id or name')));
    await openNotebookById(wanted);
    await requireEditor();
    return status();
  },

  async create({ name, kind }) {
    const type = kind ?? 'paper';
    if (type !== 'paper' && type !== 'board') throw new Error("kind must be 'paper' or 'board'");
    await createNotebook(type, optStr(name)?.trim() ?? (type === 'board' ? 'Whiteboard' : 'Notebook'));
    await requireEditor();
    return status();
  },

  // a page that is not in memory yet is read from the browser storage for its count
  async pages() {
    const doc = requireDoc();
    const out = [];
    for (let index = 0; index < doc.pageCount; index++) {
      const meta = doc.notebook.pages[index];
      const page = await loadPage(meta.id);
      out.push({ index, id: meta.id, w: meta.w, h: meta.h, items: page?.items.length ?? 0, pdf: meta.pdf !== undefined });
    }
    return out;
  },

  async goto({ page }) {
    const ed = await requireEditor();
    const index = pageIndex(ed.doc, num(page, 'page'));
    actions.goToPage(index);
    return { page: index };
  },

  // paper, pdf page, pictures, highlighter and ink, like the png export
  async page_image({ page, scale, region }) {
    const doc = requireDoc();
    const index = pageIndex(doc, page);
    const wanted = Math.min(4, Math.max(0.5, optNum(scale, 'scale') ?? 2));
    const data = await pageOf(doc, doc.notebook.pages[index].id);
    const board = doc.kind === 'board';
    const part = region === undefined || region === null ? undefined : regionOf(region, board ? null : data.meta);
    const [{ renderPng }] = await Promise.all([import('$lib/export/png'), document.fonts?.ready]);
    const png = await renderPng(data, board, { scale: wanted, region: part, maxSide: PNG_SIDE });
    return { png: base64(new Uint8Array(await png.blob.arrayBuffer())), w: png.w, h: png.h, scale: r3(png.scale) };
  },

  // what is on a page as data. the box of a stroke is its ink, half the pen around the points
  async page_strokes({ page }) {
    const doc = requireDoc();
    const index = pageIndex(doc, page);
    const { meta, items } = await pageOf(doc, doc.notebook.pages[index].id);
    const strokes = [];
    const texts = [];
    const shapes = [];
    const images = [];
    for (const item of items) {
      if (item.type === 'stroke') {
        const points: number[][] = [];
        const pts = item.pts;
        for (let i = 0; i < pts.length; i += 3) points.push([r1(pts[i]), r1(pts[i + 1]), r2(pts[i + 2])]);
        const box = frameOf(pointsBox(pts, item.size / 2));
        strokes.push({ id: item.id, pen: item.pen, color: item.color, size: r2(item.size), box, points });
      } else if (item.type === 'text') {
        const { id, text, color } = item;
        texts.push({ id, x: r1(item.x), y: r1(item.y), w: r1(item.w), text, size: r2(item.size), color });
      } else if (item.type === 'shape') {
        const { id, kind, color } = item;
        shapes.push({ id, kind, x1: r1(item.x1), y1: r1(item.y1), x2: r1(item.x2), y2: r1(item.y2), color, size: r2(item.size) });
      } else {
        images.push({ id: item.id, x: r1(item.x), y: r1(item.y), w: r1(item.w), h: r1(item.h) });
      }
    }
    return { w: meta.w, h: meta.h, strokes, texts, shapes, images };
  },

  // wraps like a pasted text, at the right edge of the paper
  async add_text({ page, x, y, text, size, color }) {
    const ed = await requireEditor();
    const index = pageIndex(ed.doc, page);
    const left = num(x, 'x');
    const top = num(y, 'y');
    const words = str(text, 'text');
    const options = get(toolOptions);
    const fontSize = Math.min(400, Math.max(4, optNum(size, 'size') ?? options.textSize));
    const meta = ed.doc.notebook.pages[index];
    const max = ed.view.isBoard ? Infinity : Math.max(40, meta.w - left - 8);
    const measure = measurer(fontSize);
    const w = textWidth(layoutText(words, max, measure), max, measure);
    const item: TextItem = {
      id: newId(),
      type: 'text',
      x: left,
      y: top,
      w,
      text: words,
      size: fontSize,
      color: optStr(color) ?? options.textColor
    };
    await insert(ed, index, [item]);
    return { id: item.id };
  },

  // stored as an asset like a pasted picture. without w it gets the size a paste would
  async add_image({ page, x, y, w, png }) {
    const ed = await requireEditor();
    const index = pageIndex(ed.doc, page);
    const left = num(x, 'x');
    const top = num(y, 'y');
    const width = optNum(w, 'w');
    if (width !== undefined && width <= 0) throw new Error('w must be more than 0');
    const blob = new Blob([bytesOf(str(png, 'png'))], { type: 'image/png' });
    const asset = await storeImage(blob, 'image', ed.doc.notebook.id);
    if (!asset) throw new Error('png is not a picture this browser can read');
    let item: ImageItem | null;
    if (width === undefined) {
      item = imageItemFor(asset, index, 0, 0, undefined, { x: left, y: top });
    } else {
      item = { id: newId(), type: 'image', assetId: asset.assetId, x: left, y: top, w: width, h: (width * asset.h) / asset.w };
    }
    if (!item) throw new Error('Another notebook was opened in the meantime');
    await insert(ed, index, [item]);
    return { id: item.id };
  }
};

export const commandNames = Object.keys(commands);

export async function runCommand(name: string, args: CommandArgs): Promise<unknown> {
  // own keys only, a call named toString must not find the one every object has
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (!command) throw new Error('unknown command');
  return await command(args ?? {});
}
