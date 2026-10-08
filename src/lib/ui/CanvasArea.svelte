<script lang="ts">
  import { onMount } from 'svelte';
  import PenDiagnostics from './PenDiagnostics.svelte';
  import ScrollIndicator from './ScrollIndicator.svelte';
  import { actions } from '$lib/editor/actions';
  import { mountCanvas } from '$lib/editor/canvas';
  import { penStats } from '$lib/engine/stats';
  import { installClipboard } from '$lib/editor/clipboard';
  import { PAPER_STYLES } from '$lib/editor/commands';
  import { PAPER_COLORS } from '$lib/editor/paper';
  import { toolById } from '$lib/editor/tools';
  import { activeTool, addToast, contextMenu, history, inputType, paperColor, paperStyle, selectionCount, type MenuItem } from '$lib/stores/app';
  import { preferences, type PaperColor } from '$lib/stores/preferences';

  const cursor = $derived(toolById($activeTool).cursor);

  let layers: HTMLDivElement;
  let indicator: ScrollIndicator;
  // why the writing area could not start, shown instead of a black area
  let failed = $state('');

  onMount(() => {
    let unmount = () => {};
    try {
      unmount = mountCanvas(layers, (start, size) => indicator.show(start, size));
    } catch (err) {
      console.error(err);
      layers.replaceChildren();
      failed = err instanceof Error ? err.message : String(err);
      penStats.error = failed;
      addToast(`The writing area could not start: ${failed}`, 'error', 0);
    }
    const removeClipboard = installClipboard();
    return () => {
      removeClipboard();
      unmount();
    };
  });

  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
    // a long pen press is a right click on windows, no menu in the middle of writing
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
  {#if failed}
    <div class="failed">The writing area could not start: {failed}</div>
  {/if}
  <ScrollIndicator bind:this={indicator} />
  {#if $preferences.penDiagnostics}
    <PenDiagnostics />
  {/if}
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

  .failed {
    position: absolute;
    left: 16px;
    right: 16px;
    top: 40%;
    color: var(--text-secondary);
    font-size: 12px;
    text-align: center;
  }
</style>
