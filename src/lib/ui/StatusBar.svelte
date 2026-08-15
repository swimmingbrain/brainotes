<script lang="ts">
  import { actions } from '$lib/editor/actions';
  import {
    inputType,
    itemCount,
    notebookKind,
    notebookOpen,
    pageCount,
    pageIndex,
    saveState,
    zoomPercent
  } from '$lib/stores/app';

  const statusColors: Record<string, string> = {
    saved: 'var(--text-muted)',
    saving: 'var(--accent)',
    failed: 'var(--error)'
  };

  const statusWords: Record<string, string> = {
    saved: 'Ready',
    saving: 'Saving...',
    failed: 'Not saved'
  };

  const inputWords: Record<string, string> = {
    pen: 'pen',
    mouse: 'mouse',
    touch: 'touch'
  };

  const pageWord = $derived($notebookKind === 'board' ? 'board' : 'page');
</script>

<div class="status-bar">
  <div class="left">
    <span class="status-item">
      <span
        class="dot"
        class:pulse={$saveState === 'saving'}
        style="background: {statusColors[$saveState]}"></span>
      {statusWords[$saveState]}
    </span>
    {#if $notebookOpen}
      <span class="sep"></span>
      <span class="status-item pages">{pageWord} {$pageIndex + 1} of {$pageCount}</span>
      <span class="sep"></span>
      <span class="status-item" title="What drew last: a pen, a mouse or a finger">{inputWords[$inputType]}</span>
    {/if}
  </div>

  <div class="right">
    {#if $notebookOpen}
      <span class="status-item">{$itemCount} {$itemCount === 1 ? 'item' : 'items'}</span>
      <span class="sep"></span>
      <button class="status-item toggle" onclick={() => actions.zoomReset()} title="Fit the page width (Ctrl+0)">
        {$zoomPercent}%
      </button>
      <span class="sep"></span>
    {/if}
    <span class="status-item credit">
      made with <span class="heart">&hearts;</span> by
      <a href="https://swimmingbrain.dev" target="_blank" rel="noopener">Braian Plaku</a>
    </span>
  </div>
</div>

<style>
  .status-bar {
    height: var(--statusbar-h);
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    font-size: 10.5px;
    color: var(--text-muted);
    flex-shrink: 0;
    user-select: none;
    font-family: var(--font-editor);
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .pages {
    color: var(--text-secondary);
  }

  .sep {
    width: 1px;
    height: 10px;
    background: var(--border);
    margin: 0 4px;
  }

  .toggle {
    font-family: inherit;
    font-size: inherit;
    color: var(--text-muted);
    padding: 0 2px;
  }

  .toggle:hover {
    color: var(--text-secondary);
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    display: inline-block;
  }

  .pulse {
    animation: pulse 1.5s infinite;
  }

  .credit a {
    color: var(--accent);
    text-decoration: none;
  }

  .credit a:hover {
    color: var(--accent-hover);
  }

  .heart {
    color: var(--error);
    font-size: 11px;
  }

  @media (max-width: 900px) {
    .credit {
      display: none;
    }
  }
</style>
