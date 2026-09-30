import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasView } from '../view';
import { LASER_FADE, LASER_HOLD, LaserTool } from './laser';

// the laser only needs the camera, the scene and a way to ask for frames,
// there is no notebook here, so nothing can be stored
function setup() {
  const view = { cam: { x: 0, y: 0, zoom: 1 }, dpr: 1, scene: 0, requestLive: () => {} };
  const laser = new LaserTool(view as unknown as CanvasView, () => 0.5);
  let t = 0;
  // a line of count samples going right, one every 10 ms
  const line = (y: number, count = 20, lift = true) => {
    for (let i = 0; i < count; i++) {
      const s = { x: 10 + i * 3, y, pressure: 0.5, time: t };
      if (i === 0) laser.down(s);
      else laser.move(s);
      vi.advanceTimersByTime(10);
      t += 10;
    }
    if (lift) laser.up({ x: 10 + count * 3, y, pressure: 0, time: t });
  };
  const wait = (ms: number) => {
    vi.advanceTimersByTime(ms);
    t += ms;
  };
  const shown = () => laser.shown(performance.now()).map((g) => ({ lines: g.group.lines.length, alpha: g.alpha }));
  return { view, laser, line, wait, shown };
}

describe('laser', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a line whole while it is held, also for 5 seconds', () => {
    const { line, wait, shown, laser } = setup();
    line(50, 20, false);
    wait(5000);
    expect(shown()).toEqual([{ lines: 0, alpha: 1 }]);
    laser.up();
    expect(shown()).toEqual([{ lines: 1, alpha: 1 }]);
  });

  it('fades two seconds after the lift and is gone half a second later', () => {
    const { line, wait, shown } = setup();
    line(50);
    wait(LASER_HOLD - 10);
    expect(shown()[0].alpha).toBe(1);
    wait(10 + LASER_FADE / 2);
    const alpha = shown()[0].alpha;
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
    wait(LASER_FADE / 2);
    expect(shown()).toEqual([]);
  });

  it('adds up lines drawn with short pauses, they fade together', () => {
    const { line, wait, shown } = setup();
    line(50);
    wait(1000);
    line(80);
    wait(1000);
    line(110);
    // three seconds after the first lift nothing has faded yet
    wait(1500);
    expect(shown()).toEqual([{ lines: 3, alpha: 1 }]);
    wait(500 + LASER_FADE / 2);
    expect(shown()).toHaveLength(1);
    expect(shown()[0].lines).toBe(3);
    expect(shown()[0].alpha).toBeLessThan(1);
    wait(LASER_FADE);
    expect(shown()).toEqual([]);
  });

  it('starts a new group on a press during the fade, the old one fades on', () => {
    const { line, wait, shown } = setup();
    line(50);
    wait(LASER_HOLD + 100);
    line(80, 5, false);
    const now = shown();
    expect(now).toHaveLength(2);
    expect(now[0].alpha).toBeLessThan(1);
    expect(now[1].alpha).toBe(1);
    wait(LASER_FADE);
    expect(shown()).toEqual([{ lines: 0, alpha: 1 }]);
  });

  it('clears everything at once when another page comes on screen', () => {
    const { line, view, shown } = setup();
    line(50);
    expect(shown()).toHaveLength(1);
    view.scene++;
    expect(shown()).toEqual([]);
  });
});
