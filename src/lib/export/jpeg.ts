// a jpeg goes into a pdf as it is, but a pdf ignores the exif turn a phone
// photo may carry. such a photo is drawn again the right way up instead

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function jpegOrientation(bytes: Uint8Array): number {
  if (!isJpeg(bytes)) return 1;
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    const size = (bytes[at + 2] << 8) | bytes[at + 3];
    if (marker === 0xda || size < 2) break;
    const exif = bytes[at + 4] === 0x45 && bytes[at + 5] === 0x78 && bytes[at + 6] === 0x69 && bytes[at + 7] === 0x66;
    if (marker === 0xe1 && exif) return exifOrientation(bytes, at + 10, Math.min(bytes.length, at + 2 + size));
    at += 2 + size;
  }
  return 1;
}

function exifOrientation(bytes: Uint8Array, tiff: number, end: number): number {
  const little = bytes[tiff] === 0x49;
  const u16 = (p: number) => (little ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1]);
  const u32 = (p: number) =>
    little
      ? (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0
      : ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
  if (tiff + 8 > end) return 1;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    if (u16(entry) === 0x0112) return u16(entry + 8) || 1;
  }
  return 1;
}
