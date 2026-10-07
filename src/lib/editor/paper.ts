import type { PageSize, PaperColor, PaperStyle } from '$lib/stores/preferences';

export const PAPER_COLORS: Record<PaperColor, { paper: string; rule: string; label: string }> = {
  white: { paper: '#ffffff', rule: 'rgba(60, 90, 140, 0.22)', label: 'White' },
  cream: { paper: '#f7f1e3', rule: 'rgba(120, 90, 50, 0.22)', label: 'Cream' },
  // the blackboard: chalk colored rules on a dark green
  dark: { paper: '#1e2622', rule: 'rgba(255, 255, 255, 0.14)', label: 'Dark' }
};

// height over width of one page
export const PAGE_SIZES: Record<PageSize, { ratio: number; label: string }> = {
  a4: { ratio: 297 / 210, label: 'A4' },
  letter: { ratio: 11 / 8.5, label: 'Letter' },
  wide: { ratio: 9 / 16, label: '16:9' }
};

// dots sit closer than lines and squares, each style starts with its own step
export const STYLE_SPACING: Record<PaperStyle, number> = { blank: 24, lines: 24, grid: 24, dots: 12 };

// the step for a new style: one that is still the default of the old style moves
// to the default of the new one, a step picked by hand stays
export function spacingFor(paper: { style: PaperStyle; spacing: number }, style: PaperStyle): number {
  return paper.spacing === STYLE_SPACING[paper.style] ? STYLE_SPACING[style] : paper.spacing;
}

// for the page tiles until there are real thumbnails, spacing in pixels
export function paperPattern(style: PaperStyle, color: PaperColor, spacing: number): string {
  const { paper, rule } = PAPER_COLORS[color];
  const s = `${spacing}px ${spacing}px`;
  if (style === 'lines') {
    return `linear-gradient(to bottom, transparent ${spacing - 1}px, ${rule} ${spacing - 1}px) 0 0 / 100% ${spacing}px, ${paper}`;
  }
  if (style === 'grid') {
    return `linear-gradient(to bottom, ${rule} 1px, transparent 1px) 0 0 / ${s}, linear-gradient(to right, ${rule} 1px, transparent 1px) 0 0 / ${s}, ${paper}`;
  }
  if (style === 'dots') {
    return `radial-gradient(circle, ${rule} 1px, transparent 1.3px) 0 0 / ${s}, ${paper}`;
  }
  return paper;
}
