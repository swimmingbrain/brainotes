import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface RefInfo {
  id: string;
  name: string;
  kind: 'pdf' | 'image';
}

// the files open on the side for the open notebook, and the one shown
export const references = writable<RefInfo[]>([]);
export const activeReference = writable('');

// a spot of a file to scroll to and flash for a moment. part is in points
export interface RefFocus {
  file: string;
  page: number;
  part?: { x: number; y: number; w: number; h: number };
  at: number;
}

export const referenceFocus = writable<RefFocus | null>(null);

// where a file was left: the page at the top with how far into it it was
// scrolled (2.5 is half way down page 3), and the zoom over fit width
export interface ReadingSpot {
  at: number;
  zoom: number;
}

const KEY = 'brainotes-reading';
const KEEP = 100;

let spots: Record<string, ReadingSpot & { t: number }> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

if (browser) {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (stored && typeof stored === 'object') spots = stored;
  } catch {}
}

export function readingSpot(id: string): ReadingSpot | null {
  const spot = spots[id];
  if (!spot || typeof spot.at !== 'number' || typeof spot.zoom !== 'number') return null;
  return { at: spot.at, zoom: spot.zoom };
}

export function keepReadingSpot(id: string, spot: ReadingSpot) {
  spots[id] = { ...spot, t: Date.now() };
  if (!browser || timer) return;
  timer = setTimeout(() => {
    timer = null;
    const ids = Object.keys(spots).sort((a, b) => spots[b].t - spots[a].t);
    for (const old of ids.slice(KEEP)) delete spots[old];
    try {
      localStorage.setItem(KEY, JSON.stringify(spots));
    } catch {}
  }, 400);
}

// the tab each notebook had up, so it comes back after a reload
const ACTIVE_KEY = 'brainotes-reading-tab';

export function savedActive(notebookId: string): string {
  if (!browser) return '';
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? '{}')[notebookId] ?? '';
  } catch {
    return '';
  }
}

export function saveActive(notebookId: string, id: string) {
  if (!browser || !notebookId) return;
  try {
    const all = JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? '{}');
    all[notebookId] = id;
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(all));
  } catch {}
}
