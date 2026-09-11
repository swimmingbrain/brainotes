import { get } from 'svelte/store';
import { plugActions } from './actions';
import { currentPage, editor, openDoc, spotAt } from './canvas';
import { insertImageBlob, isImage, pickFiles } from './images';
import { addNotebook } from './library';
import { baseName, isPdf, pdfAsset, readFile, writeOnPage } from './pdfs';
import { newId, newNotebook } from '$lib/engine/doc';
import type { ImageSource } from '$lib/engine/types';
import { layoutOf } from '$lib/pdf/layout';
import { openPdf, renderPart, warmPdf, type Part } from '$lib/pdf/pdf';
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
// ms after a notebook opens before its unused pdfs are looked for
const SWEEP_DELAY = 4000;

// the panel comes up. with both panels closed that is the study workspace
export function showReferencePanel() {
  const p = get(panels);
  if (p.rightOpen) return;
  if (!p.leftOpen && get(workspace) !== 'study') workspace.set('study');
  updatePanels((q) => ({ ...q, rightOpen: true }));
}

function setActive(id: string) {
  activeReference.set(id);
  const doc = openDoc();
  if (doc) saveActive(doc.notebook.id, id);
}

// the list follows the open notebook
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

// pdfs and pictures open in tabs on the side. a file the notebook has
// stored already, like the pdf it was made from, is used again
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
    if (!id && kind === 'pdf') {
      const pdf = await readFile(file);
      if (!pdf) continue;
      id = pdf.id;
      await putAsset(pdfAsset(file, pdf, owner));
    } else if (!id) {
      id = newId();
      await putAsset({ id, notebookId: owner, kind: 'image', name: file.name, type: file.type, blob: file });
    }
    if (!refs.includes(id)) {
      refs.push(id);
      infos.push({ id, name: file.name, kind });
    }
    last = id;
  }
  if (openDoc() !== doc || !last) return;
  doc.setRefs(refs);
  references.set(infos);
  setActive(last);
  showReferencePanel();
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

// a clip goes back to where it came from: its file opens on the side at
// the page, and the part it was cut from flashes
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

// a part of a reference page lands in the notes in the middle of the view,
// selected, remembering where it came from. no part means the whole page
export async function snip(file: string, page: number, part?: Part) {
  const spot = spotAt(null, true);
  if (!spot || !editor()) return;
  try {
    const whole = part ?? { x: 0, y: 0, ...(await pageSize(file, page)) };
    const blob = await toPng(await renderPart(file, page, SNIP_SCALE, part));
    await insertImageBlob(blob, spot.index, spot.x, spot.y, { assetId: file, page, ...whole });
  } catch (err) {
    console.warn(err);
    addToast('That part of the pdf could not be cut out', 'warning');
  }
}

async function pageSize(file: string, page: number): Promise<{ w: number; h: number }> {
  const pdf = await openPdf(file);
  return pdf.pages[page - 1];
}

// a reference page becomes the paper of a new page after the one on screen
export async function writeOnReferencePage(file: string, page: number) {
  const doc = openDoc();
  if (!doc) return;
  const size = await pageSize(file, page);
  const here = doc.notebook.pages[currentPage()];
  writeOnPage(file, page, size, here?.pdf ? layoutOf(here) : 'full');
}

// a pdf a notebook stored once (to read it on the side) and that nothing
// uses any more is deleted the next time the notebook opens. clips keep
// the pdf they came from, so the stored ink is searched for its id too.
// not while there is anything to undo, an undo could bring a page back
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

// the snip tool cuts from the reference panel, so it comes up with it
activeTool.subscribe((tool) => {
  if (tool !== 'snip' || !openDoc()) return;
  showReferencePanel();
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
