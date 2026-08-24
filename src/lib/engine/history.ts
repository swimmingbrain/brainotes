import type { Doc, PageData, Placed } from './doc';
import type { Paper } from './types';

// every op can be played forwards and backwards. one gesture is one op
export type Op =
  // removed holds the indices from before, added the indices from after
  | { type: 'items'; pageId: string; removed: Placed[]; added: Placed[] }
  | { type: 'page-add'; index: number; page: PageData }
  | { type: 'page-remove'; index: number; page: PageData }
  | { type: 'page-move'; from: number; to: number }
  | { type: 'paper'; pageId: string; before: Paper; after: Paper }
  | { type: 'batch'; ops: Op[] };

export const HISTORY_LIMIT = 200;

export function applyOp(doc: Doc, op: Op, backwards: boolean) {
  if (op.type === 'items') {
    const out = backwards ? op.added : op.removed;
    const back = backwards ? op.removed : op.added;
    doc.changeItems(
      op.pageId,
      out.map((p) => p.item),
      back
    );
  } else if (op.type === 'page-add' || op.type === 'page-remove') {
    if ((op.type === 'page-add') !== backwards) doc.insertPage(op.index, op.page);
    else doc.removePage(op.index);
  } else if (op.type === 'page-move') {
    if (backwards) doc.movePage(op.to, op.from);
    else doc.movePage(op.from, op.to);
  } else if (op.type === 'paper') {
    doc.setPaper(op.pageId, backwards ? op.before : op.after);
  } else {
    const ops = backwards ? [...op.ops].reverse() : op.ops;
    for (const inner of ops) applyOp(doc, inner, backwards);
  }
}

export class History {
  private done: Op[] = [];
  private undone: Op[] = [];
  onchange: (() => void) | null = null;

  constructor(private doc: Doc) {}

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  // plays the op and keeps it
  run(op: Op) {
    applyOp(this.doc, op, false);
    this.push(op);
  }

  // keeps an op that already happened, like an eraser gesture that changed
  // the page while it went
  push(op: Op) {
    this.done.push(op);
    if (this.done.length > HISTORY_LIMIT) this.done.shift();
    this.undone = [];
    this.onchange?.();
  }

  undo(): Op | null {
    const op = this.done.pop();
    if (!op) return null;
    applyOp(this.doc, op, true);
    this.undone.push(op);
    this.onchange?.();
    return op;
  }

  redo(): Op | null {
    const op = this.undone.pop();
    if (!op) return null;
    applyOp(this.doc, op, false);
    this.done.push(op);
    this.onchange?.();
    return op;
  }

  clear() {
    this.done = [];
    this.undone = [];
    this.onchange?.();
  }
}
