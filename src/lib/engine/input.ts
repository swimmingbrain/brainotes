import { clampZoom, type Camera } from './camera';
import type { PointerKind, Sample, Tool } from './tools/tool';
import type { CanvasView } from './view';

let drawing = false;

// true while a pen, a mouse or a finger is putting something on the page.
// heavy work (pdf pages, far tiles, thumbnails, saving) waits for it
export function penIsDown(): boolean {
  return drawing;
}

export interface InputTools {
  // the tool of the rail for a press with the pen tip, the mouse or a finger
  pick: () => Tool | null;
  eraser: Tool;
  hand: Tool;
}

export interface InputHooks {
  // what pressed on the canvas last
  kind?: (kind: PointerKind) => void;
  fingerDraws: () => boolean;
}

interface Gesture {
  cam: Camera;
  // world point between the fingers, it stays under them
  wx: number;
  wy: number;
  dist: number;
}

function kindOf(e: PointerEvent): PointerKind {
  return e.pointerType === 'pen' || e.pointerType === 'touch' ? e.pointerType : 'mouse';
}

export class Input {
  private active: { id: number; tool: Tool; kind: PointerKind } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;
  private raw: boolean;
  // some pointers never send raw updates, then pointermove has the samples
  private rawSeen = false;

  constructor(
    private view: CanvasView,
    private tools: InputTools,
    private hooks: InputHooks
  ) {
    const el = view.live;
    // pointerrawupdate comes as soon as the pen moves, not once per frame
    this.raw = 'onpointerrawupdate' in window;
    el.addEventListener('pointerdown', this.ondown);
    if (this.raw) el.addEventListener('pointerrawupdate', this.onraw as EventListener);
    el.addEventListener('pointermove', this.onmove);
    el.addEventListener('pointerup', this.onup);
    el.addEventListener('pointercancel', this.oncancel);
    el.addEventListener('pointerleave', this.onleave);
    el.addEventListener('wheel', this.onwheel, { passive: false });
  }

  destroy() {
    const el = this.view.live;
    el.removeEventListener('pointerdown', this.ondown);
    if (this.raw) el.removeEventListener('pointerrawupdate', this.onraw as EventListener);
    el.removeEventListener('pointermove', this.onmove);
    el.removeEventListener('pointerup', this.onup);
    el.removeEventListener('pointercancel', this.oncancel);
    el.removeEventListener('pointerleave', this.onleave);
    el.removeEventListener('wheel', this.onwheel);
    this.active?.tool.cancel();
    this.active = null;
    drawing = false;
  }

  // the rail switched tools, a hover preview of the old one has to go
  toolChanged() {
    if (this.active) return;
    if (this.view.tool) {
      this.view.tool.hover?.(null);
      this.view.tool = null;
      this.view.requestLive();
    }
  }

  private sample(e: PointerEvent): Sample {
    return { x: e.clientX - this.view.left, y: e.clientY - this.view.top, pressure: e.pressure, time: e.timeStamp };
  }

  private capture(id: number) {
    try {
      this.view.live.setPointerCapture(id);
    } catch {
      // the pointer is already gone
    }
  }

  private ondown = (e: PointerEvent) => {
    const kind = kindOf(e);
    this.hooks.kind?.(kind);
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) focused.blur();

    if (kind === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX - this.view.left, y: e.clientY - this.view.top });
      // a palm resting while the pen writes
      if (this.active && this.active.kind !== 'touch') return;
      if (!this.hooks.fingerDraws() || this.touches.size > 1) {
        // a second finger turns a finger stroke into a pinch
        if (this.active) {
          this.active.tool.cancel();
          this.active = null;
          drawing = false;
        }
        this.capture(e.pointerId);
        this.startGesture();
        return;
      }
    }
    if (this.active || this.gesture) return;

    let tool: Tool | null;
    if (e.button === 1) tool = this.tools.hand;
    else if (kind === 'mouse' && e.button !== 0) return;
    else if (kind === 'pen' && (e.button === 5 || e.button === 2 || e.buttons & 32 || e.buttons & 2)) {
      // the eraser end of the pen or the barrel button
      tool = this.tools.eraser;
    } else tool = this.tools.pick();
    if (!tool) return;

    e.preventDefault();
    this.capture(e.pointerId);
    if (this.view.tool && this.view.tool !== tool) this.view.tool.hover?.(null);
    this.active = { id: e.pointerId, tool, kind };
    this.rawSeen = false;
    drawing = tool !== this.tools.hand;
    this.view.tool = tool;
    tool.down(this.sample(e), kind);
  };

  private feed(e: PointerEvent, tool: Tool) {
    const list = e.getCoalescedEvents?.();
    if (list && list.length > 0) {
      for (const c of list) tool.move(this.sample(c));
    } else {
      tool.move(this.sample(e));
    }
  }

  private onraw = (e: PointerEvent) => {
    const active = this.active;
    if (active && e.pointerId === active.id) {
      this.rawSeen = true;
      this.feed(e, active.tool);
    }
  };

  private onmove = (e: PointerEvent) => {
    if (this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX - this.view.left, y: e.clientY - this.view.top });
      if (this.gesture) this.moveGesture();
    }
    const active = this.active;
    if (active) {
      if (e.pointerId !== active.id) return;
      if (!this.rawSeen) this.feed(e, active.tool);
      if (active.tool.predict) {
        const predicted = e.getPredictedEvents?.() ?? [];
        active.tool.predict(predicted.map((p) => this.sample(p)));
      }
      return;
    }
    if (this.gesture || e.pointerType === 'touch') return;
    // the eraser shows its circle before it touches anything
    const tool = this.tools.pick();
    if (tool?.hover) {
      if (this.view.tool !== tool) this.view.tool?.hover?.(null);
      this.view.tool = tool;
      tool.hover(this.sample(e));
    }
  };

  private finish(e: PointerEvent, cancel: boolean) {
    if (this.touches.delete(e.pointerId) && this.gesture) {
      if (this.touches.size > 0) this.startGesture();
      else this.gesture = null;
    }
    const active = this.active;
    if (!active || e.pointerId !== active.id) return;
    this.active = null;
    drawing = false;
    // a cancelled pen stroke still keeps its ink, only gestures are dropped
    if (cancel && active.tool === this.tools.hand) active.tool.cancel();
    else active.tool.up();
  }

  private onup = (e: PointerEvent) => this.finish(e, false);

  private oncancel = (e: PointerEvent) => this.finish(e, true);

  private onleave = (e: PointerEvent) => {
    if (this.active || e.pointerType === 'touch') return;
    this.view.tool?.hover?.(null);
  };

  private onwheel = (e: WheelEvent) => {
    e.preventDefault();
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    } else if (e.deltaMode === 2) {
      dx *= this.view.width;
      dy *= this.view.height;
    }
    if (e.ctrlKey || e.metaKey) {
      // a touchpad pinch sends small steps, a mouse wheel big ones
      const factor = Math.exp(-dy * (Math.abs(dy) < 50 ? 0.01 : 0.002));
      this.view.zoomAt(e.clientX - this.view.left, e.clientY - this.view.top, this.view.cam.zoom * factor);
      return;
    }
    if (e.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    this.view.panBy(-dx, -dy);
  };

  private centre(): { x: number; y: number; dist: number } {
    const pts = [...this.touches.values()].slice(0, 2);
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, dist: 0 };
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
      dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
    };
  }

  // every time a finger comes or goes the gesture starts over from here
  private startGesture() {
    const c = this.centre();
    const cam = this.view.cam;
    this.gesture = { cam: { ...cam }, wx: cam.x + c.x / cam.zoom, wy: cam.y + c.y / cam.zoom, dist: c.dist };
  }

  private moveGesture() {
    const g = this.gesture;
    if (!g) return;
    const c = this.centre();
    let zoom = g.cam.zoom;
    if (g.dist > 0 && c.dist > 0) {
      zoom = clampZoom((g.cam.zoom * c.dist) / g.dist);
      this.view.fitted = false;
    }
    this.view.setCamera({ x: g.wx - c.x / zoom, y: g.wy - c.y / zoom, zoom });
  }
}
