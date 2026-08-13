import { writable } from 'svelte/store';

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
