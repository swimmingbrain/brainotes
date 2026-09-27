import { get } from 'svelte/store';
import { plugActions } from './actions';
import { editor, spotAt } from './canvas';
import { insertImages, isImage } from './images';
import { emptyBox, growBox, itemBox } from '$lib/engine/bounds';
import { copyItem, newId } from '$lib/engine/doc';
import { layoutText, measurer, textWidth } from '$lib/engine/text';
import { moveBy, transformItem } from '$lib/engine/transform';
import type { Box, Item } from '$lib/engine/types';
import { getAsset, putAsset } from '$lib/storage/db';
import { activeTool, notebookId, toolOptions } from '$lib/stores/app';

// put on the system clipboard, so a paste knows the items here are still the newest copy
const MARK = 'brainotes items';

interface Clip {
  notebookId: string;
  items: Item[];
  box: Box;
}

let clip: Clip | null = null;

function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

function copySelection(): boolean {
  const ed = editor();
  if (!ed || ed.select.items.length === 0) return false;
  const items = ed.select.items.map(copyItem);
  const box = emptyBox();
  for (const item of items) growBox(box, itemBox(item));
  clip = { notebookId: get(notebookId), items, box };
  return true;
}

function cutSelection(): boolean {
  if (!copySelection()) return false;
  editor()?.select.remove();
  return true;
}

// a picture from another notebook gets its own copy, so deleting that one keeps it
async function ownAssets(items: Item[]): Promise<Item[]> {
  const id = get(notebookId);
  const copied = new Map<string, string>();
  const out: Item[] = [];
  for (const item of items) {
    if (item.type !== 'image') {
      out.push(item);
      continue;
    }
    let assetId = copied.get(item.assetId);
    if (!assetId) {
      const asset = await getAsset(item.assetId);
      if (!asset) continue;
      assetId = newId();
      await putAsset({ ...asset, id: assetId, notebookId: id });
      copied.set(item.assetId, assetId);
    }
    out.push({ ...item, assetId });
  }
  return out;
}

async function pasteItems(at: { x: number; y: number } | null) {
  const c = clip;
  const spot = spotAt(at);
  if (!c || !spot) return;
  let items = c.items.map(copyItem);
  if (c.notebookId !== get(notebookId)) items = await ownAssets(items);
  const dx = spot.x - (c.box.minX + c.box.maxX) / 2;
  const dy = spot.y - (c.box.minY + c.box.maxY) / 2;
  items = items.map((item) => transformItem(item, moveBy(dx, dy)));
  const ed = editor();
  if (!ed || items.length === 0) return;
  activeTool.set('select');
  ed.select.insert(spot.index, items);
}

function pasteText(text: string, at: { x: number; y: number } | null) {
  const spot = spotAt(at);
  const ed = editor();
  if (!spot || !ed) return;
  const o = get(toolOptions);
  const meta = ed.doc.notebook.pages[spot.index];
  const max = ed.view.isBoard ? Infinity : Math.max(40, meta.w - spot.x - 8);
  const measure = measurer(o.textSize);
  const w = textWidth(layoutText(text, max, measure), max, measure);
  activeTool.set('select');
  ed.select.insert(spot.index, [
    { id: newId(), type: 'text', x: spot.x, y: spot.y, w, text, size: o.textSize, color: o.textColor }
  ]);
}

// text selected in the reference panel is copied by the browser itself
function textSelected(): boolean {
  const selection = document.getSelection();
  return selection !== null && !selection.isCollapsed && selection.toString().trim() !== '';
}

function onCopy(e: ClipboardEvent) {
  if (editable(e.target) || textSelected() || !copySelection()) return;
  e.preventDefault();
  e.clipboardData?.setData('text/plain', MARK);
}

function onCut(e: ClipboardEvent) {
  if (editable(e.target) || !cutSelection()) return;
  e.preventDefault();
  e.clipboardData?.setData('text/plain', MARK);
}

function onPaste(e: ClipboardEvent) {
  if (editable(e.target) || !editor()) return;
  e.preventDefault();
  const data = e.clipboardData;
  const images = Array.from(data?.files ?? []).filter(isImage);
  if (images.length > 0) {
    void insertImages(images, null);
    return;
  }
  const text = data?.getData('text/plain') ?? '';
  if (text.trim() !== '' && text !== MARK) pasteText(text.replace(/\r\n/g, '\n'), null);
  else void pasteItems(null);
}

// the menu has no paste event, it reads the clipboard when the browser lets it
async function pasteFromMenu(at: { x: number; y: number } | null) {
  try {
    const entries = await navigator.clipboard.read();
    const images: Blob[] = [];
    let text = '';
    for (const entry of entries) {
      const type = entry.types.find((t) => t.startsWith('image/'));
      if (type) images.push(await entry.getType(type));
      else if (entry.types.includes('text/plain')) text = await (await entry.getType('text/plain')).text();
    }
    if (images.length > 0) return insertImages(images, at);
    if (text.trim() !== '' && text !== MARK) return pasteText(text, at);
  } catch {
    // no permission, the items copied in here still work
  }
  await pasteItems(at);
}

export function installClipboard(target: Window = window): () => void {
  target.addEventListener('copy', onCopy);
  target.addEventListener('cut', onCut);
  target.addEventListener('paste', onPaste);
  return () => {
    target.removeEventListener('copy', onCopy);
    target.removeEventListener('cut', onCut);
    target.removeEventListener('paste', onPaste);
  };
}

function markClipboard() {
  void navigator.clipboard?.writeText(MARK).catch(() => {});
}

plugActions({
  copySelection: () => {
    if (copySelection()) markClipboard();
  },
  cutSelection: () => {
    if (cutSelection()) markClipboard();
  },
  paste: (at) => void pasteFromMenu(at ?? null)
});
