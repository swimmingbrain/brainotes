import { get } from 'svelte/store';
import { tinykeys, type KeybindingHandler, type KeybindingsMap } from 'tinykeys';
import { actions } from './actions';
import { togglePresent } from './present';
import { tools, type ToolId } from './tools';
import {
  activeTool,
  commandPaletteOpen,
  contextMenu,
  dialog,
  selectionCount,
  selectTool,
  toggleLeftPanel,
  toggleRightPanel,
  workspace
} from '$lib/stores/app';

// every handler swallows the key so the page never scrolls, zooms or clicks
// a focused button behind it. letters are matched by what is printed on the
// key, so ctrl+z stays ctrl+z on a german keyboard too

function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

// a dialog or the palette owns the keyboard while it is up
function blocked(): boolean {
  return get(dialog) !== null || get(commandPaletteOpen);
}

function escape(): void {
  if (get(contextMenu)) {
    contextMenu.set(null);
    return;
  }
  if (get(commandPaletteOpen)) {
    commandPaletteOpen.set(false);
    return;
  }
  if (get(dialog)) {
    dialog.set(null);
    return;
  }
  if (get(selectionCount) > 0) {
    actions.clearSelection();
    return;
  }
  // most browsers leave fullscreen on escape by themselves, the ones that
  // hand the key on leave present here
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}

function bind(fn: () => unknown): KeybindingHandler {
  return (e) => {
    e.preventDefault();
    void fn();
  };
}

// the arrows move a selection, with shift in bigger steps. without one
// they only turn pages on the board, where nothing else wants them
function arrow(dx: number, dy: number, page: () => unknown): KeybindingHandler {
  return (e) => {
    if (get(selectionCount) > 0) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      actions.nudgeSelection(dx * step, dy * step);
      return;
    }
    if (get(workspace) !== 'board' || e.shiftKey) return;
    e.preventDefault();
    void page();
  };
}

// holding space is the hand for as long as it is held, then the tool from
// before comes back
function installSpaceHand(target: Window): () => void {
  let heldFrom: ToolId | null = null;

  function release() {
    if (heldFrom === null) return;
    activeTool.set(heldFrom);
    heldFrom = null;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (editable(e.target) || blocked()) return;
    e.preventDefault();
    if (heldFrom !== null) return;
    heldFrom = get(activeTool);
    activeTool.set('hand');
  }

  function onkeyup(e: KeyboardEvent) {
    if (e.code !== 'Space' || heldFrom === null) return;
    e.preventDefault();
    release();
  }

  target.addEventListener('keydown', onkeydown);
  target.addEventListener('keyup', onkeyup);
  target.addEventListener('blur', release);
  return () => {
    target.removeEventListener('keydown', onkeydown);
    target.removeEventListener('keyup', onkeyup);
    target.removeEventListener('blur', release);
  };
}

export function installShortcuts(target: Window = window): () => void {
  const bindings: KeybindingsMap = {
    // edit
    '$mod+z': bind(() => actions.undo()),
    '$mod+Shift+z': bind(() => actions.redo()),
    '$mod+y': bind(() => actions.redo()),
    '$mod+a': bind(() => actions.selectAll()),
    '$mod+d': bind(() => actions.duplicateSelection()),
    Delete: bind(() => actions.deleteSelection()),
    Backspace: bind(() => actions.deleteSelection()),
    Escape: bind(escape),
    // copy, cut and paste come as clipboard events, see clipboard.ts

    // pages
    '$mod+Enter': bind(() => actions.newPage()),
    PageDown: bind(() => actions.nextPage()),
    PageUp: bind(() => actions.previousPage()),
    ArrowRight: arrow(1, 0, () => actions.nextPage()),
    ArrowDown: arrow(0, 1, () => actions.nextPage()),
    ArrowLeft: arrow(-1, 0, () => actions.previousPage()),
    ArrowUp: arrow(0, -1, () => actions.previousPage()),
    'Shift+ArrowRight': arrow(1, 0, () => {}),
    'Shift+ArrowDown': arrow(0, 1, () => {}),
    'Shift+ArrowLeft': arrow(-1, 0, () => {}),
    'Shift+ArrowUp': arrow(0, -1, () => {}),

    // view
    '$mod+=': bind(() => actions.zoomIn()),
    '$mod+[Shift]++': bind(() => actions.zoomIn()),
    '$mod+NumpadAdd': bind(() => actions.zoomIn()),
    '$mod+-': bind(() => actions.zoomOut()),
    '$mod+NumpadSubtract': bind(() => actions.zoomOut()),
    '$mod+0': bind(() => actions.zoomReset()),
    '$mod+Numpad0': bind(() => actions.zoomReset()),
    '$mod+b': bind(toggleLeftPanel),
    '$mod+Alt+b': bind(toggleRightPanel),
    '$mod+1': bind(() => workspace.set('notes')),
    '$mod+2': bind(() => workspace.set('study')),
    '$mod+3': bind(() => workspace.set('board')),
    '$mod+Shift+f': bind(togglePresent),

    // app
    '$mod+k': bind(() => commandPaletteOpen.set(true)),
    '$mod+,': bind(() => dialog.set({ kind: 'preferences' })),
    'Shift+?': bind(() => dialog.set({ kind: 'shortcuts' })),
    '$mod+o': bind(() => actions.importFiles())
  };

  for (const tool of tools) {
    bindings[tool.shortcut.toLowerCase()] = bind(() => selectTool(tool.id));
  }

  const removeKeys = tinykeys(target, bindings, {
    ignore: (e) => {
      // fields handle their own keys, escape included
      if (editable(e.target)) return true;
      // elsewhere escape always gets through, it is how you leave things
      if (e.key === 'Escape') return false;
      return blocked();
    }
  });
  const removeSpace = installSpaceHand(target);

  return () => {
    removeKeys();
    removeSpace();
  };
}
