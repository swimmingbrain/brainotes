import { notebookName, notebookOpen, notebookKind, paperStyle, type NotebookKind } from '$lib/stores/app';
import type { PaperColor, PaperStyle } from '$lib/stores/preferences';
import type { ImageSource } from '$lib/engine/types';

export type ExportFormat = 'pdf' | 'png' | 'brainotes';
// the whole notebook or the page on screen
export type ExportPages = 'all' | 'page';

// a point of the window in css pixels, like clientX and clientY
export interface Point {
  x: number;
  y: number;
}

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
  setPaperColor: (color: PaperColor) => void;
  setPagePaper: (index: number, paper: { style?: PaperStyle; color?: PaperColor }) => void;
  // the paper of page index goes on every page
  paperOnAllPages: (index: number) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  recolorSelection: (color: string) => void;
  // in page units
  nudgeSelection: (dx: number, dy: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  // at the point, else at the pointer or the middle of the view
  paste: (at?: Point) => void;
  newNotebook: (kind: NotebookKind) => void;
  openNotebook: (id: string) => void;
  closeNotebook: () => void;
  // no id means the notebook that is open
  renameNotebook: (name: string, id?: string) => void;
  deleteNotebook: (id: string) => void;
  // no files means ask for them with a file picker. pictures land at the point
  importFiles: (files?: File[], at?: Point) => void;
  openReference: (files?: File[]) => void;
  // a clip of a pdf goes back to its page on the side
  showSource: (source: ImageSource) => void;
  // picks pictures and puts them at the point or the middle of the view
  insertImage: (at?: Point) => void;
  exportNotebook: (format: ExportFormat, pages?: ExportPages) => void;
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
  setPaperColor: nothing,
  setPagePaper: nothing,
  paperOnAllPages: nothing,
  deleteSelection: nothing,
  duplicateSelection: nothing,
  recolorSelection: nothing,
  nudgeSelection: nothing,
  selectAll: nothing,
  clearSelection: nothing,
  copySelection: nothing,
  cutSelection: nothing,
  paste: nothing,
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
  showSource: nothing,
  insertImage: nothing,
  exportNotebook: nothing
};

export function plugActions(next: Partial<Actions>) {
  Object.assign(actions, next);
}
