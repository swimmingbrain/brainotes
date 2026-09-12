<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '../Icon.svelte';
  import { snipImage } from '$lib/editor/references';
  import { clampReaderZoom, READER_PAD } from '$lib/pdf/reader';
  import { getAsset } from '$lib/storage/db';
  import { activeTool } from '$lib/stores/app';

  let { file, name }: { file: string; name: string } = $props();

  const ZOOM_STEP = 1.25;
  const MIN_SNIP = 6;

  let url = $state('');
  let failed = $state(false);
  let scroller = $state<HTMLDivElement | null>(null);
  let viewW = $state(0);
  let zoom = $state(1);

  let image = $state<HTMLImageElement | null>(null);
  let drag = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const snipping = $derived($activeTool === 'snip');
  // the picture fits the width at zoom 1
  const width = $derived(Math.max(40, Math.round((viewW - READER_PAD * 2) * zoom)));

  $effect(() => {
    let alive = true;
    let made = '';
    getAsset(file)
      .then((asset) => {
        if (!alive) return;
        if (!asset) failed = true;
        else url = made = URL.createObjectURL(asset.blob);
      })
      .catch(() => (failed = true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  });

  async function zoomTo(next: number, cx?: number, cy?: number) {
    next = clampReaderZoom(next);
    const el = scroller;
    if (!el || next === zoom) return;
    const x = cx ?? el.clientWidth / 2;
    const y = cy ?? el.clientHeight / 2;
    const k = next / zoom;
    const left = (el.scrollLeft + x - READER_PAD) * k + READER_PAD - x;
    const top = (el.scrollTop + y - READER_PAD) * k + READER_PAD - y;
    zoom = next;
    await tick();
    el.scrollLeft = left;
    el.scrollTop = top;
  }

  function onwheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = scroller!.getBoundingClientRect();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    void zoomTo(zoom * Math.exp(-dy * (Math.abs(dy) < 50 ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
  }

  function local(e: PointerEvent): { x: number; y: number } {
    const r = image!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  }

  function onpointerdown(e: PointerEvent) {
    if (!snipping || e.button !== 0 || !image) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = local(e);
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  }

  function onpointermove(e: PointerEvent) {
    if (!drag) return;
    const p = local(e);
    drag = { ...drag, x1: p.x, y1: p.y };
  }

  function onpointerup() {
    const d = drag;
    drag = null;
    if (!d || !image) return;
    const box = boxOf(d);
    if (box.w < MIN_SNIP || box.h < MIN_SNIP) return;
    const k = image.naturalWidth / image.getBoundingClientRect().width;
    void snipImage(file, { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k });
  }

  function boxOf(d: { x0: number; y0: number; x1: number; y1: number }) {
    return { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) };
  }

  function wheel(node: HTMLElement) {
    node.addEventListener('wheel', onwheel, { passive: false });
    return { destroy: () => node.removeEventListener('wheel', onwheel) };
  }
</script>

<div class="reader">
  <div class="bar">
    <span class="name" title={name}>{name}</span>
    <button class="bar-btn" onclick={() => zoomTo(zoom / ZOOM_STEP)} title="Zoom out (Ctrl+wheel)" aria-label="Zoom out">
      <Icon name="zoomOut" size={13} />
    </button>
    <button class="bar-btn zoom" onclick={() => zoomTo(1)} title="Fit the width">{Math.round(zoom * 100)}%</button>
    <button class="bar-btn" onclick={() => zoomTo(zoom * ZOOM_STEP)} title="Zoom in (Ctrl+wheel)" aria-label="Zoom in">
      <Icon name="zoomIn" size={13} />
    </button>
  </div>
  <div class="scroller" bind:this={scroller} bind:clientWidth={viewW} use:wheel>
    {#if failed}
      <p class="note">This picture is not stored any more.</p>
    {:else if url}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="picture"
        class:snipping
        style="width: {width}px"
        {onpointerdown}
        {onpointermove}
        {onpointerup}
        onpointercancel={() => (drag = null)}>
        <img bind:this={image} src={url} alt={name} draggable="false" />
        {#if drag}
          {@const b = boxOf(drag)}
          <div class="snip-box" style="left: {b.x}px; top: {b.y}px; width: {b.w}px; height: {b.h}px"></div>
        {/if}
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

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
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
    padding: 12px;
    background: var(--bg-deep);
  }

  .picture {
    position: relative;
    margin: 0 auto;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  }

  .picture.snipping {
    cursor: crosshair;
    touch-action: none;
  }

  img {
    display: block;
    width: 100%;
    user-select: none;
  }

  .snip-box {
    position: absolute;
    border: 1px solid var(--accent);
    background: rgba(209, 154, 102, 0.15);
    pointer-events: none;
  }

  .note {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
