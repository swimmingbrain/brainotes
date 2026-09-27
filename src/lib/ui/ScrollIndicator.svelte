<script lang="ts">
  import { scrollCanvas } from '$lib/editor/canvas';

  let track: HTMLDivElement;
  let thumb: HTMLDivElement;
  // plain values, this moves every scroll frame and must not wake any reactivity
  let start = 0;
  let size = 1;
  let drag: { y: number; from: number; height: number } | null = null;

  export function show(nextStart: number, nextSize: number) {
    start = nextStart;
    size = nextSize;
    if (!track) return;
    track.style.display = size >= 1 ? 'none' : '';
    thumb.style.setProperty('--size', String(size));
    thumb.style.setProperty('--pos', String(size >= 1 ? 0 : Math.max(0, Math.min(1, start / (1 - size)))));
  }

  function onpointerdown(e: PointerEvent) {
    e.preventDefault();
    const rect = track.getBoundingClientRect();
    // a click beside the thumb brings its middle there
    if (e.target !== thumb) {
      start = (e.clientY - rect.top) / rect.height - size / 2;
      scrollCanvas(start);
    }
    drag = { y: e.clientY, from: start, height: rect.height };
    thumb.classList.add('dragging');
    track.setPointerCapture(e.pointerId);
  }

  function onpointermove(e: PointerEvent) {
    if (drag) scrollCanvas(drag.from + (e.clientY - drag.y) / drag.height);
  }

  function onpointerup() {
    drag = null;
    thumb.classList.remove('dragging');
  }
</script>

<div
  class="scroll"
  style="display: none"
  role="presentation"
  bind:this={track}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}>
  <div class="thumb" bind:this={thumb}></div>
</div>

<style>
  .scroll {
    position: absolute;
    top: 4px;
    right: 1px;
    bottom: 4px;
    width: 10px;
    z-index: 2;
    touch-action: none;
  }

  .thumb {
    --h: max(24px, calc(var(--size, 1) * 100%));
    position: absolute;
    right: 2px;
    width: 6px;
    height: var(--h);
    top: calc((100% - var(--h)) * var(--pos, 0));
    background: var(--border);
  }

  .scroll:hover .thumb,
  .thumb:global(.dragging) {
    background: var(--text-muted);
  }
</style>
