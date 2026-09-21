import type { Notebook } from '$lib/engine/types';
import { writeChanges } from './db';
import { itemsFromJson, itemsToJson, packItems } from './pack';
import type { Unsaved } from './saver';

// a closing tab gets no time to finish writing to indexeddb. what is not
// stored yet goes into local storage, which writes at once, and into the
// database the next time the notebook opens
const PREFIX = 'brainotes-rescue-';

interface Rescue {
  notebook: Notebook;
  pages: Record<string, unknown[]>;
  deleted: string[];
}

export function keepRescue(unsaved: Unsaved | null): boolean {
  if (!unsaved) return false;
  const pages: Record<string, unknown[]> = {};
  for (const [id, items] of Object.entries(unsaved.pages)) pages[id] = itemsToJson(items);
  const rescue: Rescue = { notebook: unsaved.notebook, pages, deleted: unsaved.deleted };
  try {
    localStorage.setItem(PREFIX + unsaved.notebook.id, JSON.stringify(rescue));
    return true;
  } catch {
    // too big or no local storage, the normal save is all there is
    return false;
  }
}

export function dropRescue(notebookId: string) {
  try {
    localStorage.removeItem(PREFIX + notebookId);
  } catch {}
}

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
