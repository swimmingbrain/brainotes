import { derived, get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { preferences } from './preferences';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export const toasts = writable<Array<{ id: string; message: string; type: ToastType }>>([]);

let toastId = 0;
export function addToast(message: string, type: ToastType = 'info', duration = 3000) {
  const id = String(++toastId);
  toasts.update((t) => [...t, { id, message, type }]);
  if (duration > 0) {
    setTimeout(() => {
      toasts.update((t) => t.filter((toast) => toast.id !== id));
    }, duration);
  }
  return id;
}

export const commandPaletteOpen = writable(false);

export type PreferencesCategory = 'general' | 'tools' | 'pens' | 'paper' | 'input';

export type Dialog =
  | { kind: 'preferences'; category?: PreferencesCategory }
  | { kind: 'shortcuts' }
  // no id means the notebook that is open right now
  | { kind: 'rename'; target: 'notebook'; id?: string; name: string };

export const dialog = writable<Dialog | null>(null);

export interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  checked?: boolean;
  action?: () => void;
  children?: MenuItem[];
}

export const contextMenu = writable<{ x: number; y: number; items: MenuItem[] } | null>(null);

export type Workspace = 'notes' | 'study' | 'board';

export const WORKSPACES: { id: Workspace; label: string; shortcut: string }[] = [
  { id: 'notes', label: 'Notes', shortcut: 'Ctrl+1' },
  { id: 'study', label: 'Study', shortcut: 'Ctrl+2' },
  { id: 'board', label: 'Board', shortcut: 'Ctrl+3' }
];

export const workspace = writable<Workspace>(get(preferences).workspace);

export type LeftPanelTab = 'pages' | 'notebooks';
export const leftPanelTab = writable<LeftPanelTab>('pages');

export interface PanelLayout {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  // the reference panel grows with the window, so it is kept as a share of
  // the main area and not in pixels
  rightShare: number;
}

export const MIN_LEFT = 160;
export const MIN_RIGHT = 300;

const LAYOUT_KEY = 'brainotes-layout';

// a workspace only says which panels start open, they can still be
// toggled by hand and every workspace remembers its own
function defaultLayout(): Record<Workspace, PanelLayout> {
  return {
    notes: { leftOpen: true, rightOpen: false, leftWidth: 220, rightShare: 0.45 },
    study: { leftOpen: false, rightOpen: true, leftWidth: 220, rightShare: 0.45 },
    board: { leftOpen: false, rightOpen: false, leftWidth: 220, rightShare: 0.45 }
  };
}

function readLayout(): Record<Workspace, PanelLayout> {
  const layout = defaultLayout();
  if (!browser) return layout;
  try {
    const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null');
    if (!stored || typeof stored !== 'object') return layout;
    for (const ws of Object.keys(layout) as Workspace[]) {
      const saved = stored[ws];
      if (!saved || typeof saved !== 'object') continue;
      const entry = layout[ws];
      if (typeof saved.leftOpen === 'boolean') entry.leftOpen = saved.leftOpen;
      if (typeof saved.rightOpen === 'boolean') entry.rightOpen = saved.rightOpen;
      if (typeof saved.leftWidth === 'number') entry.leftWidth = Math.max(MIN_LEFT, saved.leftWidth);
      if (typeof saved.rightShare === 'number') entry.rightShare = Math.max(0.1, Math.min(0.8, saved.rightShare));
    }
  } catch {}
  return layout;
}

function createLayout() {
  const { subscribe, update } = writable(readLayout());

  return {
    subscribe,
    update(fn: (layout: Record<Workspace, PanelLayout>) => Record<Workspace, PanelLayout>) {
      update((current) => {
        const next = fn(current);
        if (browser) {
          try {
            localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
          } catch {}
        }
        return next;
      });
    }
  };
}

export const layout = createLayout();

// the panels of the workspace that is up right now
export const panels = derived([layout, workspace], ([$layout, $workspace]) => $layout[$workspace]);

export function updatePanels(fn: (panels: PanelLayout) => PanelLayout) {
  const ws = get(workspace);
  layout.update((all) => ({ ...all, [ws]: fn(all[ws]) }));
}

export function toggleLeftPanel() {
  updatePanels((p) => ({ ...p, leftOpen: !p.leftOpen }));
}

export function toggleRightPanel() {
  updatePanels((p) => ({ ...p, rightOpen: !p.rightOpen }));
}

export function showLeftTab(tab: LeftPanelTab) {
  leftPanelTab.set(tab);
  updatePanels((p) => ({ ...p, leftOpen: true }));
}
