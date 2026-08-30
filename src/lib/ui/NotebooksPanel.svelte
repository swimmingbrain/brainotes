<script lang="ts">
  import Icon from './Icon.svelte';
  import { actions } from '$lib/editor/actions';
  import { notebookMenu } from '$lib/editor/commands';
  import { countPages, timeAgo } from '$lib/format';
  import { contextMenu, library, notebookId, type NotebookSummary } from '$lib/stores/app';

  function openMenu(e: MouseEvent, notebook: NotebookSummary) {
    e.preventDefault();
    contextMenu.set({ x: e.clientX, y: e.clientY, items: notebookMenu(notebook) });
  }

  // the more button drops the same menu under itself, for pens and fingers
  function openMore(e: MouseEvent, notebook: NotebookSummary) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    contextMenu.set({ x: rect.left, y: rect.bottom + 2, items: notebookMenu(notebook) });
  }
</script>

{#if $library.length === 0}
  <div class="empty">
    <Icon name="notebook" size={22} />
    <p class="empty-title">Nothing saved here yet</p>
    <p class="empty-text">Notebooks show up here once you write in them. They stay in this browser.</p>
    <div class="empty-actions">
      <button class="empty-btn" onclick={() => actions.newNotebook('paper')}>
        <Icon name="plus" size={13} />
        New notebook
      </button>
      <button class="empty-btn" onclick={() => actions.newNotebook('board')}>
        <Icon name="board" size={13} />
        New whiteboard
      </button>
    </div>
  </div>
{:else}
  <div class="list">
    {#each $library as notebook (notebook.id)}
      <div class="row" class:open={notebook.id === $notebookId} oncontextmenu={(e) => openMenu(e, notebook)} role="presentation">
        <button
          class="main"
          onclick={() => actions.openNotebook(notebook.id)}
          title={notebook.id === $notebookId ? 'Open now' : `Open ${notebook.name}`}>
          <Icon name={notebook.kind === 'board' ? 'board' : 'notebook'} size={14} />
          <span class="text">
            <span class="name">{notebook.name}</span>
            <span class="meta">{countPages(notebook.pageCount, notebook.kind)} &middot; {timeAgo(notebook.modifiedAt)}</span>
          </span>
        </button>
        <button class="more" onclick={(e) => openMore(e, notebook)} title="Rename or delete" aria-label="More">
          <Icon name="more" size={14} />
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0;
  }

  .row {
    display: flex;
    align-items: center;
    border-left: 2px solid transparent;
  }

  .row:hover {
    background: var(--bg-hover);
  }

  .row.open {
    border-left-color: var(--accent);
    background: var(--accent-dim);
  }

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px 6px 8px;
    color: var(--text-secondary);
    text-align: left;
  }

  .row:hover .main {
    color: var(--text-primary);
  }

  .row.open .main {
    color: var(--accent);
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .name {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    font-family: var(--font-editor);
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .more {
    width: 24px;
    height: 24px;
    margin-right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--text-muted);
    opacity: 0;
  }

  .row:hover .more,
  .row.open .more,
  .more:focus-visible {
    opacity: 1;
  }

  .more:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  /* no hover on touch screens, the button stays in sight there */
  @media (hover: none) {
    .more {
      opacity: 1;
    }
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px 16px;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-title {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .empty-text {
    max-width: 200px;
    font-size: 11px;
    line-height: 1.5;
  }

  .empty-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }

  .empty-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    font-size: 11.5px;
    color: var(--text-secondary);
    background: var(--bg-surface);
    border: 1px solid var(--border);
  }

  .empty-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
