<script lang="ts">
  import { onMount } from 'svelte';
  import ScrollIndicator from './ScrollIndicator.svelte';
  import { actions } from '$lib/editor/actions';
  import { mountCanvas } from '$lib/editor/canvas';
  import { installClipboard } from '$lib/editor/clipboard';
  import { PAPER_STYLES } from '$lib/editor/commands';
  import { PAPER_COLORS } from '$lib/editor/paper';
  import { toolById } from '$lib/editor/tools';
  import { activeTool, contextMenu, history, inputType, paperColor, paperStyle, selectionCount, type MenuItem } from '$lib/stores/app';
  import type { PaperColor } from '$lib/stores/preferences';

  const cursor = $derived(toolById($activeTool).cursor);

  let layers: HTMLDivElement;
  let indicator: ScrollIndicator;

  onMount(() => {
    const unmount = mountCanvas(layers, (start, size) => indicator.show(start, size));
    const removeClipboard = installClipboard();
    return () => {
      removeClipboard();
      unmount();
    };
  });

  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
    // a long press of the pen is a right click on windows, it must not
    // open a menu in the middle of writing
    if ($inputType !== 'mouse') return;
    const at = { x: e.clientX, y: e.clientY };
    const selected: MenuItem[] =
      $selectionCount > 0
        ? [
            { label: 'Copy', shortcut: 'Ctrl+C', action: () => actions.copySelection() },
            { label: 'Cut', shortcut: 'Ctrl+X', action: () => actions.cutSelection() },
            { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => actions.duplicateSelection() },
            { label: 'Delete', shortcut: 'Delete', danger: true, action: () => actions.deleteSelection() },
            { separator: true, label: '' }
          ]
        : [];
    contextMenu.set({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...selected,
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => actions.paste(at) },
        { label: 'Select all', shortcut: 'Ctrl+A', action: () => actions.selectAll() },
        { separator: true, label: '' },
        { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !$history.canUndo, action: () => actions.undo() },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: !$history.canRedo, action: () => actions.redo() },
        { separator: true, label: '' },
        {
          label: 'Paper',
          children: [
            ...PAPER_STYLES.map((style) => ({
              label: style.label,
              checked: $paperStyle === style.id,
              action: () => actions.setPaperStyle(style.id)
            })),
            { separator: true, label: '' },
            ...(Object.keys(PAPER_COLORS) as PaperColor[]).map((color) => ({
              label: PAPER_COLORS[color].label,
              checked: $paperColor === color,
              action: () => actions.setPaperColor(color)
            }))
          ]
        },
        { label: 'Fit the page width', shortcut: 'Ctrl+0', action: () => actions.zoomReset() },
        { separator: true, label: '' },
        { label: 'New page', shortcut: 'Ctrl+Enter', action: () => actions.newPage() }
      ]
    });
  }
</script>

<div class="canvas-area" style="cursor: {cursor}" role="presentation" {oncontextmenu}>
  <!-- the engine puts its canvases in here -->
  <div class="layers" bind:this={layers}></div>
  <ScrollIndicator bind:this={indicator} />
</div>

<style>
  .canvas-area {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: var(--bg-deep);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .layers {
    position: absolute;
    inset: 0;
  }
</style>
