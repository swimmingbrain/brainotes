<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '../Icon.svelte';
  import { clampReaderZoom, READER_PAD } from '$lib/pdf/reader';
  import { getAsset } from '$lib/storage/db';

  let { file, name }: { file: string; name: string } = $props();

  const ZOOM_STEP = 1.25;

  let url = $state('');
  let failed = $state(false);
  let scroller = $state<HTMLDivElement | null>(null);
  let viewW = $state(0);
  let zoom = $state(1);

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
      <img src={url} alt={name} style="width: {width}px" draggable="false" />
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

  img {
    display: block;
    max-width: none;
    margin: 0 auto;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
    user-select: none;
  }

  .note {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
