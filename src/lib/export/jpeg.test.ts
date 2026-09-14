import { describe, expect, it } from 'vitest';
import { isJpeg, jpegOrientation } from './jpeg';

// the start of a jpeg with an exif block that holds only the orientation
function jpeg(orientation: number, little: boolean): Uint8Array {
  const u16 = (v: number) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) => (little ? [v & 255, (v >> 8) & 255, 0, 0] : [0, 0, (v >> 8) & 255, v & 255]);
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8)];
  const ifd = [...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff, ...ifd];
  const size = body.length + 2;
  const jfif = [0xff, 0xe0, 0, 4, 0, 0];
  return new Uint8Array([0xff, 0xd8, ...jfif, 0xff, 0xe1, size >> 8, size & 255, ...body, 0xff, 0xda, 0, 2]);
}

describe('jpeg orientation', () => {
  it('reads the exif turn in both byte orders', () => {
    expect(jpegOrientation(jpeg(6, true))).toBe(6);
    expect(jpegOrientation(jpeg(3, false))).toBe(3);
    expect(jpegOrientation(jpeg(1, true))).toBe(1);
  });

  it('says upright for a jpeg without exif and for other files', () => {
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(isJpeg(png)).toBe(false);
    expect(jpegOrientation(png)).toBe(1);
  });
});
