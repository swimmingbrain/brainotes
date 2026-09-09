import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Notebook } from '$lib/engine/types';
import type { PackedItems } from './pack';

// the items of a page are packed, see pack.ts
export interface PageRecord extends PackedItems {
  id: string;
  notebookId: string;
}

export type AssetKind = 'pdf' | 'image';

export interface AssetRecord {
  id: string;
  notebookId: string;
  kind: AssetKind;
  name: string;
  type: string;
  blob: Blob;
  w?: number;
  h?: number;
  pageCount?: number;
}

interface Schema extends DBSchema {
  notebooks: { key: string; value: Notebook };
  pages: { key: string; value: PageRecord; indexes: { notebookId: string } };
  assets: { key: string; value: AssetRecord; indexes: { notebookId: string } };
}

export type Database = IDBPDatabase<Schema>;

const NAME = 'brainotes';
const VERSION = 1;

let opening: Promise<Database> | null = null;

export function database(): Promise<Database> {
  if (!opening) {
    opening = openDB<Schema>(NAME, VERSION, {
      upgrade(db) {
        db.createObjectStore('notebooks', { keyPath: 'id' });
        db.createObjectStore('pages', { keyPath: 'id' }).createIndex('notebookId', 'notebookId');
        db.createObjectStore('assets', { keyPath: 'id' }).createIndex('notebookId', 'notebookId');
      },
      // a newer version of the app opened in another tab, this one lets it upgrade
      blocking() {
        void opening?.then((db) => db.close());
        opening = null;
      },
      terminated() {
        opening = null;
      }
    });
  }
  return opening;
}

// notebooks

export async function listNotebooks(): Promise<Notebook[]> {
  return (await database()).getAll('notebooks');
}

export async function getNotebook(id: string): Promise<Notebook | undefined> {
  return (await database()).get('notebooks', id);
}

export async function putNotebook(notebook: Notebook) {
  await (await database()).put('notebooks', notebook);
}

// what one save writes, in one transaction so the page list and the pages
// never disagree
export interface Changes {
  notebook?: Notebook;
  pages: PageRecord[];
  deleted: string[];
}

export async function writeChanges(changes: Changes) {
  const db = await database();
  const tx = db.transaction(['notebooks', 'pages'], 'readwrite');
  const pages = tx.objectStore('pages');
  for (const page of changes.pages) void pages.put(page);
  for (const id of changes.deleted) void pages.delete(id);
  if (changes.notebook) void tx.objectStore('notebooks').put(changes.notebook);
  await tx.done;
}

// a whole notebook at once: a new one, or one read from a file
export async function importNotebook(notebook: Notebook, pages: PageRecord[], assets: AssetRecord[] = []) {
  const db = await database();
  const tx = db.transaction(['notebooks', 'pages', 'assets'], 'readwrite');
  for (const page of pages) void tx.objectStore('pages').put(page);
  for (const asset of assets) void tx.objectStore('assets').put(asset);
  void tx.objectStore('notebooks').put(notebook);
  await tx.done;
}

// the notebook with its pages and its files
export async function deleteNotebook(id: string) {
  const db = await database();
  const tx = db.transaction(['notebooks', 'pages', 'assets'], 'readwrite');
  void tx.objectStore('notebooks').delete(id);
  for (const name of ['pages', 'assets'] as const) {
    const store = tx.objectStore(name);
    const keys = await store.index('notebookId').getAllKeys(id);
    for (const key of keys) void store.delete(key);
  }
  await tx.done;
}

// pages

export async function getPage(id: string): Promise<PageRecord | undefined> {
  return (await database()).get('pages', id);
}

export async function getPages(ids: string[]): Promise<(PageRecord | undefined)[]> {
  const db = await database();
  const tx = db.transaction('pages');
  const records = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  return records;
}

export async function listPages(notebookId: string): Promise<PageRecord[]> {
  return (await database()).getAllFromIndex('pages', 'notebookId', notebookId);
}

// assets

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  return (await database()).get('assets', id);
}

export async function putAsset(asset: AssetRecord) {
  await (await database()).put('assets', asset);
}

export async function deleteAsset(id: string) {
  await (await database()).delete('assets', id);
}

export async function listAssets(notebookId: string): Promise<AssetRecord[]> {
  return (await database()).getAllFromIndex('assets', 'notebookId', notebookId);
}
