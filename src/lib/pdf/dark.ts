// pdf pages whose quick picture is dark on average, like slides with a
// dark background. the highlighter is laid on them normally, multiply
// would make it almost invisible there
const DARK = 0.4;
// the picture is shrunk to this many pixels a side before it is averaged
const SAMPLE = 24;

const known = new Map<string, boolean>();

// the average brightness of rgba pixels, 0 is black and 1 is white
export function lightness(data: ArrayLike<number>): number {
  const n = Math.floor(data.length / 4);
  if (n === 0) return 1;
  let sum = 0;
  for (let i = 0; i < n * 4; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / n / 255;
}

export function isDarkLightness(value: number): boolean {
  return value < DARK;
}

// a page is looked at once, its first picture says enough
export function measureDark(key: string, picture: CanvasImageSource) {
  if (known.has(key) || typeof OffscreenCanvas === 'undefined') return;
  const canvas = new OffscreenCanvas(SAMPLE, SAMPLE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(picture, 0, 0, SAMPLE, SAMPLE);
  known.set(key, isDarkLightness(lightness(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data)));
}

export function knownDark(key: string): boolean | undefined {
  return known.get(key);
}
