import { get } from 'svelte/store';
import { openDoc } from '$lib/editor/canvas';
import { addToast, dialog, notebookTex } from '$lib/stores/app';
import { bridgeEvent } from './connection';
import { DEFAULT_PORT } from './protocol';
import { bridge } from './state';

// texbrain, the latex editor the notes get written up in
export const TEX_APP = 'https://tex.swimmingbrain.dev';

// the editor opens the project and connects to the same server
export function texUrl(project: string, port = DEFAULT_PORT): string {
  const flag = port === DEFAULT_PORT ? 'bridge' : `bridge=${port}`;
  return `${TEX_APP}/editor?project=${encodeURIComponent(project)}&${flag}`;
}

// an empty name takes the link away, false when no notebook is open
export function linkProject(project: string | null): boolean {
  const doc = openDoc();
  if (!doc) return false;
  doc.link(project?.trim() || null);
  return true;
}

export function askForProject(): void {
  if (!openDoc()) {
    addToast('Open a notebook first', 'info');
    return;
  }
  dialog.set({ kind: 'link', tex: get(notebookTex) });
}

// a new tab with the project, and a connected server may bring it up in the texbrain tab it has
export function openInTex(): void {
  const project = get(notebookTex);
  if (!project) {
    askForProject();
    return;
  }
  window.open(texUrl(project, get(bridge).port), '_blank', 'noopener');
  bridgeEvent('switch', { to: 'tex', project });
}
