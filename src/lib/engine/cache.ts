import type { TextLayout } from './text';
import type { Box, Item } from './types';

// what the engine works out for an item once: its box, its place in the
// spatial index and its outline. it hangs on the item under a symbol that
// is not enumerable, so saving, cloning, json and spreading never see it.
// big WeakMaps did the same but stalled for several ms whenever they grew
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
