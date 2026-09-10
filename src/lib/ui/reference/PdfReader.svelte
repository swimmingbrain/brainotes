<script lang="ts">
  import { tick, untrack } from 'svelte';
  import Icon from '../Icon.svelte';
  import { snip, writeOnReferencePage } from '$lib/editor/references';
  import {
    capScale,
    onShot,
    openPdf,
    pdfText,
    previewScale,
    shotsOf,
    touchShot,
    want,
    type PdfFile,
    type Wanted
  } from '$lib/pdf/pdf';
  import { clampReaderZoom, pageAtY, pagesIn, readerLayout, scrollOf, spotOf } from '$lib/pdf/reader';
  import { pickShots, sharp, type Part } from '$lib/pdf/shots';
  import { activeTool, contextMenu, type MenuItem } from '$lib/stores/app';
  import { keepReadingSpot, readingSpot, referenceFocus } from '$lib/stores/reference';

  let { file }: { file: string } = $props();

  // ms the zoom rests before the pages are drawn sharp again
  const SETTLE = 150;
  // css pixels of pages kept around what is in sight
  const AHEAD = 120;
  // css pixels, a smaller drag is a click and snips nothing
  const MIN_SNIP = 6;
  const ZOOM_STEP = 1.25;

  let pdf = $state.raw<PdfFile | null>(null);
  let failed = $state(false);
  let scroller = $state<HTMLDivElement | null>(null);
  let viewW = $state(0);
  let viewH = $state(0);
  let scrollTop = $state(0);
  let zoom = $state(untrack(() => readingSpot(file)?.zoom ?? 1));
  // device pixels per point the canvases are drawn at, it follows the zoom once it rests
  let paintScale = $state(0);
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let spot = 0;
  let restored = false;
  let lastWidth = 0;
  let handledFocus = 0;
  const canvases = new Map<number, HTMLCanvasElement>();

  interface Drag {
    n: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }

  let drag = $state<Drag | null>(null);
  let flash = $state<{ n: number; part: Part; key: number } | null>(null);

  const snipping = $derived($activeTool === 'snip');
  const layout = $derived(pdf && viewW > 0 ? readerLayout(pdf.pages, viewW, zoom) : null);
  const range = $derived(layout ? pagesIn(layout.tops, scrollTop - AHEAD, scrollTop + viewH + AHEAD) : ([0, 0] as [number, number]));
  const shown = $derived(Array.from({ length: range[1] - range[0] }, (_, k) => range[0] + k + 1));
  const current = $derived(layout ? pageAtY(layout.tops, scrollTop + viewH / 3) + 1 : 1);
  const settled = $derived(layout !== null && paintScale === layout.scale * dpr());

  function dpr(): number {
    return window.devicePixelRatio || 1;
  }

  $effect(() => {
    let alive = true;
    openPdf(file)
      .then((p) => {
        if (alive) pdf = p;
      })
      .catch(() => {
        if (alive) failed = true;
      });
    const off = onShot((f, page) => {
      if (f === file && canvases.has(page)) draw(page);
    });
    return () => {
      alive = false;
      off();
      want('reference', []);
      if (settleTimer) clearTimeout(settleTimer);
    };
  });

  // a new zoom or panel width shows the old pictures stretched for a moment
  $effect(() => {
    const scale = layout?.scale;
    if (scale === undefined) return;
    if (settleTimer) clearTimeout(settleTimer);
    const target = scale * dpr();
    if (untrack(() => paintScale) === 0) {
      paintScale = target;
      return;
    }
    settleTimer = setTimeout(() => (paintScale = target), SETTLE);
  });

  // the canvases get their new size once the zoom rests
  $effect(() => {
    if (paintScale === 0) return;
    for (const n of canvases.keys()) draw(n);
  });

  // the first time the pages are laid out: back to where this file was
  // left, or to the spot a clip asked for
  $effect(() => {
    if (!layout || !scroller || restored) return;
    restored = true;
    const focus = untrack(() => $referenceFocus);
    if (focus && focus.file === file && Date.now() - focus.at < 3000) return;
    const saved = readingSpot(file);
    if (saved) {
      scroller.scrollTop = scrollOf(layout.tops, saved.at);
      scrollTop = scroller.scrollTop;
    }
  });

  // a narrower or wider panel keeps the same spot in sight
  $effect(() => {
    const w = viewW;
    const l = layout;
    if (!l || !scroller) return;
    if (lastWidth !== 0 && w !== lastWidth) {
      const el = scroller;
      void tick().then(() => (el.scrollTop = scrollOf(l.tops, spot)));
    }
    lastWidth = w;
  });

  // a clip asked to be shown: its page comes in sight and the part flashes
  $effect(() => {
    const focus = $referenceFocus;
    if (!focus || focus.file !== file || !layout || !scroller || !pdf || focus.at === handledFocus) return;
    handledFocus = focus.at;
    const size = pdf.pages[focus.page - 1];
    if (!size) return;
    const part = focus.part ?? { x: 0, y: 0, w: size.w, h: size.h };
    const s = layout.scale;
    const top = layout.tops[focus.page - 1];
    const left = (layout.width - size.w * s) / 2;
    scroller.scrollTop = top + (part.y + part.h / 2) * s - viewH / 2;
    scroller.scrollLeft = left + (part.x + part.w / 2) * s - viewW / 2;
    scrollTop = scroller.scrollTop;
    const key = focus.at;
    flash = { n: focus.page, part, key };
    setTimeout(() => {
      if (flash?.key === key) flash = null;
    }, 1600);
  });

  // what the panel needs drawn: a quick picture of the pages in sight and
  // next to them, a sharp one of those in sight once the zoom rests
  $effect(() => {
    if (!pdf || !layout) return;
    const [from, to] = range;
    const scale = paintScale;
    const resting = settled;
    const list: Wanted[] = [];
    const middle = (from + to - 1) / 2;
    for (let i = Math.max(0, from - 1); i < Math.min(pdf.pages.length, to + 1); i++) {
      const size = pdf.pages[i];
      const near = i < from || i >= to;
      const d = Math.abs(i - middle);
      list.push({ file, page: i + 1, scale: previewScale(size.w), priority: (near ? 20 : 0) + d });
      if (near || !resting) continue;
      const s = capScale(size.w, size.h, scale);
      if (!shotsOf(file, i + 1).some((shot) => shot.full && sharp(shot, s))) {
        list.push({ file, page: i + 1, scale: s, priority: 10 + d });
      }
    }
    want('reference', list);
  });

  // the best picture there is of page n on its canvas
  function draw(n: number) {
    const canvas = canvases.get(n);
    const size = pdf?.pages[n - 1];
    if (!canvas || !size || paintScale === 0) return;
    const s = capScale(size.w, size.h, paintScale);
    const w = Math.max(1, Math.round(size.w * s));
    const h = Math.max(1, Math.round(size.h * s));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const { base } = pickShots(shotsOf(file, n), s);
    if (!base) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    touchShot(base);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (base.picture.width === w && base.picture.height === h) ctx.drawImage(base.picture, 0, 0);
    else ctx.drawImage(base.picture, 0, 0, w, h);
  }

  function paint(canvas: HTMLCanvasElement, n: number) {
    canvases.set(n, canvas);
    draw(n);
    return {
      destroy: () => {
        if (canvases.get(n) === canvas) canvases.delete(n);
      }
    };
  }

  function text(node: HTMLDivElement, args: { n: number; scale: number }) {
    const stop = pdfText(file, args.n, node, args.scale);
    return { destroy: stop };
  }

  function onscroll() {
    if (!scroller || !layout) return;
    scrollTop = scroller.scrollTop;
    spot = spotOf(layout.tops, scrollTop);
    keepReadingSpot(file, { at: spot, zoom });
  }

  // zooms with the point at cx, cy of the view staying where it is
  async function zoomTo(next: number, cx = viewW / 2, cy = viewH / 2) {
    next = clampReaderZoom(next);
    const before = layout;
    const el = scroller;
    if (!before || !el || !pdf || next === zoom) return;
    const y = el.scrollTop + cy;
    const x = el.scrollLeft + cx;
    const i = pageAtY(before.tops, y);
    const size = pdf.pages[i];
    const fy = (y - before.tops[i]) / (size.h * before.scale);
    const fx = (x - (before.width - size.w * before.scale) / 2) / (size.w * before.scale);
    zoom = next;
    await tick();
    const after = layout;
    if (!after) return;
    el.scrollTop = after.tops[i] + fy * size.h * after.scale - cy;
    el.scrollLeft = (after.width - size.w * after.scale) / 2 + fx * size.w * after.scale - cx;
    onscroll();
  }

  function onwheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = scroller!.getBoundingClientRect();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(-dy * (Math.abs(dy) < 50 ? 0.01 : 0.002));
    void zoomTo(zoom * factor, e.clientX - r.left, e.clientY - r.top);
  }

  // wheel listeners have to be able to stop the page zoom of the browser
  function wheel(node: HTMLElement) {
    node.addEventListener('wheel', onwheel, { passive: false });
    return { destroy: () => node.removeEventListener('wheel', onwheel) };
  }

  function jump(n: number) {
    if (!layout || !scroller || !pdf || !Number.isFinite(n)) return;
    const page = Math.max(1, Math.min(pdf.pages.length, Math.round(n)));
    scroller.scrollTop = layout.tops[page - 1] - 6;
    onscroll();
  }

  function onpagekey(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === 'Enter') {
      jump(Number(input.value));
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = String(current);
      input.blur();
    }
  }

  // snip: a box dragged over a page

  function local(e: PointerEvent, el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  }

  function onpointerdown(e: PointerEvent, n: number) {
    if (!snipping || e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const p = local(e, el);
    drag = { n, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  }

  function onpointermove(e: PointerEvent, n: number) {
    if (!drag || drag.n !== n) return;
    const p = local(e, e.currentTarget as HTMLElement);
    drag = { ...drag, x1: p.x, y1: p.y };
  }

  function onpointerup(e: PointerEvent, n: number) {
    const d = drag;
    drag = null;
    if (!d || d.n !== n || !layout || !pdf) return;
    const el = e.currentTarget as HTMLElement;
    const size = pdf.pages[n - 1];
    const k = size.w / el.getBoundingClientRect().width;
    const box = boxOf(d);
    if (box.w < MIN_SNIP || box.h < MIN_SNIP) return;
    const part = { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k };
    const key = Date.now();
    flash = { n, part, key };
    setTimeout(() => {
      if (flash?.key === key) flash = null;
    }, 900);
    void snip(file, n, part);
  }

  function boxOf(d: Drag) {
    return { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) };
  }

  function pageMenu(n: number): MenuItem[] {
    return [
      { label: 'Insert as image', action: () => void snip(file, n) },
      { label: 'Write on this page', action: () => void writeOnReferencePage(file, n) },
      { separator: true, label: '' },
      { label: 'Snip a part', shortcut: 'X', action: () => activeTool.set('snip') }
    ];
  }

  function openMenu(e: MouseEvent, n: number) {
    e.preventDefault();
    e.stopPropagation();
    contextMenu.set({ x: e.clientX, y: e.clientY, items: pageMenu(n) });
  }

  function menuButton(e: MouseEvent, n: number) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    e.stopPropagation();
    contextMenu.set({ x: r.left, y: r.bottom + 2, items: pageMenu(n) });
  }
</script>

<div class="reader">
  <div class="bar">
    {#if pdf}
      <input
        class="page-input"
        value={current}
        onkeydown={onpagekey}
        onblur={(e) => (e.currentTarget.value = String(current))}
        onfocus={(e) => e.currentTarget.select()}
        inputmode="numeric"
        aria-label="Page"
        title="Type a page and press Enter" />
      <span class="count">/ {pdf.pages.length}</span>
    {/if}
    <span class="grow"></span>
    {#if snipping}
      <span class="hint">drag over a page to snip</span>
    {/if}
    <button class="bar-btn" onclick={() => zoomTo(zoom / ZOOM_STEP)} title="Zoom out (Ctrl+wheel)" aria-label="Zoom out">
      <Icon name="zoomOut" size={13} />
    </button>
    <button class="bar-btn zoom" onclick={() => zoomTo(1)} title="Fit the width">{Math.round(zoom * 100)}%</button>
    <button class="bar-btn" onclick={() => zoomTo(zoom * ZOOM_STEP)} title="Zoom in (Ctrl+wheel)" aria-label="Zoom in">
      <Icon name="zoomIn" size={13} />
    </button>
  </div>

  <div
    class="scroller"
    class:snipping
    bind:this={scroller}
    bind:clientWidth={viewW}
    bind:clientHeight={viewH}
    {onscroll}
    use:wheel>
    {#if failed}
      <p class="note">This pdf could not be read.</p>
    {:else if layout && pdf}
      <div class="content" style="width: {layout.width}px; height: {layout.height}px">
        {#each shown as n (n)}
          {@const size = pdf.pages[n - 1]}
          {@const w = Math.round(size.w * layout.scale)}
          {@const h = Math.round(size.h * layout.scale)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="sheet"
            style="top: {layout.tops[n - 1]}px; left: {Math.round((layout.width - w) / 2)}px; width: {w}px; height: {h}px"
            data-page={n}
            oncontextmenu={(e) => openMenu(e, n)}
            onpointerdown={(e) => onpointerdown(e, n)}
            onpointermove={(e) => onpointermove(e, n)}
            onpointerup={(e) => onpointerup(e, n)}
            onpointercancel={() => (drag = null)}>
            <canvas use:paint={n}></canvas>
            {#if settled && !snipping}
              {#key layout.scale}
                <div class="text-layer" use:text={{ n, scale: layout.scale }}></div>
              {/key}
            {/if}
            {#if drag && drag.n === n}
              {@const b = boxOf(drag)}
              <div class="snip-box" style="left: {b.x}px; top: {b.y}px; width: {b.w}px; height: {b.h}px"></div>
            {/if}
            {#if flash && flash.n === n}
              {#key flash.key}
                <div
                  class="flash"
                  style="left: {flash.part.x * layout.scale}px; top: {flash.part.y * layout.scale}px; width: {flash.part.w *
                    layout.scale}px; height: {flash.part.h * layout.scale}px">
                </div>
              {/key}
            {/if}
            {#if !snipping}
              <button class="page-btn" onclick={(e) => menuButton(e, n)} title="Page {n}" aria-label="Page {n} menu">
                <Icon name="more" size={13} />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .reader {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .bar {
    height: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    font-family: var(--font-editor);
    font-size: 11px;
    color: var(--text-muted);
  }

  .page-input {
    width: 38px;
    height: 20px;
    padding: 0 4px;
    text-align: right;
    font: inherit;
    color: var(--text-primary);
    background: var(--bg-deep);
    border: 1px solid var(--border);
    outline: none;
  }

  .page-input:focus {
    border-color: var(--border-focus);
  }

  .count {
    padding-left: 4px;
  }

  .grow {
    flex: 1;
  }

  .hint {
    color: var(--accent);
    font-size: 10.5px;
    margin-right: 6px;
    white-space: nowrap;
  }

  .bar-btn {
    height: 22px;
    min-width: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    color: var(--text-secondary);
    font: inherit;
  }

  .bar-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .bar-btn.zoom {
    min-width: 42px;
  }

  .scroller {
    flex: 1;
    min-height: 0;
    overflow: auto;
    position: relative;
    background: var(--bg-deep);
  }

  .content {
    position: relative;
  }

  .sheet {
    position: absolute;
    background: #ffffff;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  }

  .snipping .sheet {
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .snip-box {
    position: absolute;
    border: 1px solid var(--accent);
    background: rgba(209, 154, 102, 0.15);
    pointer-events: none;
  }

  .flash {
    position: absolute;
    pointer-events: none;
    border: 2px solid var(--accent);
    background: rgba(209, 154, 102, 0.25);
    animation: flash 1.6s ease-out forwards;
  }

  @keyframes flash {
    0%,
    40% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .page-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    opacity: 0;
    z-index: 2;
  }

  .sheet:hover .page-btn,
  .page-btn:focus-visible {
    opacity: 1;
  }

  .page-btn:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .note {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }

  /* the pdf.js text layer: invisible text right over the drawn page */
  .text-layer {
    position: absolute;
    inset: 0;
    overflow: clip;
    opacity: 1;
    line-height: 1;
    text-align: initial;
    -webkit-text-size-adjust: none;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
    caret-color: CanvasText;
    z-index: 1;
    --scale-round-x: 1px;
    --scale-round-y: 1px;
    --min-font-size: 1;
    --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
    --min-font-size-inv: calc(1 / var(--min-font-size));
  }

  .text-layer :global(:is(span, br)) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
  }

  .text-layer > :global(:not(.markedContent)),
  .text-layer :global(.markedContent span:not(.markedContent)) {
    z-index: 1;
    --font-height: 0;
    font-size: calc(var(--text-scale-factor) * var(--font-height));
    --scale-x: 1;
    --rotate: 0deg;
    transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
  }

  .text-layer :global(.markedContent) {
    display: contents;
  }

  .text-layer :global(::selection) {
    background: rgba(31, 95, 209, 0.3);
    color: transparent;
  }

  .text-layer :global(br::selection) {
    background: transparent;
  }
</style>
