import { plugActions, type ExportPages } from './actions';
import { currentPage, loadPage, openDoc } from './canvas';
import type { Doc } from '$lib/engine/doc';
import type { Item, Notebook, PageMeta } from '$lib/engine/types';
import { fileName, saveFile, type FileKind } from '$lib/export/save';
import { getAsset, listAssets } from '$lib/storage/db';
import { addToast, dismissToast, updateToast } from '$lib/stores/app';

// one export at a time, a second click would only fight the first for the dialog
let busy = false;

function stoppedError(): DOMException {
  return new DOMException('the export was stopped', 'AbortError');
}

// a page with all its items, as long as its notebook is still the open one
async function pageOf(doc: Doc, id: string): Promise<{ meta: PageMeta; items: Item[] }> {
  if (openDoc() !== doc) throw stoppedError();
  const page = await loadPage(id);
  if (!page || openDoc() !== doc) throw stoppedError();
  // a page that could not be read would go into the file empty
  if (!page.ready) throw new Error('a page could not be read');
  return { meta: page.meta, items: page.items.slice() };
}

async function assetBlob(id: string): Promise<Blob | undefined> {
  return (await getAsset(id))?.blob;
}

// the dialog opens at once and the work runs behind it with a toast that
// counts. a closed dialog stops the work
function run(kind: FileKind, name: string, label: string, work: (stopped: () => boolean, toast: string) => Promise<Blob>) {
  if (busy) {
    addToast('An export is already running', 'info');
    return;
  }
  busy = true;
  let stopped = false;
  const toast = addToast(`Exporting ${label}...`, 'info', 0);
  const blob = work(() => stopped, toast);
  // the work can stop on its own (the notebook was closed), the file the
  // dialog made is then left empty
  let broke = false;
  blob.catch(() => (broke = true));
  void saveFile(blob, fileName(name, kind), kind)
    .then((saved) => {
      if (broke) addToast(`The ${label} export stopped before it was done`, 'warning', 5000);
      else if (!saved) stopped = true;
      else addToast(`Exported ${label}`, 'success');
    })
    .catch((err) => {
      console.error(err);
      addToast(`The ${label} could not be exported`, 'error', 5000);
    })
    .finally(() => {
      dismissToast(toast);
      busy = false;
    });
}

function exportPdf(pages: ExportPages) {
  const doc = openDoc();
  if (!doc || doc.pageCount === 0) return;
  // pages are followed by id, they may move while the export runs
  const ids = pages === 'all' ? doc.notebook.pages.map((p) => p.id) : [doc.notebook.pages[currentPage()].id];
  const notebook = { ...doc.notebook };
  const name = pages === 'all' ? notebook.name : `${notebook.name} p${currentPage() + 1}`;
  const word = doc.kind === 'board' ? 'board' : 'page';
  run('pdf', name, 'PDF', async (stopped, toast) => {
    const [{ exportPdf }] = await Promise.all([import('$lib/export/pdf'), document.fonts?.ready]);
    return exportPdf(
      notebook,
      ids.map((_, i) => i),
      { page: (i) => pageOf(doc, ids[i]), asset: assetBlob },
      {
        stopped,
        progress: (done, total) => {
          if (total > 1) updateToast(toast, `Exporting PDF: ${done} of ${total} ${word}s`);
        }
      }
    );
  });
}

function exportPng() {
  const doc = openDoc();
  if (!doc || doc.pageCount === 0) return;
  const index = currentPage();
  const id = doc.notebook.pages[index].id;
  run('png', `${doc.notebook.name} p${index + 1}`, 'PNG', async () => {
    const [{ exportPng }] = await Promise.all([import('$lib/export/png'), document.fonts?.ready]);
    return exportPng(await pageOf(doc, id), doc.kind === 'board');
  });
}

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// the stored files a notebook still uses: its pdf pages, the files on the
// side, its pictures and the pdfs its clips came from
function usedAssets(notebook: Notebook, pages: Record<string, Item[]>): Set<string> {
  const used = new Set(notebook.refs);
  for (const meta of notebook.pages) if (meta.pdf) used.add(meta.pdf.assetId);
  for (const items of Object.values(pages)) {
    for (const item of items) {
      if (item.type !== 'image') continue;
      used.add(item.assetId);
      if (item.source) used.add(item.source.assetId);
    }
  }
  return used;
}

function exportFile() {
  const doc = openDoc();
  if (!doc) return;
  const notebook = JSON.parse(JSON.stringify(doc.notebook)) as Notebook;
  const total = notebook.pages.length;
  run('brainotes', notebook.name, '.brainotes file', async (stopped, toast) => {
    const { writeNotebookFile } = await import('$lib/storage/file');
    const pages: Record<string, Item[]> = {};
    for (let i = 0; i < total; i++) {
      if (stopped()) throw stoppedError();
      const id = notebook.pages[i].id;
      const { items } = await pageOf(doc, id);
      if (items.length > 0) pages[id] = items;
      if (total > 20 && (i + 1) % 10 === 0) updateToast(toast, `Packing the notebook: ${i + 1} of ${total} pages`);
    }
    const used = usedAssets(notebook, pages);
    const assets = (await listAssets(notebook.id)).filter((asset) => used.has(asset.id));
    return writeNotebookFile({ notebook, pages, assets }, pause);
  });
}

plugActions({
  exportNotebook: (format, pages = 'all') => {
    if (format === 'pdf') exportPdf(pages);
    else if (format === 'png') exportPng();
    else exportFile();
  }
});
