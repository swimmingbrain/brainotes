import { describe, expect, it } from 'vitest';
import { defaultPreferences, mergePreferences } from './preferences';

// the favourite pens as they were saved before version 2
const OLD_PENS = [
  { id: 'black', type: 'ballpoint', color: '#1f1f22', size: 2.5 },
  { id: 'blue', type: 'ballpoint', color: '#1f5fd1', size: 2.5 },
  { id: 'red', type: 'ballpoint', color: '#d63a3a', size: 2.5 },
  { id: 'fountain', type: 'fountain', color: '#1f1f22', size: 3.5 },
  { id: 'yellow', type: 'highlighter', color: '#ffd43b', size: 18 }
];

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

  it('starts the pens at size 2 and the highlighter at 18', () => {
    const sizes = defaultPreferences().pens.map((pen) => [pen.type, pen.size]);
    expect(sizes).toEqual([
      ['ballpoint', 2],
      ['ballpoint', 2],
      ['ballpoint', 2],
      ['fountain', 2],
      ['highlighter', 18]
    ]);
  });

  it('starts new notebooks on dots 12 apart, a stored style without a step gets its own', () => {
    expect(defaultPreferences().paper).toEqual({ style: 'dots', spacing: 12, color: 'white', size: 'a4' });
    expect(mergePreferences({ paper: { style: 'lines' } }).paper.spacing).toBe(24);
    expect(mergePreferences({ paper: { style: 'dots', spacing: 30 } }).paper.spacing).toBe(30);
  });

  it('moves pens saved on the old defaults to the new sizes', () => {
    const merged = mergePreferences({ pens: OLD_PENS, defaultPen: 'blue' });
    expect(merged.pens).toEqual(defaultPreferences().pens);
    expect(merged.defaultPen).toBe('blue');
    expect(merged.version).toBe(2);
  });

  it('keeps pens changed by hand and pens saved after the move', () => {
    const thicker = OLD_PENS.map((pen) => (pen.id === 'red' ? { ...pen, size: 3 } : pen));
    expect(mergePreferences({ pens: thicker }).pens).toEqual(thicker);
    const fewer = OLD_PENS.slice(0, 4);
    expect(mergePreferences({ pens: fewer }).pens).toEqual(fewer);
    expect(mergePreferences({ pens: OLD_PENS, version: 2 }).pens).toEqual(OLD_PENS);
  });

  it('moves the old default paper to dots 12 apart', () => {
    const old = { style: 'dots', spacing: 24, color: 'white', size: 'a4' };
    expect(mergePreferences({ paper: old }).paper).toEqual(defaultPreferences().paper);
    expect(mergePreferences({ paper: { style: 'dots', spacing: 24, color: 'white' } }).paper.spacing).toBe(12);
  });

  it('keeps a paper changed by hand and one saved after the move', () => {
    expect(mergePreferences({ paper: { style: 'dots', spacing: 24, color: 'cream', size: 'a4' } }).paper.spacing).toBe(24);
    expect(mergePreferences({ paper: { style: 'dots', spacing: 24, color: 'white', size: 'letter' } }).paper.spacing).toBe(24);
    expect(mergePreferences({ paper: { style: 'lines', spacing: 24, color: 'white', size: 'a4' } }).paper.spacing).toBe(24);
    expect(mergePreferences({ paper: { style: 'dots', spacing: 20, color: 'white', size: 'a4' } }).paper.spacing).toBe(20);
    const saved = { style: 'dots', spacing: 24, color: 'white', size: 'a4' };
    expect(mergePreferences({ paper: saved, version: 2 }).paper.spacing).toBe(24);
  });
});
