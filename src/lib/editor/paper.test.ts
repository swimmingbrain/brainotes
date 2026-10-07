import { describe, expect, it } from 'vitest';
import { spacingFor, STYLE_SPACING } from './paper';

describe('spacingFor', () => {
  it('has dots at 12 and lines and grids at 24', () => {
    expect(STYLE_SPACING.dots).toBe(12);
    expect(STYLE_SPACING.lines).toBe(24);
    expect(STYLE_SPACING.grid).toBe(24);
  });

  it('moves a default step to the default of the new style', () => {
    expect(spacingFor({ style: 'dots', spacing: 12 }, 'lines')).toBe(24);
    expect(spacingFor({ style: 'lines', spacing: 24 }, 'dots')).toBe(12);
    expect(spacingFor({ style: 'blank', spacing: 24 }, 'grid')).toBe(24);
    expect(spacingFor({ style: 'dots', spacing: 12 }, 'dots')).toBe(12);
  });

  it('keeps a step picked by hand', () => {
    expect(spacingFor({ style: 'dots', spacing: 24 }, 'lines')).toBe(24);
    expect(spacingFor({ style: 'lines', spacing: 30 }, 'dots')).toBe(30);
  });
});
