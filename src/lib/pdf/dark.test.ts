import { describe, expect, it } from 'vitest';
import { isDarkLightness, lightness } from './dark';

function pixels(r: number, g: number, b: number, count = 4): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(r, g, b, 255);
  return out;
}

describe('dark pdf pages', () => {
  it('finds a white page light and a dark slide dark', () => {
    expect(lightness(pixels(255, 255, 255))).toBeCloseTo(1);
    expect(isDarkLightness(lightness(pixels(255, 255, 255)))).toBe(false);
    expect(isDarkLightness(lightness(pixels(30, 30, 60)))).toBe(true);
  });

  it('averages a slide with some white text on it', () => {
    const slide = [...pixels(20, 25, 40, 90), ...pixels(255, 255, 255, 10)];
    expect(isDarkLightness(lightness(slide))).toBe(true);
    // a white page with a dark picture on a third of it stays light
    const page = [...pixels(255, 255, 255, 66), ...pixels(10, 10, 10, 34)];
    expect(isDarkLightness(lightness(page))).toBe(false);
  });

  it('takes an empty picture as light', () => {
    expect(lightness([])).toBe(1);
  });
});
