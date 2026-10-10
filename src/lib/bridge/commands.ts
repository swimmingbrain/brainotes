// the commands brainbridge can run in this tab. each one is a thin layer over
// the same code the buttons use, so an edit made from here is one undo step
// like any other and shows up on the page as it happens

import { get } from 'svelte/store';
import { currentPage, openDoc } from '$lib/editor/canvas';
import type { Doc } from '$lib/engine/doc';
import { activeTool, library, zoomPercent } from '$lib/stores/app';
import { version } from '$lib/version';

export type CommandArgs = Record<string, unknown>;

type Command = (args: CommandArgs) => Promise<unknown> | unknown;

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
  }
};

export const commandNames = Object.keys(commands);

export async function runCommand(name: string, args: CommandArgs): Promise<unknown> {
  // own keys only, a call named toString must not find the one every object has
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (!command) throw new Error('unknown command');
  return await command(args ?? {});
}
