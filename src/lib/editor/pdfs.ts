import { get } from 'svelte/store';
import { actions } from './actions';
import { addPages, currentPage, openDoc } from './canvas';
import { addNotebook } from './library';
import { newId } from '$lib/engine/doc';
import type { Notebook, NotebookKind, PageMeta } from '$lib/engine/types';
import { placePdfPage, type PdfLayout } from '$lib/pdf/layout';
import { readPdf, type PageSize, type PdfFile } from '$lib/pdf/pdf';
import { putAsset, type AssetRecord } from '$lib/storage/db';
import { addToast, dialog, dismissToast, updateToast } from '$lib/stores/app';
import { preferences } from '$lib/stores/preferences';

export type PdfTarget = 'new' | 'append';

const SLOW = 600;

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name;
}

// reads a pdf under a new asset id. a big one shows its progress in a toast
export async function readFile(file: File): Promise<PdfFile | null> {
  let toast = '';
  let total = 0;
  let done = 0;
  const timer = setTimeout(() => {
    toast = addToast(`Reading ${file.name}...`, 'info', 0);
    if (total > 0) updateToast(toast, `Reading ${file.name}: ${done} of ${total} pages`);
  }, SLOW);
  try {
    return await readPdf(file, newId(), (d, t) => {
      done = d;
      total = t;
      if (toast && (d % 25 === 0 || d === t)) updateToast(toast, `Reading ${file.name}: ${d} of ${t} pages`);
    });
  } catch (err) {
    const locked = err instanceof Error && err.name === 'PasswordException';
    addToast(locked ? `${file.name} is locked with a password` : `${file.name} could not be read as a pdf`, 'warning', 5000);
    return null;
  } finally {
    clearTimeout(timer);
    if (toast) dismissToast(toast);
  }
}

export function pdfAsset(file: File, pdf: PdfFile, notebookId: string): AssetRecord {
  return {
    id: pdf.id,
    notebookId,
    kind: 'pdf',
    name: file.name,
    type: 'application/pdf',
    blob: file,
    pageCount: pdf.pages.length
  };
}

// a notebook page for one pdf page. the room for notes is lined, a page
// that is all pdf is blank. a board gets the pdf page in its middle
export function pdfPageMeta(file: string, page: number, size: PageSize, layout: PdfLayout, kind: NotebookKind): PageMeta {
  const p = placePdfPage(size.w, size.h, layout);
  const paper = get(preferences).paper;
  const board = kind === 'board';
  // a board keeps its pattern around the pdf page
  const style = board ? paper.style : layout === 'full' ? 'blank' : 'lines';
  return {
    id: newId(),
    w: p.w,
    h: p.h,
    // white under a pdf page, so the default black ink stays black on it
    paper: { style, spacing: paper.spacing, color: 'white' },
    pdf: {
      assetId: file,
      page,
      x: board ? p.x - p.w / 2 : p.x,
      y: board ? p.y - p.h / 2 : p.y,
      w: p.pw,
      h: p.ph
    }
  };
}

function pagesOf(pdf: PdfFile, layout: PdfLayout, kind: NotebookKind): PageMeta[] {
  return pdf.pages.map((size, i) => pdfPageMeta(pdf.id, i + 1, size, layout, kind));
}

// every page of every pdf becomes a page to write on: each pdf its own
// notebook, or all of them after the last page of the open one
export async function writeOn(files: File[], layout: PdfLayout, target: PdfTarget) {
  preferences.update((p) => (p.pdfLayout === layout ? p : { ...p, pdfLayout: layout }));
  for (const file of files) {
    const pdf = await readFile(file);
    if (!pdf) continue;
    const doc = openDoc();
    if (target === 'append' && doc) {
      await putAsset(pdfAsset(file, pdf, doc.notebook.id));
      if (openDoc() !== doc) return;
      addPages(doc.pageCount, pagesOf(pdf, layout, doc.kind));
      continue;
    }
    const now = Date.now();
    const notebook: Notebook = {
      id: newId(),
      name: baseName(file.name),
      kind: 'paper',
      createdAt: now,
      updatedAt: now,
      pages: pagesOf(pdf, layout, 'paper'),
      refs: []
    };
    await addNotebook(notebook, {}, [pdfAsset(file, pdf, notebook.id)]);
  }
}

export function writeOnPage(file: string, page: number, size: PageSize, layout: PdfLayout) {
  const doc = openDoc();
  if (!doc) return;
  addPages(currentPage() + 1, [pdfPageMeta(file, page, size, layout, doc.kind)]);
}

// a dropped or opened pdf: the preferences may have the answer, else ask
export function choosePdf(files: File[]) {
  const choice = get(preferences).pdfDrop;
  if (choice === 'reference') actions.openReference(files);
  else if (choice === 'notebook') void writeOn(files, get(preferences).pdfLayout, 'new');
  else dialog.set({ kind: 'pdf', files });
}
