// the commands brainbridge can run in this tab. each one is a thin layer over
// the same code the buttons use, so an edit made from here is one undo step
// like any other and shows up on the page as it happens

import { get } from 'svelte/store';
import { currentPage, editor, openDoc, type Editor } from '$lib/editor/canvas';
import { createNotebook, openNotebookById } from '$lib/editor/library';
import type { Doc } from '$lib/engine/doc';
import { listNotebooks } from '$lib/storage/db';
import { activeTool, library, zoomPercent } from '$lib/stores/app';
import { version } from '$lib/version';

export type CommandArgs = Record<string, unknown>;

type Command = (args: CommandArgs) => Promise<unknown> | unknown;

// ms the canvas gets to show up after a notebook opened
const CANVAS_WAIT = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function requireDoc(): Doc {
  const doc = openDoc();
  if (!doc) throw new Error('No notebook is open. Call open or create, or open one in the tab.');
  return doc;
}

// the canvas mounts a moment after the notebook opened, edits go through it
async function requireEditor(): Promise<Editor> {
  requireDoc();
  const until = Date.now() + CANVAS_WAIT;
  for (;;) {
    const ed = editor();
    if (ed) return ed;
    if (Date.now() > until) throw new Error('The notebook is open but its pages did not show up in the tab');
    await sleep(50);
  }
}

// the same name in another case counts too, the exact one wins
async function idByName(name: string): Promise<string> {
  const all = (await listNotebooks()).sort((a, b) => b.updatedAt - a.updatedAt);
  const found = all.find((n) => n.name === name) ?? all.find((n) => n.name.toLowerCase() === name.trim().toLowerCase());
  if (!found) throw new Error(`No notebook called "${name}"; see notebooks`);
  return found.id;
}

function describe(doc: Doc | null) {
  if (!doc) return null;
  const { id, name, kind, tex } = doc.notebook;
  return { id, name, kind, pages: doc.pageCount, tex: tex ?? null };
}

function status() {
  const doc = openDoc();
  return {
    notebook: describe(doc),
    page: doc ? currentPage() : null,
    tool: get(activeTool),
    zoom: get(zoomPercent) / 100,
    version
  };
}

const commands: Record<string, Command> = {
  status,

  // the open notebook's row can be ahead of the stored one, memory has the newest
  notebooks() {
    const doc = openDoc();
    return get(library).map((row) => {
      const open = row.id === doc?.notebook.id ? doc : null;
      return {
        id: row.id,
        name: open ? open.notebook.name : row.name,
        kind: row.kind,
        pages: open ? open.pageCount : row.pageCount,
        updatedAt: row.modifiedAt,
        tex: (open ? open.notebook.tex : row.tex) || null
      };
    });
  },

  async open({ id, name }) {
    const wanted = optStr(id) ?? (await idByName(str(name, 'id or name')));
    await openNotebookById(wanted);
    await requireEditor();
    return status();
  },

  async create({ name, kind }) {
    const type = kind ?? 'paper';
    if (type !== 'paper' && type !== 'board') throw new Error("kind must be 'paper' or 'board'");
    await createNotebook(type, optStr(name)?.trim() ?? (type === 'board' ? 'Whiteboard' : 'Notebook'));
    await requireEditor();
    return status();
  }
};

export const commandNames = Object.keys(commands);

export async function runCommand(name: string, args: CommandArgs): Promise<unknown> {
  // own keys only, a call named toString must not find the one every object has
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (!command) throw new Error('unknown command');
  return await command(args ?? {});
}
