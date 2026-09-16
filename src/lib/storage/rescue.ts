import type { Notebook } from '$lib/engine/types';
import { writeChanges } from './db';
import { itemsFromJson, itemsToJson, packItems } from './pack';
import type { Unsaved } from './saver';

// a tab that closes or reloads gets no time to finish writing to indexeddb,
// the ink of the last second was lost. what is not stored yet goes into
// local storage at once, which is written right away, and the next time
// the notebook opens it is put into the database first
const PREFIX = 'brainotes-rescue-';

interface Rescue {
  notebook: Notebook;
  pages: Record<string, unknown[]>;
  deleted: string[];
}

export function keepRescue(unsaved: Unsaved | null) {
  if (!unsaved) return;
  const pages: Record<string, unknown[]> = {};
  for (const [id, items] of Object.entries(unsaved.pages)) pages[id] = itemsToJson(items);
  const rescue: Rescue = { notebook: unsaved.notebook, pages, deleted: unsaved.deleted };
  try {
    localStorage.setItem(PREFIX + unsaved.notebook.id, JSON.stringify(rescue));
  } catch {
    // too big for local storage or no storage at all, the normal save is all there is
  }
}

export function dropRescue(notebookId: string) {
  try {
    localStorage.removeItem(PREFIX + notebookId);
  } catch {}
}

// writes what a closed tab kept of this notebook, before the notebook is read
export async function recover(notebookId: string) {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFIX + notebookId);
  } catch {}
  if (!raw) return;
  try {
    const rescue = JSON.parse(raw) as Rescue;
    if (rescue.notebook?.id !== notebookId || !Array.isArray(rescue.notebook.pages)) throw new Error('a broken rescue');
    const pages = [];
    for (const [id, list] of Object.entries(rescue.pages ?? {})) {
      pages.push({ id, notebookId, ...(await packItems(itemsFromJson(list))) });
    }
    await writeChanges({ notebook: rescue.notebook, pages, deleted: Array.isArray(rescue.deleted) ? rescue.deleted : [] });
  } catch (err) {
    console.warn('the ink a closed tab kept could not be put back', err);
  }
  dropRescue(notebookId);
}
