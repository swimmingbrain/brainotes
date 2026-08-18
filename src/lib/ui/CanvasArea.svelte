<script lang="ts">
  import { actions } from '$lib/editor/actions';
  import { PAPER_STYLES } from '$lib/editor/commands';
  import { toolById } from '$lib/editor/tools';
  import { activeTool, contextMenu, history, inputType, paperStyle, type InputType } from '$lib/stores/app';

  const cursor = $derived(toolById($activeTool).cursor);

  function onpointerdown(e: PointerEvent) {
    inputType.set(e.pointerType as InputType);
  }

  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
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

<!-- the canvas engine mounts in here, this element only gives it its room -->
<div class="canvas-area" style="cursor: {cursor}" role="presentation" {onpointerdown} {oncontextmenu}></div>

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
  }
</style>
