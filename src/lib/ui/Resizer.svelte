<script lang="ts">
  let {
    direction = 'vertical',
    onresize,
    onresizeend
  }: {
    direction?: 'vertical' | 'horizontal';
    onresize: (delta: number) => void;
    onresizeend?: () => void;
  } = $props();

  let dragging = $state(false);
  let start = 0;

  const cursor = $derived(direction === 'vertical' ? 'col-resize' : 'row-resize');

  // pointer events and not mouse events, so a pen or a finger can drag it too
  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    dragging = true;
    start = direction === 'vertical' ? e.clientX : e.clientY;
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';
  }

  function onpointermove(e: PointerEvent) {
    if (!dragging) return;
    const pos = direction === 'vertical' ? e.clientX : e.clientY;
    const delta = pos - start;
    start = pos;
    if (delta !== 0) onresize(delta);
  }

  function onpointerup(e: PointerEvent) {
    if (!dragging) return;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onresizeend?.();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="resizer {direction}"
  class:active={dragging}
  role="separator"
  aria-orientation={direction}
  tabindex="-1"
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}></div>

<style>
  .resizer {
    background: var(--border);
    flex-shrink: 0;
    position: relative;
    touch-action: none;
  }

  .resizer.vertical {
    width: 3px;
    cursor: col-resize;
  }

  .resizer.horizontal {
    height: 3px;
    cursor: row-resize;
  }

  .resizer:hover,
  .resizer.active {
    background: var(--accent);
  }

  .resizer::after {
    content: '';
    position: absolute;
    z-index: 5;
  }

  /* a 3px strip is hard to hit, the hit area reaches a few pixels further */
  .resizer.vertical::after {
    top: 0;
    bottom: 0;
    left: -4px;
    right: -4px;
  }

  .resizer.horizontal::after {
    left: 0;
    right: 0;
    top: -4px;
    bottom: -4px;
  }
</style>
