import { notebookName, notebookOpen, notebookKind, paperStyle, type NotebookKind } from '$lib/stores/app';
import type { PaperStyle } from '$lib/stores/preferences';

export type ExportFormat = 'pdf' | 'png' | 'brainotes';

export interface Actions {
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  // back to the zoom where the page fills the width of the canvas
  zoomReset: () => void;
  newPage: () => void;
  deletePage: (index: number) => void;
  duplicatePage: (index: number) => void;
  movePage: (from: number, to: number) => void;
  goToPage: (index: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  // the page on screen
  setPaperStyle: (style: PaperStyle) => void;
  setPagePaper: (index: number, style: PaperStyle) => void;
  // the paper of page index goes on every page
  paperOnAllPages: (index: number) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  recolorSelection: (color: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  newNotebook: (kind: NotebookKind) => void;
  openNotebook: (id: string) => void;
  closeNotebook: () => void;
  // no id means the notebook that is open
  renameNotebook: (name: string, id?: string) => void;
  deleteNotebook: (id: string) => void;
  // no files means ask for them with a file picker
  importFiles: (files?: File[]) => void;
  openReference: (files?: File[]) => void;
  insertImage: () => void;
  exportNotebook: (format: ExportFormat) => void;
}

function nothing() {}

// every button and key goes through here. the canvas, the storage and the
// pdf code put their own functions in later, the ui never has to change.
// until then each one is harmless, the few that only touch the mirrors
// already do that much
export const actions: Actions = {
  undo: nothing,
  redo: nothing,
  zoomIn: nothing,
  zoomOut: nothing,
  zoomReset: nothing,
  newPage: nothing,
  deletePage: nothing,
  duplicatePage: nothing,
  movePage: nothing,
  goToPage: nothing,
  nextPage: nothing,
  previousPage: nothing,
  setPaperStyle: (style) => paperStyle.set(style),
  setPagePaper: nothing,
  paperOnAllPages: nothing,
  deleteSelection: nothing,
  duplicateSelection: nothing,
  recolorSelection: nothing,
  selectAll: nothing,
  clearSelection: nothing,
  newNotebook: (kind) => {
    notebookKind.set(kind);
    notebookName.set(kind === 'board' ? 'Whiteboard' : 'My notes');
    notebookOpen.set(true);
  },
  openNotebook: nothing,
  closeNotebook: () => notebookOpen.set(false),
  renameNotebook: (name, id) => {
    if (!id) notebookName.set(name);
  },
  deleteNotebook: nothing,
  importFiles: nothing,
  openReference: nothing,
  insertImage: nothing,
  exportNotebook: nothing
};

export function plugActions(next: Partial<Actions>) {
  Object.assign(actions, next);
}
