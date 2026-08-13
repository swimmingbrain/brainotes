export type ToolId = 'select' | 'pen' | 'highlighter' | 'eraser' | 'shape' | 'text' | 'image' | 'snip' | 'laser' | 'hand';

export interface Tool {
  id: ToolId;
  label: string;
  shortcut: string;
  // css cursor the canvas shows while the tool is active
  cursor: string;
  // key into the icon set of ui/Icon.svelte
  icon: string;
}

// the order of the rail. the tools you write with sit at the top, the ones
// you only reach for now and then further down
export const tools: Tool[] = [
  { id: 'select', label: 'Lasso select', shortcut: 'V', cursor: 'default', icon: 'lasso' },
  { id: 'pen', label: 'Pen', shortcut: 'P', cursor: 'crosshair', icon: 'pen' },
  { id: 'highlighter', label: 'Highlighter', shortcut: 'H', cursor: 'crosshair', icon: 'highlighter' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', cursor: 'cell', icon: 'eraser' },
  { id: 'shape', label: 'Shape', shortcut: 'S', cursor: 'crosshair', icon: 'shape' },
  { id: 'text', label: 'Text', shortcut: 'T', cursor: 'text', icon: 'text' },
  { id: 'image', label: 'Image', shortcut: 'I', cursor: 'copy', icon: 'image' },
  { id: 'snip', label: 'Snip', shortcut: 'X', cursor: 'crosshair', icon: 'snip' },
  { id: 'laser', label: 'Laser', shortcut: 'L', cursor: 'crosshair', icon: 'laser' },
  { id: 'hand', label: 'Hand', shortcut: 'G', cursor: 'grab', icon: 'hand' }
];

export function toolById(id: ToolId): Tool {
  const tool = tools.find((t) => t.id === id);
  // the id type keeps this unreachable, the fallback is there so callers
  // never have to deal with undefined
  return tool ?? tools[0];
}
