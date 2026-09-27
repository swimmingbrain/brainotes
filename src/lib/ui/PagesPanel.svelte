<script lang="ts">
  import Icon from './Icon.svelte';
  import { actions } from '$lib/editor/actions';
  import { openDoc } from '$lib/editor/canvas';
  import { PAPER_STYLES } from '$lib/editor/commands';
  import { PAPER_COLORS } from '$lib/editor/paper';
  import { Thumbs } from '$lib/editor/thumbs';
  import { contextMenu, notebookKind, pageIndex, pageList } from '$lib/stores/app';
  import type { PaperColor } from '$lib/stores/preferences';

  const thumbs = new Thumbs();
  $effect(() => () => thumbs.destroy());

  // only rows near the visible part exist, hundreds of pages would open slowly otherwise
  const PAD = 14;
  const GAP = 10;
  // the gap under a sheet and its number
  const LABEL = 18;
  // px of rows kept above and below what is in sight
  const AHEAD = 600;

  let list = $state<HTMLDivElement | null>(null);
  let listWidth = $state(220);
  let listHeight = $state(600);
  let scrollTop = $state(0);
  // the page being dragged and the gap it would land in, -1 while no drag
  let dragFrom = $state(-1);
  let dropAt = $state(-1);

  const sheetWidth = $derived(Math.max(40, Math.min(150, listWidth - 32)));

  function sheetHeight(page: { w: number; h: number }): number {
    return Math.round((sheetWidth * page.h) / page.w);
  }

  // where every row starts, and one more for the end of the last
  const tops = $derived.by(() => {
    const out: number[] = [];
    let y = PAD;
    for (const page of $pageList) {
      out.push(y);
      y += sheetHeight(page) + LABEL + GAP;
    }
    out.push(y);
    return out;
  });

  // the first row whose bottom is below y
  function rowAt(y: number): number {
    let lo = 0;
    let hi = $pageList.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tops[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const from = $derived(rowAt(scrollTop - AHEAD));
  const to = $derived(Math.min($pageList.length, rowAt(scrollTop + listHeight + AHEAD) + 1));
  const shown = $derived($pageList.slice(from, to));

  const board = $derived($notebookKind === 'board');
  const word = $derived(board ? 'board' : 'page');
  const Word = $derived(board ? 'Board' : 'Page');

  function thumb(canvas: HTMLCanvasElement, id: string) {
    thumbs.add(canvas, id, canvas.closest('.pages'));
    return {
      destroy: () => thumbs.remove(canvas)
    };
  }

  $effect(() => {
    const index = $pageIndex;
    if (!list || dragFrom >= 0 || index + 1 >= tops.length) return;
    const top = tops[index] - 8;
    const bottom = tops[index + 1] - GAP + 8;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  });

  function openMenu(e: MouseEvent, index: number) {
    e.preventDefault();
    const paper = openDoc()?.notebook.pages[index]?.paper;
    const last = $pageList.length - 1;
    contextMenu.set({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: `Duplicate ${word}`, action: () => actions.duplicatePage(index) },
        { label: 'Move up', disabled: index === 0, action: () => actions.movePage(index, index - 1) },
        { label: 'Move down', disabled: index === last, action: () => actions.movePage(index, index + 1) },
        { separator: true, label: '' },
        {
          label: 'Paper',
          children: [
            ...PAPER_STYLES.map((s) => ({
              label: s.label,
              checked: paper?.style === s.id,
              action: () => actions.setPagePaper(index, { style: s.id })
            })),
            { separator: true, label: '' },
            ...(Object.keys(PAPER_COLORS) as PaperColor[]).map((color) => ({
              label: PAPER_COLORS[color].label,
              checked: paper?.color === color,
              action: () => actions.setPagePaper(index, { color })
            }))
          ]
        },
        { label: `Use this paper on all ${word}s`, disabled: last === 0, action: () => actions.paperOnAllPages(index) },
        { separator: true, label: '' },
        { label: `Delete ${word}`, danger: true, action: () => actions.deletePage(index) }
      ]
    });
  }

  function ondragstart(e: DragEvent, index: number) {
    dragFrom = index;
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${Word} ${index + 1}`);
  }

  // over a gap or the add button the last gap stays marked
  function ondragover(e: DragEvent) {
    if (dragFrom < 0) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const page = (e.target as Element).closest<HTMLElement>('.page');
    if (!page) return;
    const index = Number(page.dataset.index);
    const r = page.getBoundingClientRect();
    dropAt = e.clientY < r.top + r.height / 2 ? index : index + 1;
  }

  function ondrop(e: DragEvent) {
    if (dragFrom < 0) return;
    e.preventDefault();
    const from = dragFrom;
    const at = dropAt;
    dragFrom = -1;
    dropAt = -1;
    if (at < 0) return;
    const to = at > from ? at - 1 : at;
    if (to !== from) actions.movePage(from, to);
  }

  function ondragend() {
    dragFrom = -1;
    dropAt = -1;
  }
</script>

<div
  class="pages"
  bind:this={list}
  bind:clientWidth={listWidth}
  bind:clientHeight={listHeight}
  onscroll={() => (scrollTop = list?.scrollTop ?? 0)}
  {ondragover}
  {ondrop}
  role="list">
  <div class="spacer" style="height: {tops[from] - PAD}px"></div>
  {#each shown as page, k (page.id)}
    {@const index = from + k}
    <div
      class="page"
      class:active={index === $pageIndex}
      class:dragged={index === dragFrom}
      class:drop-before={dropAt === index && dragFrom >= 0}
      class:drop-after={dropAt === index + 1 && index === $pageList.length - 1 && dragFrom >= 0}
      data-index={index}
      style="height: {sheetHeight(page) + LABEL}px"
      role="listitem">
      <button
        class="sheet"
        draggable="true"
        onclick={() => actions.goToPage(index)}
        oncontextmenu={(e) => openMenu(e, index)}
        ondragstart={(e) => ondragstart(e, index)}
        {ondragend}
        title="{Word} {index + 1}"
        aria-label="{Word} {index + 1}">
        <canvas use:thumb={page.id} style="height: {sheetHeight(page)}px"></canvas>
      </button>
      <span class="number">{index + 1}</span>
    </div>
  {/each}
  <div class="spacer" style="height: {tops[$pageList.length] - tops[to]}px"></div>
  <button class="add" onclick={() => actions.newPage()} title="New {word} (Ctrl+Enter)" aria-label="New {word}">
    <Icon name="plus" size={14} />
  </button>
</div>

<style>
  .pages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 16px;
  }

  .page {
    position: relative;
    width: 100%;
    max-width: 150px;
    margin: 0 auto 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }

  .sheet {
    display: block;
    width: 100%;
    padding: 0;
  }

  canvas {
    display: block;
    width: 100%;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .sheet:hover canvas {
    border-color: var(--text-muted);
  }

  .page.active canvas {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .page.dragged {
    opacity: 0.4;
  }

  /* the gap a dragged page would land in */
  .page.drop-before::before,
  .page.drop-after::after {
    content: '';
    position: absolute;
    left: -6px;
    right: -6px;
    height: 2px;
    background: var(--accent);
  }

  .page.drop-before::before {
    top: -6px;
  }

  .page.drop-after::after {
    bottom: -6px;
  }

  .number {
    font-family: var(--font-editor);
    font-size: 10px;
    line-height: 13px;
    color: var(--text-muted);
  }

  .page.active .number {
    color: var(--accent);
  }

  .add {
    width: 100%;
    max-width: 150px;
    height: 32px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    border: 1px dashed var(--border);
    flex-shrink: 0;
  }

  .add:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
</style>
