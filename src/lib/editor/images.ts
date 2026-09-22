import { get } from 'svelte/store';
import { plugActions, type Point } from './actions';
import { editor, spotAt } from './canvas';
import { importNotebookFiles, isNotebookFile } from './notebook-file';
import { choosePdf, isPdf } from './pdfs';
import { newId } from '$lib/engine/doc';
import { rememberBitmap } from '$lib/engine/images';
import type { ImageItem, ImageSource } from '$lib/engine/types';
import { warmPdf } from '$lib/pdf/pdf';
import { putAsset } from '$lib/storage/db';
import { activeTool, addToast, dismissToast, notebookId, updateToast } from '$lib/stores/app';

// a photo is made smaller once when it comes in, longer sides than this
// only cost memory
export const MAX_SIDE = 2400;
// share of the page width a new picture takes
const SHARE = 0.6;
// ms before a toast says pictures are on their way, a big photo takes a while
const SLOW = 400;

export interface ImageAsset {
  assetId: string;
  // pixels of the stored picture
  w: number;
  h: number;
}

// the picture goes into storage for the open notebook, made smaller first
// when it is big. png stays png, the rest becomes jpeg. null when the
// browser can not read it
export async function storeImage(blob: Blob, name = 'image'): Promise<ImageAsset | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  let out = blob;
  const long = Math.max(bitmap.width, bitmap.height);
  if (long > MAX_SIDE) {
    const k = MAX_SIDE / long;
    const w = Math.max(1, Math.round(bitmap.width * k));
    const h = Math.max(1, Math.round(bitmap.height * k));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const type = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    out = await canvas.convertToBlob({ type, quality: 0.9 });
    bitmap = canvas.transferToImageBitmap();
  }
  const assetId = newId();
  await putAsset({
    id: assetId,
    notebookId: get(notebookId),
    kind: 'image',
    name,
    type: out.type,
    blob: out,
    w: bitmap.width,
    h: bitmap.height
  });
  rememberBitmap(assetId, bitmap);
  return { assetId, w: bitmap.width, h: bitmap.height };
}

// an image item for the asset, centred on (cx, cy) of page index or with its
// top left at a corner, about 60 percent of the page wide and never bigger
// than the page. a small picture keeps its own size, a clip of a pdf the
// size it has in the pdf
export function imageItemFor(
  asset: ImageAsset,
  index: number,
  cx: number,
  cy: number,
  source?: ImageSource,
  corner?: Point
): ImageItem | null {
  const ed = editor();
  if (!ed) return null;
  const { view, doc } = ed;
  const meta = doc.notebook.pages[index];
  // a board has no edges, the part of it on screen counts as the page
  const pageW = view.isBoard ? view.width / view.cam.zoom : meta.w;
  const pageH = view.isBoard ? view.height / view.cam.zoom : meta.h;
  const natural = source ?? asset;
  let w = Math.min(natural.w, pageW * SHARE);
  let h = (w * asset.h) / asset.w;
  if (h > pageH * 0.9) {
    h = pageH * 0.9;
    w = (h * asset.w) / asset.h;
  }
  let x = corner ? corner.x : cx - w / 2;
  let y = corner ? corner.y : cy - h / 2;
  if (!view.isBoard) {
    x = Math.max(0, Math.min(x, meta.w - w));
    y = Math.max(0, Math.min(y, meta.h - h));
  }
  const item: ImageItem = { id: newId(), type: 'image', assetId: asset.assetId, x, y, w, h };
  if (source) item.source = { ...source };
  return item;
}

// pictures from files or the clipboard, put down around a point of the
// window, the pointer or the middle of the view. they end up selected
export async function insertImages(blobs: Blob[], at: Point | null, centre = false) {
  // the spot is taken now, the pointer may move on while the files are read
  const spot = spotAt(at, centre);
  if (!spot) return;
  const placed: ImageItem[] = [];
  let done = 0;
  let toast = '';
  const label = () =>
    blobs.length > 1
      ? `Importing pictures: ${done + 1} of ${blobs.length}`
      : `Importing ${blobs[0] instanceof File ? blobs[0].name : 'the picture'}...`;
  const timer = setTimeout(() => (toast = addToast(label(), 'info', 0)), SLOW);
  try {
    for (const blob of blobs) {
      if (toast) updateToast(toast, label());
      const asset = await storeImage(blob, blob instanceof File ? blob.name : 'image');
      done++;
      if (!asset) {
        addToast('That picture could not be read', 'warning');
        continue;
      }
      // more than one picture fan out a little
      const step = placed.length * 24;
      const item = imageItemFor(asset, spot.index, spot.x + step, spot.y + step);
      if (item) placed.push(item);
    }
  } finally {
    clearTimeout(timer);
    if (toast) dismissToast(toast);
  }
  const ed = editor();
  if (!ed || placed.length === 0 || spot.index >= ed.doc.pageCount) return;
  activeTool.set('select');
  ed.select.insert(spot.index, placed);
}

// for code that makes pictures itself (a snip of a pdf page): one picture
// from a blob, centred on a point of page index in page units
export async function insertImageBlob(
  blob: Blob,
  index: number,
  cx: number,
  cy: number,
  source?: ImageSource,
  corner?: Point
): Promise<ImageItem | null> {
  const asset = await storeImage(blob);
  const ed = editor();
  if (!asset || !ed) return null;
  const item = imageItemFor(asset, index, cx, cy, source, corner);
  if (!item) return null;
  activeTool.set('select');
  ed.select.insert(index, [item]);
  return item;
}

export function isImage(file: Blob): boolean {
  return file.type.startsWith('image/') && file.type !== 'image/svg+xml';
}

// a file picker that resolves with what was picked, nothing when it was closed
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    // some browsers only open the picker for an input that is in the page
    document.body.appendChild(input);
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => done([]));
    input.click();
  });
}

// pictures land at the point, pdfs ask what to do with them and a
// .brainotes file becomes a notebook of its own
function importAll(files: File[], at: Point | null) {
  const images = files.filter(isImage);
  const pdfs = files.filter(isPdf);
  const notebooks = files.filter(isNotebookFile);
  if (images.length > 0) void insertImages(images, at);
  if (pdfs.length > 0) choosePdf(pdfs);
  if (notebooks.length > 0) void importNotebookFiles(notebooks);
  if (images.length + pdfs.length + notebooks.length < files.length) {
    addToast('Only pdfs, pictures and .brainotes files can be imported', 'info');
  }
}

plugActions({
  insertImage: (at) => {
    void pickFiles('image/*').then((files) => {
      const images = files.filter(isImage);
      if (images.length > 0) void insertImages(images, at ?? null, true);
    });
  },
  importFiles: (files, at) => {
    if (files) {
      importAll(files, at ?? null);
      return;
    }
    // a pdf may come, pdf.js gets ready while the file is picked
    warmPdf();
    void pickFiles('image/*,application/pdf,.brainotes').then((picked) => importAll(picked, at ?? null));
  }
});
