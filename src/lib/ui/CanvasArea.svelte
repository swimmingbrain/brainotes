<script lang="ts">
  import { onMount } from 'svelte';
  import ScrollIndicator from './ScrollIndicator.svelte';
  import { actions } from '$lib/editor/actions';
  import { mountCanvas } from '$lib/editor/canvas';
  import { PAPER_STYLES } from '$lib/editor/commands';
  import { toolById } from '$lib/editor/tools';
  import { activeTool, contextMenu, history, inputType, paperStyle } from '$lib/stores/app';

  const cursor = $derived(toolById($activeTool).cursor);

  let layers: HTMLDivElement;
  let indicator: ScrollIndicator;

  onMount(() => mountCanvas(layers, (start, size) => indicator.show(start, size)));

  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
    // a long press of the pen is a right click on windows, it must not
    // open a menu in the middle of writing
    if ($inputType !== 'mouse') return;
    contextMenu.set({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !$history.canUndo, action: () => actions.undo() },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: !$history.canRedo, action: () => actions.redo() },
        { separator: true, label: '' },
        { label: 'Select all', shortcut: 'Ctrl+A', action: () => actions.selectAll() },
        { separator: true, label: '' },
        {
          label: 'Paper',
          children: PAPER_STYLES.map((style) => ({
            label: style.label,
            checked: $paperStyle === style.id,
            action: () => actions.setPaperStyle(style.id)
          }))
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
