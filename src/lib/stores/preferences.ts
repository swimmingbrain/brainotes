import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { ToolId } from '$lib/editor/tools';

export type PenType = 'ballpoint' | 'fountain' | 'marker' | 'pencil' | 'highlighter';
export type PaperStyle = 'blank' | 'lines' | 'grid' | 'dots';
export type PaperColor = 'white' | 'cream' | 'dark';
export type PageSize = 'a4' | 'letter' | 'wide';
export type PdfLayout = 'full' | 'below' | 'beside';

export interface PenPreset {
  id: string;
  type: PenType;
  color: string;
  size: number;
}

export interface Preferences {
  workspace: 'notes' | 'study' | 'board';
  pdfDrop: 'ask' | 'reference' | 'notebook';
  // how write on it lays out a pdf page: alone, or with room below or beside it
  pdfLayout: PdfLayout;
  tools: Record<ToolId, boolean>;
  pens: PenPreset[];
  defaultPen: string;
  paper: { style: PaperStyle; spacing: number; color: PaperColor; size: PageSize };
  fingerDraws: boolean;
  pressure: number;
  smoothing: number;
  holdToSnap: boolean;
  // the system draws the newest bit of a pen line ahead of the page
  inkTrail: boolean;
}

const STORAGE_KEY = 'brainotes-preferences';

export const PEN_TYPES: PenType[] = ['ballpoint', 'fountain', 'marker', 'pencil', 'highlighter'];

export function defaultPreferences(): Preferences {
  return {
    workspace: 'notes',
    pdfDrop: 'ask',
    pdfLayout: 'full',
    tools: {
      select: true,
      pen: true,
      highlighter: true,
      eraser: true,
      shape: true,
      text: true,
      image: true,
      snip: true,
      laser: true,
      hand: true
    },
    pens: [
      { id: 'black', type: 'ballpoint', color: '#1f1f22', size: 2 },
      { id: 'blue', type: 'ballpoint', color: '#1f5fd1', size: 2 },
      { id: 'red', type: 'ballpoint', color: '#d63a3a', size: 2 },
      { id: 'fountain', type: 'fountain', color: '#1f1f22', size: 2 },
      { id: 'yellow', type: 'highlighter', color: '#ffd43b', size: 18 }
    ],
    defaultPen: 'black',
    paper: { style: 'dots', spacing: 24, color: 'white', size: 'a4' },
    fingerDraws: false,
    pressure: 0.5,
    smoothing: 0.5,
    holdToSnap: true,
    inkTrail: true
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// only known keys of the same type, so an old or broken value falls back to the default
function pick<T extends object>(base: T, stored: unknown): T {
  if (!isObject(stored)) return base;
  const out = { ...base };
  for (const key of Object.keys(base) as (keyof T)[]) {
    const value = stored[key as string];
    if (value !== undefined && typeof value === typeof base[key] && !isObject(base[key])) {
      out[key] = value as T[keyof T];
    }
  }
  return out;
}

function validPen(value: unknown): value is PenPreset {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    PEN_TYPES.includes(value.type as PenType) &&
    typeof value.color === 'string' &&
    typeof value.size === 'number' &&
    value.size > 0
  );
}

function oneOf<T extends string>(value: T, allowed: T[], fallback: T): T {
  return allowed.includes(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mergePreferences(stored: unknown): Preferences {
  const defaults = defaultPreferences();
  if (!isObject(stored)) return defaults;

  const merged = pick(defaults, stored);
  merged.tools = pick(defaults.tools, stored.tools);
  merged.paper = pick(defaults.paper, stored.paper);

  merged.workspace = oneOf(merged.workspace, ['notes', 'study', 'board'], defaults.workspace);
  merged.pdfDrop = oneOf(merged.pdfDrop, ['ask', 'reference', 'notebook'], defaults.pdfDrop);
  merged.pdfLayout = oneOf(merged.pdfLayout, ['full', 'below', 'beside'], defaults.pdfLayout);
  merged.paper.style = oneOf(merged.paper.style, ['blank', 'lines', 'grid', 'dots'], defaults.paper.style);
  merged.paper.color = oneOf(merged.paper.color, ['white', 'cream', 'dark'], defaults.paper.color);
  merged.paper.size = oneOf(merged.paper.size, ['a4', 'letter', 'wide'], defaults.paper.size);
  merged.paper.spacing = clamp(merged.paper.spacing, 8, 80);
  merged.pressure = clamp(merged.pressure, 0, 1);
  merged.smoothing = clamp(merged.smoothing, 0, 1);

  const pens = Array.isArray(stored.pens) ? stored.pens.filter(validPen) : [];
  merged.pens = pens.length > 0 ? pens : defaults.pens;
  if (!merged.pens.some((pen) => pen.id === merged.defaultPen)) {
    merged.defaultPen = merged.pens[0].id;
  }
  return merged;
}

function createPreferencesStore() {
  let initial = defaultPreferences();
  if (browser) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) initial = mergePreferences(JSON.parse(stored));
    } catch {}
  }

  const { subscribe, set, update } = writable<Preferences>(initial);

  function persist(value: Preferences) {
    if (!browser) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {}
  }

  return {
    subscribe,
    set(value: Preferences) {
      set(value);
      persist(value);
    },
    update(fn: (prefs: Preferences) => Preferences) {
      update((current) => {
        const next = fn(current);
        persist(next);
        return next;
      });
    }
  };
}

export const preferences = createPreferencesStore();

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  preferences.update((p) => ({ ...p, [key]: value }));
}

export function setPaper<K extends keyof Preferences['paper']>(key: K, value: Preferences['paper'][K]) {
  preferences.update((p) => ({ ...p, paper: { ...p.paper, [key]: value } }));
}
