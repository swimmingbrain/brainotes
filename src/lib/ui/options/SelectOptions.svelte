<script lang="ts">
  import Icon from '../Icon.svelte';
  import SwatchRow from './SwatchRow.svelte';
  import { actions } from '$lib/editor/actions';
  import { INK_COLORS } from '$lib/editor/colors';
  import { selectionCount } from '$lib/stores/app';

  let lastColor = $state(INK_COLORS[0]);
  const none = $derived($selectionCount === 0);

  function recolor(color: string) {
    lastColor = color;
    actions.recolorSelection(color);
  }
</script>

<button class="text-btn" disabled={none} onclick={() => actions.deleteSelection()} title="Delete the selection (Delete)">
  <Icon name="trash" size={13} />
  Delete
</button>
<button class="text-btn" disabled={none} onclick={() => actions.duplicateSelection()} title="Duplicate the selection (Ctrl+D)">
  <Icon name="copy" size={13} />
  Duplicate
</button>
<span class="sep"></span>
<span class="label">color</span>
<SwatchRow value={lastColor} colors={INK_COLORS} disabled={none} label="Selection color" onchange={recolor} />
{#if none}
  <span class="sep"></span>
  <span class="hint">draw a loop around ink to select it</span>
{:else}
  <span class="sep"></span>
  <span class="hint">{$selectionCount} selected</span>
{/if}

<style>
  .text-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    font-size: 11.5px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .text-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .text-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .sep {
    width: 1px;
    height: 16px;
    margin: 0 6px;
    background: var(--border);
    flex-shrink: 0;
  }

  .label {
    margin-right: 6px;
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .hint {
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }
</style>
