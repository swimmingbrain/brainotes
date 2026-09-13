<script lang="ts">
  import Dialog from '../Dialog.svelte';
  import { tools } from '$lib/editor/tools';

  let { onclose }: { onclose: () => void } = $props();

  interface Shortcut {
    keys: string[];
    what: string;
  }

  // the same map shortcuts.ts binds, written out for people. a '/' between
  // keys means either one
  const groups: { name: string; items: Shortcut[] }[] = [
    {
      name: 'Tools',
      items: [
        ...tools.map((tool) => ({ keys: [tool.shortcut], what: tool.label })),
        { keys: ['Space'], what: 'Hand while held' },
        { keys: ['Shift'], what: 'Straight lines, squares and circles' }
      ]
    },
    {
      name: 'Pages',
      items: [
        { keys: ['Ctrl', 'Enter'], what: 'New page' },
        { keys: ['PageDown'], what: 'Next page' },
        { keys: ['PageUp'], what: 'Previous page' },
        { keys: ['←/→'], what: 'Previous / next page on the board, with nothing selected' }
      ]
    },
    {
      name: 'Edit',
      items: [
        { keys: ['Ctrl', 'Z'], what: 'Undo' },
        { keys: ['Ctrl', 'Shift', 'Z'], what: 'Redo (also Ctrl+Y)' },
        { keys: ['Ctrl', 'A'], what: 'Select all on the page' },
        { keys: ['Ctrl', 'C'], what: 'Copy the selection' },
        { keys: ['Ctrl', 'X'], what: 'Cut the selection' },
        { keys: ['Ctrl', 'V'], what: 'Paste items, a picture or text' },
        { keys: ['Ctrl', 'D'], what: 'Duplicate the selection' },
        { keys: ['Delete'], what: 'Delete the selection (Backspace too)' },
        { keys: ['←↑→↓'], what: 'Move the selection, Shift for bigger steps' },
        { keys: ['Escape'], what: 'Cancel / close' }
      ]
    },
    {
      name: 'View',
      items: [
        { keys: ['Ctrl', '='], what: 'Zoom in' },
        { keys: ['Ctrl', '-'], what: 'Zoom out' },
        { keys: ['Ctrl', '0'], what: 'Fit the page width' },
        { keys: ['Ctrl', 'Wheel'], what: 'Zoom the notes or the pdf on the side' },
        { keys: ['Ctrl', 'B'], what: 'Pages panel' },
        { keys: ['Ctrl', 'Alt', 'B'], what: 'Reference panel' },
        { keys: ['Ctrl', '1/2/3'], what: 'Notes, Study, Board' },
        { keys: ['Ctrl', 'Shift', 'F'], what: 'Present in fullscreen' }
      ]
    },
    {
      name: 'App',
      items: [
        { keys: ['Ctrl', 'K'], what: 'Command palette' },
        { keys: ['Ctrl', 'O'], what: 'Import a PDF or images' },
        { keys: ['Ctrl', ','], what: 'Preferences' },
        { keys: ['?'], what: 'This list' }
      ]
    }
  ];
</script>

<Dialog title="Keyboard shortcuts" description="Every key the app listens to." width={720} {onclose}>
  <div class="columns">
    {#each groups as group (group.name)}
      <section class="group">
        <h3 class="group-name">{group.name}</h3>
        {#each group.items as item (item.what)}
          <div class="row">
            <span class="keys">
              {#each item.keys as key, i (i)}
                {#if i > 0}<span class="plus">+</span>{/if}<kbd>{key}</kbd>
              {/each}
            </span>
            <span class="what">{item.what}</span>
          </div>
        {/each}
      </section>
    {/each}
  </div>
  {#snippet footer()}
    <button class="dialog-btn" onclick={onclose}>Close</button>
  {/snippet}
</Dialog>

<style>
  .columns {
    columns: 2;
    column-gap: 28px;
  }

  .group {
    break-inside: avoid;
    margin-bottom: 14px;
  }

  .group-name {
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    padding-bottom: 4px;
    margin-bottom: 4px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 24px;
    padding: 2px 0;
  }

  .keys {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 124px;
    flex-wrap: wrap;
  }

  .plus {
    font-size: 10px;
    color: var(--text-muted);
  }

  .what {
    font-size: 11.5px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .dialog-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .dialog-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  @media (max-width: 560px) {
    .columns {
      columns: 1;
    }
  }
</style>
