import { get } from 'svelte/store';
import { plugActions, type Point } from './actions';
import { currentPage, editor, openDoc, spotAt } from './canvas';
import { insertImageBlob, isImage, MAX_SIDE, pickFiles } from './images';
import { addNotebook } from './library';
import { baseName, isPdf, pdfAsset, readFile, writeOnPage } from './pdfs';
import { newId, newNotebook } from '$lib/engine/doc';
import type { ImageSource } from '$lib/engine/types';
import { layoutOf } from '$lib/pdf/layout';
import { capScale, openPdf, renderPart, warmPdf, type Part } from '$lib/pdf/pdf';
import { deleteAsset, getAsset, listAssets, listPages, putAsset } from '$lib/storage/db';
import { activeTool, addToast, notebookId, panels, updatePanels, workspace } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';
import {
  activeReference,
  referenceFocus,
  references,
  saveActive,
  savedActive,
  type RefInfo
} from '$lib/stores/reference';

// device pixels per point of a snip, about 200 dpi
export const SNIP_SCALE = 200 / 72;
const SNIP_GAP = 12;
// ms after a notebook opens before its unused pdfs are looked for
const SWEEP_DELAY = 4000;

// with both panels closed, or a file opened to read, the study workspace comes up
export function showReferencePanel(study = false) {
  const p = get(panels);
  if (get(workspace) !== 'study' && (study || (!p.leftOpen && !p.rightOpen))) workspace.set('study');
  if (!get(panels).rightOpen) updatePanels((q) => ({ ...q, rightOpen: true }));
}

function setActive(id: string) {
  activeReference.set(id);
  const doc = openDoc();
  if (doc) saveActive(doc.notebook.id, id);
}

async function loadRefs(id: string) {
  const doc = openDoc();
  if (!id || !doc || doc.notebook.id !== id) {
    references.set([]);
    activeReference.set('');
    return;
  }
  const list: RefInfo[] = [];
  for (const ref of doc.notebook.refs ?? []) {
    const asset = await getAsset(ref).catch(() => undefined);
    if (asset) list.push({ id: ref, name: asset.name, kind: asset.kind });
  }
  if (openDoc()?.notebook.id !== id) return;
  references.set(list);
  const saved = savedActive(id);
  activeReference.set(list.some((r) => r.id === saved) ? saved : (list[0]?.id ?? ''));
  void sweep(id);
}

// reading needs a notebook for the notes, nothing open gets one named after the file
async function ensureNotebook(file: File) {
  if (openDoc()) return;
  const notebook = newNotebook('paper', baseName(file.name), get(preferences).paper);
  await addNotebook(notebook);
}

// a file the notebook stored already, like the pdf it was made from, is used again
async function openFiles(files: File[]) {
  const usable = files.filter((f) => isPdf(f) || isImage(f));
  if (usable.length === 0) {
    if (files.length > 0) addToast('Only pdfs and pictures can be read on the side', 'info');
    return;
  }
  await ensureNotebook(usable[0]);
  const doc = openDoc();
  if (!doc) return;
  const owner = doc.notebook.id;
  const assets = await listAssets(owner).catch(() => []);
  const refs = [...(doc.notebook.refs ?? [])];
  const infos = [...get(references)];
  let last = '';
  for (const file of usable) {
    const kind = isPdf(file) ? 'pdf' : 'image';
    const same = assets.find((a) => a.kind === kind && a.name === file.name && a.blob.size === file.size);
    let id = same?.id ?? '';
    try {
      if (!id && kind === 'pdf') {
        const pdf = await readFile(file);
        if (!pdf) continue;
        id = pdf.id;
        await putAsset(pdfAsset(file, pdf, owner));
      } else if (!id) {
        id = newId();
        await putAsset({ id, notebookId: owner, kind: 'image', name: file.name, type: file.type, blob: file });
      }
    } catch (err) {
      console.error(err);
      addToast(`${file.name} could not be stored in the browser`, 'error', 5000);
      continue;
    }
    if (openDoc() !== doc) return;
    if (!refs.includes(id)) {
      refs.push(id);
      infos.push({ id, name: file.name, kind });
      // at once, the sweep of unused files must not find it stored but unused
      doc.setRefs([...refs]);
    }
    last = id;
  }
  if (openDoc() !== doc || !last) return;
  references.set(infos);
  setActive(last);
  showReferencePanel(true);
}

// the tab goes, the file stays stored for the clips and pages that use it
export function closeReference(id: string) {
  const doc = openDoc();
  if (!doc) return;
  const list = get(references);
  const at = list.findIndex((r) => r.id === id);
  const rest = list.filter((r) => r.id !== id);
  doc.setRefs((doc.notebook.refs ?? []).filter((r) => r !== id));
  references.set(rest);
  if (get(activeReference) === id) setActive(rest[Math.min(at, rest.length - 1)]?.id ?? '');
}

export function showReference(id: string) {
  setActive(id);
}

// the file of a clip opens at its page, and the part it was cut from flashes
export async function showSource(source: ImageSource) {
  const doc = openDoc();
  if (!doc) return;
  if (!get(references).some((r) => r.id === source.assetId)) {
    const asset = await getAsset(source.assetId).catch(() => undefined);
    if (!asset || asset.kind !== 'pdf') {
      addToast('The pdf this clip came from is not stored any more', 'warning');
      return;
    }
    if (openDoc() !== doc) return;
    doc.setRefs([...(doc.notebook.refs ?? []), source.assetId]);
    references.update((list) => [...list, { id: asset.id, name: asset.name, kind: 'pdf' }]);
  }
  setActive(source.assetId);
  showReferencePanel();
  const { assetId, page, x, y, w, h } = source;
  referenceFocus.set({ file: assetId, page, part: { x, y, w, h }, at: Date.now() });
}

async function toPng(picture: ImageBitmap): Promise<Blob> {
  const canvas = new OffscreenCanvas(picture.width, picture.height);
  canvas.getContext('2d')!.drawImage(picture, 0, 0);
  picture.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

let lastClip = '';

// while the last clip is in sight the next snip goes under it, not over it
function underLast(spot: { index: number; x: number; y: number }): Point | undefined {
  const ed = editor();
  const last = ed?.doc.pageAt(spot.index).items.find((item) => item.id === lastClip);
  if (!ed || last?.type !== 'image') return undefined;
  const corner = { x: last.x, y: last.y + last.h + SNIP_GAP };
  const half = ed.view.height / 2 / ed.view.cam.zoom;
  return Math.abs(corner.y - spot.y) < half ? corner : undefined;
}

// no part means the whole page
export async function snip(file: string, page: number, part?: Part) {
  const spot = spotAt(null, true);
  if (!spot || !editor()) return;
  try {
    const whole = part ?? { x: 0, y: 0, ...(await pageSize(file, page)) };
    // a poster sized page would be too big, the stored picture is capped anyway
    const scale = Math.min(capScale(whole.w, whole.h, SNIP_SCALE), MAX_SIDE / Math.max(whole.w, whole.h));
    const blob = await toPng(await renderPart(file, page, scale, part));
    const item = await insertImageBlob(blob, spot.index, spot.x, spot.y, { assetId: file, page, ...whole }, underLast(spot));
    lastClip = item?.id ?? '';
  } catch (err) {
    console.warn(err);
    addToast('That part of the pdf could not be cut out', 'warning');
  }
}

export async function snipImage(file: string, part: Part) {
  const spot = spotAt(null, true);
  if (!spot || !editor()) return;
  try {
    const asset = await getAsset(file);
    if (!asset) throw new Error('the picture is not stored');
    const w = Math.max(1, Math.round(part.w));
    const h = Math.max(1, Math.round(part.h));
    const cut = await createImageBitmap(asset.blob, Math.round(part.x), Math.round(part.y), w, h);
    const item = await insertImageBlob(await toPng(cut), spot.index, spot.x, spot.y, undefined, underLast(spot));
    lastClip = item?.id ?? '';
  } catch (err) {
    console.warn(err);
    addToast('That part of the picture could not be cut out', 'warning');
  }
}

async function pageSize(file: string, page: number): Promise<{ w: number; h: number }> {
  const pdf = await openPdf(file);
  return pdf.pages[page - 1];
}

export async function writeOnReferencePage(file: string, page: number) {
  const doc = openDoc();
  if (!doc) return;
  const size = await pageSize(file, page);
  const here = doc.notebook.pages[currentPage()];
  writeOnPage(file, page, size, here?.pdf ? layoutOf(here) : 'full');
}

// a pdf stored to read on the side that nothing uses any more (no tab, no
// page, no clip) goes, but not while an undo could bring a page back
async function sweep(id: string) {
  await new Promise((resolve) => setTimeout(resolve, SWEEP_DELAY));
  const doc = openDoc();
  if (!doc || doc.notebook.id !== id) return;
  const used = () => {
    const ids = new Set(doc.notebook.refs ?? []);
    for (const meta of doc.notebook.pages) if (meta.pdf) ids.add(meta.pdf.assetId);
    return ids;
  };
  try {
    let unused = (await listAssets(id)).filter((a) => a.kind === 'pdf' && !used().has(a.id));
    if (unused.length === 0) return;
    for (const record of await listPages(id)) {
      const text = await record.items.text();
      unused = unused.filter((a) => !text.includes(a.id));
    }
    const ed = editor();
    if (openDoc() !== doc || !ed || ed.view.history.canUndo || ed.view.history.canRedo) return;
    for (let i = 0; i < doc.pageCount; i++) {
      for (const item of doc.pageAt(i).items) {
        if (item.type === 'image' && item.source) unused = unused.filter((a) => a.id !== item.source?.assetId);
      }
    }
    const now = used();
    for (const asset of unused) if (!now.has(asset.id)) await deleteAsset(asset.id);
  } catch (err) {
    console.warn(err);
  }
}

notebookId.subscribe((id) => void loadRefs(id));

// the snip tool cuts from the side panel, so that comes up in the study workspace
activeTool.subscribe((tool) => {
  if (tool !== 'snip' || !openDoc()) return;
  if (!get(panels).rightOpen) showReferencePanel(true);
  if (get(references).length === 0) addToast('Open a pdf on the side to snip from it', 'info', 4000);
});

plugActions({
  showSource: (source) => void showSource(source),
  openReference: (files) => {
    warmPdf();
    if (files) void openFiles(files);
    else void pickFiles('application/pdf,.pdf,image/*').then((picked) => openFiles(picked));
  }
});
