import { addToast } from '$lib/stores/app';
import { preferences, type PenPreset, type PenType } from '$lib/stores/preferences';
import { sameColor } from './colors';

type Pen = Omit<PenPreset, 'id'>;

export const PEN_TYPE_OPTIONS: { value: PenType; label: string }[] = [
  { value: 'ballpoint', label: 'Ballpoint' },
  { value: 'fountain', label: 'Fountain' },
  { value: 'marker', label: 'Marker' },
  { value: 'pencil', label: 'Pencil' },
  { value: 'highlighter', label: 'Highlighter' }
];

export function samePen(a: Pen, b: Pen): boolean {
  return a.type === b.type && sameColor(a.color, b.color) && a.size === b.size;
}

export function newPenId(): string {
  return `pen-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

export function addFavourite(pen: Pen) {
  let added = false;
  preferences.update((p) => {
    if (p.pens.some((x) => samePen(x, pen))) return p;
    added = true;
    return { ...p, pens: [...p.pens, { id: newPenId(), ...pen }] };
  });
  addToast(added ? 'Added to your favourite pens' : 'That pen is already a favourite', added ? 'success' : 'info');
}

// the default pen has to be a favourite, so it becomes one on the way
export function makeDefaultPen(pen: Pen) {
  preferences.update((p) => {
    const match = p.pens.find((x) => samePen(x, pen));
    if (match) return { ...p, defaultPen: match.id };
    const fresh = { id: newPenId(), ...pen };
    return { ...p, pens: [...p.pens, fresh], defaultPen: fresh.id };
  });
  addToast('This pen is ready every time the app opens', 'success');
}
