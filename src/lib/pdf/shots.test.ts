import { describe, expect, it } from 'vitest';
import { pageKey, pickShots, shotId, ShotCache, type Picture, type Shot } from './shots';

function picture(width: number, height: number) {
  return { width, height, closed: false, close() { this.closed = true; } };
}

type Fake = ReturnType<typeof picture>;

function shot(page: number, scale: number, size: number, full = true): Shot<Fake> {
  const key = pageKey('f', page);
  const part = full ? undefined : { x: 0, y: 0, w: 10, h: 10 };
  return { id: shotId(key, scale, part), key, scale, full, x: 0, y: 0, w: 10, h: 10, picture: picture(size, size) };
}

describe('the shot cache', () => {
  it('closes the shots used longest ago once it holds too many pixels', () => {
    const cache = new ShotCache<Fake>(300, 1, 4);
    const a = shot(1, 1, 10);
    const b = shot(2, 1, 10);
    const c = shot(3, 1, 10);
    cache.add(a);
    cache.add(b);
    cache.add(c);
    expect(cache.pixels).toBe(300);
    // a was looked at, so b is the oldest now
    cache.touch(a);
    cache.add(shot(4, 1, 10));
    expect(b.picture.closed).toBe(true);
    expect(a.picture.closed).toBe(false);
    expect(cache.has(b.id)).toBe(false);
    expect(cache.of(pageKey('f', 2))).toEqual([]);
    expect(cache.pixels).toBe(300);
  });

  it('keeps a few shots whatever their size', () => {
    const cache = new ShotCache<Fake>(100, 2, 4);
    const a = shot(1, 1, 50);
    const b = shot(2, 1, 50);
    cache.add(a);
    cache.add(b);
    expect(cache.size).toBe(2);
    expect(a.picture.closed).toBe(false);
    cache.add(shot(3, 1, 50));
    expect(a.picture.closed).toBe(true);
    expect(cache.size).toBe(2);
  });

  it('keeps the quick shot of a page and drops its oldest sharp one', () => {
    const cache = new ShotCache<Fake>(1e9, 1, 3);
    const quick = shot(1, 0.5, 4);
    const one = shot(1, 2, 8);
    const two = shot(1, 3, 8);
    cache.add(quick);
    cache.add(one);
    cache.add(two);
    cache.add(shot(1, 4, 8));
    expect(quick.picture.closed).toBe(false);
    expect(one.picture.closed).toBe(true);
    expect(two.picture.closed).toBe(false);
    expect(cache.of(pageKey('f', 1)).length).toBe(3);
  });

  it('replaces a shot made again and clears a whole file', () => {
    const cache = new ShotCache<Fake>(1e9, 1, 3);
    const first = shot(1, 1, 10);
    cache.add(first);
    cache.add(shot(1, 1, 10));
    expect(first.picture.closed).toBe(true);
    expect(cache.size).toBe(1);
    cache.add(shot(2, 1, 10));
    cache.clear('f');
    expect(cache.size).toBe(0);
    expect(cache.pixels).toBe(0);
  });

  it('picks the smallest sharp whole page and the parts for this scale', () => {
    const shots = [shot(1, 0.5, 1), shot(1, 2, 1), shot(1, 3, 1), shot(1, 4, 1, false)];
    expect(pickShots(shots, 2).base?.scale).toBe(2);
    expect(pickShots(shots, 2.5).base?.scale).toBe(3);
    // nothing sharp enough: the biggest is the least blurry
    expect(pickShots(shots, 6).base?.scale).toBe(3);
    expect(pickShots(shots, 4).parts.length).toBe(1);
    expect(pickShots(shots, 3).parts.length).toBe(0);
    expect(pickShots<Picture>([], 1)).toEqual({ base: null, parts: [] });
  });
});
