import { get } from 'svelte/store';
import { actions } from './actions';
import { togglePresent } from './present';
import { tools, type ToolId } from './tools';
import {
  activeTool,
  dialog,
  notebookName,
  pageIndex,
  showLeftTab,
  toggleLeftPanel,
  toggleRightPanel,
  workspace,
  WORKSPACES
} from '$lib/stores/app';
import type { PaperStyle } from '$lib/stores/preferences';

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category?: string;
  action: () => void;
}

export const PAPER_STYLES: { id: PaperStyle; label: string }[] = [
  { id: 'blank', label: 'Blank' },
  { id: 'lines', label: 'Lines' },
  { id: 'grid', label: 'Grid' },
  { id: 'dots', label: 'Dots' }
];

export function renameNotebook() {
  dialog.set({ kind: 'rename', target: 'notebook', name: get(notebookName) });
}

// everything the palette lists. the shortcut strings are for people, the
// keys themselves are bound in shortcuts.ts. hidden tools are left out
export function buildCommands(visible: Record<ToolId, boolean>): Command[] {
  const c = (id: string, label: string, category: string, action: () => unknown, shortcut?: string): Command => ({
    id,
    label,
    category,
    shortcut,
    action: () => void action()
  });

  const commands: Command[] = [
    // notebook
    c('new-notebook', 'New notebook', 'Notebook', () => actions.newNotebook('paper')),
    c('new-whiteboard', 'New whiteboard', 'Notebook', () => actions.newNotebook('board')),
    c('rename-notebook', 'Rename notebook', 'Notebook', renameNotebook),
    c('library', 'Show the library', 'Notebook', () => showLeftTab('notebooks')),
    c('close-notebook', 'Close notebook', 'Notebook', () => actions.closeNotebook()),
    c('import', 'Import a PDF or images', 'Notebook', () => actions.importFiles(), 'Ctrl+O'),
    c('open-reference', 'Open a PDF on the side', 'Notebook', () => actions.openReference()),
    c('export-pdf', 'Export as PDF', 'Notebook', () => actions.exportNotebook('pdf')),
    c('export-png', 'Export this page as PNG', 'Notebook', () => actions.exportNotebook('png')),
    c('export-file', 'Export a .brainotes file', 'Notebook', () => actions.exportNotebook('brainotes')),

    // pages
    c('new-page', 'New page', 'Pages', () => actions.newPage(), 'Ctrl+Enter'),
    c('next-page', 'Next page', 'Pages', () => actions.nextPage(), 'PageDown'),
    c('previous-page', 'Previous page', 'Pages', () => actions.previousPage(), 'PageUp'),
    c('delete-page', 'Delete this page', 'Pages', () => actions.deletePage(get(pageIndex))),

    // edit
    c('undo', 'Undo', 'Edit', () => actions.undo(), 'Ctrl+Z'),
    c('redo', 'Redo', 'Edit', () => actions.redo(), 'Ctrl+Shift+Z'),
    c('select-all', 'Select all', 'Edit', () => actions.selectAll(), 'Ctrl+A'),
    c('duplicate', 'Duplicate selection', 'Edit', () => actions.duplicateSelection(), 'Ctrl+D'),
    c('delete', 'Delete selection', 'Edit', () => actions.deleteSelection(), 'Delete'),

    // view
    c('zoom-in', 'Zoom in', 'View', () => actions.zoomIn(), 'Ctrl+='),
    c('zoom-out', 'Zoom out', 'View', () => actions.zoomOut(), 'Ctrl+-'),
    c('zoom-reset', 'Fit the page width', 'View', () => actions.zoomReset(), 'Ctrl+0'),
    c('toggle-left', 'Toggle the pages panel', 'View', toggleLeftPanel, 'Ctrl+B'),
    c('toggle-right', 'Toggle the reference panel', 'View', toggleRightPanel, 'Ctrl+Alt+B'),
    c('present', 'Present (fullscreen)', 'View', togglePresent, 'Ctrl+Shift+F'),
    c('shortcuts', 'Keyboard shortcuts', 'View', () => dialog.set({ kind: 'shortcuts' }), 'Shift+/'),
    c('preferences', 'Preferences', 'View', () => dialog.set({ kind: 'preferences' }), 'Ctrl+,')
  ];

  for (const ws of WORKSPACES) {
    commands.push(c(`workspace-${ws.id}`, `Workspace: ${ws.label}`, 'View', () => workspace.set(ws.id), ws.shortcut));
  }
  for (const style of PAPER_STYLES) {
    commands.push(c(`paper-${style.id}`, `Paper: ${style.label}`, 'Pages', () => actions.setPaperStyle(style.id)));
  }
  for (const tool of tools) {
    if (!visible[tool.id]) continue;
    commands.push(c(`tool-${tool.id}`, `Tool: ${tool.label}`, 'Tools', () => activeTool.set(tool.id), tool.shortcut));
  }

  // the palette closes before it runs an action, so a command that opens a
  // dialog never fights it for the keyboard
  return commands.map((cmd) => ({ ...cmd, action: () => queueMicrotask(cmd.action) }));
}
