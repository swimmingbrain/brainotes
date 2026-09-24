import type { TextLayout } from './text';
import type { Box, Item } from './types';

// what the engine works out for an item once, under a hidden symbol so json
// and spreading never see it. big WeakMaps stalled for ms when they grew
export interface Derived {
  box?: Box;
  entry?: Box & { item: Item; z: number };
  path?: Path2D;
  line?: Path2D;
  text?: TextLayout;
}

const KEY = Symbol('derived');

export function derived(item: Item): Derived {
  const holder = item as unknown as Record<symbol, Derived | undefined>;
  let d = holder[KEY];
  if (!d) {
    d = {};
    Object.defineProperty(item, KEY, { value: d });
  }
  return d;
}
