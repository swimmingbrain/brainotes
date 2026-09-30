import { describe, expect, it } from 'vitest';
import { defaultPreferences, mergePreferences } from './preferences';

describe('mergePreferences', () => {
  it('gives the defaults for nothing stored', () => {
    expect(mergePreferences(null)).toEqual(defaultPreferences());
    expect(mergePreferences('not an object')).toEqual(defaultPreferences());
  });

  it('keeps stored values and fills in keys added later', () => {
    const merged = mergePreferences({ workspace: 'board', fingerDraws: true });
    expect(merged.workspace).toBe('board');
    expect(merged.fingerDraws).toBe(true);
    expect(merged.holdToSnap).toBe(true);
    expect(merged.paper).toEqual(defaultPreferences().paper);
  });

  it('has the system ink trail on until it is switched off', () => {
    expect(mergePreferences({}).inkTrail).toBe(true);
    expect(mergePreferences({ inkTrail: false }).inkTrail).toBe(false);
    expect(mergePreferences({ inkTrail: 'no' }).inkTrail).toBe(true);
  });

  it('merges the nested tools and paper objects key by key', () => {
    const merged = mergePreferences({ tools: { laser: false }, paper: { style: 'grid' } });
    expect(merged.tools.laser).toBe(false);
    expect(merged.tools.pen).toBe(true);
    expect(merged.paper.style).toBe('grid');
    expect(merged.paper.spacing).toBe(24);
  });

  it('drops values of the wrong type or outside the allowed set', () => {
    const merged = mergePreferences({ workspace: 'cinema', pressure: 'strong', smoothing: 4, paper: { color: 'pink' } });
    expect(merged.workspace).toBe('notes');
    expect(merged.pressure).toBe(0.5);
    expect(merged.smoothing).toBe(1);
    expect(mergePreferences({ pdfLayout: 'sideways' }).pdfLayout).toBe('full');
    expect(mergePreferences({ pdfLayout: 'below' }).pdfLayout).toBe('below');
    expect(merged.paper.color).toBe('white');
  });

  it('keeps valid pens and picks a default pen that exists', () => {
    const pens = [
      { id: 'green', type: 'marker', color: '#2f9e44', size: 4 },
      { id: 'broken', type: 'crayon', color: '#000', size: 2 }
    ];
    const merged = mergePreferences({ pens, defaultPen: 'black' });
    expect(merged.pens).toEqual([pens[0]]);
    expect(merged.defaultPen).toBe('green');
  });

  it('falls back to the default pens when none are left', () => {
    const merged = mergePreferences({ pens: [] });
    expect(merged.pens).toEqual(defaultPreferences().pens);
    expect(merged.defaultPen).toBe('black');
  });
});
