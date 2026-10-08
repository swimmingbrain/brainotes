import { penStats } from './stats';

// the system ink trail (navigator.ink, chromium browsers): windows draws the newest
// bit of the line ahead of the page, which is how native note apps feel so quick

interface InkTrailStyle {
  color: string;
  diameter: number;
}

interface InkPresenter {
  updateInkTrailStartPoint(event: PointerEvent, style: InkTrailStyle): void;
}

interface Ink {
  requestPresenter(param?: { presentationArea?: Element | null }): Promise<InkPresenter>;
}

let presenter: InkPresenter | null = null;
let asked: Element | null = null;

// once per canvas, the answer comes some time later
export function askTrail(canvas: Element) {
  if (asked === canvas) return;
  asked = canvas;
  presenter = null;
  penStats.trailReady = false;
  const ink = (navigator as Navigator & { ink?: Ink }).ink;
  if (typeof ink?.requestPresenter !== 'function') return;
  try {
    ink.requestPresenter({ presentationArea: canvas }).then(
      (p) => {
        if (asked !== canvas) return;
        presenter = p;
        penStats.trailReady = true;
      },
      () => {}
    );
  } catch {
    // an old or half done ink api
  }
}

export function dropTrail(canvas: Element) {
  if (asked !== canvas) return;
  asked = null;
  presenter = null;
  penStats.trailReady = false;
}

// e is the trusted pen event the line on the page was drawn up to
export function trailFrom(e: PointerEvent, color: string, diameter: number): boolean {
  if (!presenter || !e.isTrusted || !(diameter > 0)) return false;
  try {
    presenter.updateInkTrailStartPoint(e, { color, diameter });
    return true;
  } catch {
    return false;
  }
}
