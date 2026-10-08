import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../input';
import type { Box } from '../types';
import type { CanvasView } from '../view';
import { LASER_FADE, LASER_HOLD, LaserTool } from './laser';
import type { Tool } from './tool';

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

  it('fades a second after the lift and is gone half a second later', () => {
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
    wait(600);
    line(80);
    wait(600);
    line(110);
    // two and a half seconds after the first lift nothing has faded yet
    wait(LASER_HOLD - 100);
    expect(shown()).toEqual([{ lines: 3, alpha: 1 }]);
    wait(100 + LASER_FADE / 2);
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

// node has no Path2D, the laser only traces into it
class FakePath {
  moveTo() {}
  quadraticCurveTo() {}
  closePath() {}
}

// the laser behind the real pointer input. frames come the way a browser gives them:
// one asked for while nothing ran comes in the same millisecond, the next ones every 16 ms
function onPage() {
  const live = Object.assign(new EventTarget(), { setPointerCapture: () => {} });
  // when the frame asked for comes, -1 for none
  let due = -1;
  let last = -100;
  let frames = 0;
  // what the last frame left on the live canvas
  let drawn: Box | null = null;
  const view = {
    cam: { x: 0, y: 0, zoom: 1 },
    dpr: 1,
    scene: 0,
    left: 0,
    top: 0,
    live,
    tool: null as Tool | null,
    settle: () => {},
    liveNow: () => {},
    requestLive: () => {
      if (due < 0) due = Math.max(performance.now(), last + 16);
    }
  };
  const ctx = { setTransform() {}, fill() {} };
  const frame = () => {
    due = -1;
    last = performance.now();
    frames++;
    drawn = view.tool?.drawLive?.(ctx as unknown as CanvasRenderingContext2D) ?? null;
  };
  const laser = new LaserTool(view as unknown as CanvasView, () => 0.5);
  const other: Tool = { down() {}, move() {}, up() {}, cancel() {} };
  new Input(view as unknown as CanvasView, { pick: () => laser, eraser: other, hand: other }, { fingerDraws: () => false });

  let t = 0;
  // one millisecond at a time, a frame that is due runs right after the timers
  const wait = (ms: number) => {
    for (let i = 0; i < ms; i++) {
      vi.advanceTimersByTime(1);
      t++;
      if (due >= 0 && performance.now() >= due) frame();
    }
  };
  const send = (type: string, x: number, y: number, buttons: number) => {
    const e = Object.assign(new Event(type), {
      pointerId: 1,
      pointerType: 'pen',
      clientX: x,
      clientY: y,
      pressure: buttons ? 0.5 : 0,
      button: type === 'pointermove' ? -1 : 0,
      buttons,
      shiftKey: false
    });
    Object.defineProperty(e, 'timeStamp', { value: t });
    live.dispatchEvent(e);
  };
  // a pen line going right, it ends with the given events
  const stroke = (y: number, end = ['pointerup']) => {
    send('pointerdown', 10, y, 1);
    for (let i = 1; i < 20; i++) {
      wait(10);
      send('pointermove', 10 + i * 3, y, 1);
    }
    wait(10);
    for (const type of end) send(type, 70, y, 0);
  };
  // the pen hovers over the page without touching it
  const hover = (ms: number, y: number) => {
    for (let i = 0; i < ms / 10; i++) {
      wait(10);
      send('pointermove', 40 + (i % 30), y - 10, 0);
    }
  };
  const groups = () => laser.shown(performance.now()).length;
  return { stroke, hover, send, wait, groups, frames: () => frames, onScreen: () => drawn !== null };
}

describe('laser on the page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { activeElement: null, getSelection: () => null });
    vi.stubGlobal('HTMLElement', class {});
    vi.stubGlobal('Path2D', FakePath);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('goes away on its own after a lift, the pen hovers off and nothing else happens', () => {
    const { stroke, send, wait, onScreen, frames } = onPage();
    stroke(100);
    for (let i = 1; i <= 5; i++) {
      wait(10);
      send('pointermove', 70 + i * 10, 100 - i * 20, 0);
    }
    send('pointerleave', 120, 0, 0);
    wait(LASER_HOLD - 100);
    expect(onScreen()).toBe(true);
    wait(50 + LASER_FADE + 50);
    expect(onScreen()).toBe(false);
    // once it is gone no more frames are asked for
    const count = frames();
    wait(3000);
    expect(frames()).toBe(count);
  });

  it('starts the countdown on a pointercancel too', () => {
    const { stroke, wait, onScreen } = onPage();
    stroke(100, ['pointercancel']);
    wait(LASER_HOLD - 50);
    expect(onScreen()).toBe(true);
    wait(50 + LASER_FADE + 50);
    expect(onScreen()).toBe(false);
  });

  it('starts the countdown when the capture is lost without an up, a late up changes nothing', () => {
    const { stroke, send, wait, onScreen } = onPage();
    stroke(100, ['lostpointercapture']);
    wait(300);
    send('pointerup', 70, 100, 0);
    wait(LASER_HOLD - 350);
    expect(onScreen()).toBe(true);
    wait(50 + LASER_FADE + 50);
    expect(onScreen()).toBe(false);
  });

  it('keeps counting down while the pen hovers over the lines', () => {
    const { stroke, hover, onScreen } = onPage();
    stroke(100);
    hover(LASER_HOLD - 50, 100);
    expect(onScreen()).toBe(true);
    hover(50 + LASER_FADE + 50, 100);
    expect(onScreen()).toBe(false);
  });

  it('lets the old lines fade on after a press during the fade, the new ones get their own countdown', () => {
    const { stroke, wait, groups, onScreen } = onPage();
    stroke(100);
    wait(LASER_HOLD + LASER_FADE / 2);
    stroke(200);
    // the old group still fades while the new line is there
    expect(groups()).toBe(2);
    wait(100);
    expect(groups()).toBe(1);
    wait(LASER_HOLD - 150);
    expect(onScreen()).toBe(true);
    wait(50 + LASER_FADE + 50);
    expect(onScreen()).toBe(false);
    expect(groups()).toBe(0);
  });
});
