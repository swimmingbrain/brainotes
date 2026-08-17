<script lang="ts">
  import Icon from './Icon.svelte';
  import { actions } from '$lib/editor/actions';
  import { countPages, timeAgo } from '$lib/format';
  import { contextMenu, dialog, library, type NotebookSummary } from '$lib/stores/app';

  function openMenu(e: MouseEvent, notebook: NotebookSummary) {
    e.preventDefault();
    contextMenu.set({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open', action: () => actions.openNotebook(notebook.id) },
        {
          label: 'Rename',
          action: () => dialog.set({ kind: 'rename', target: 'notebook', id: notebook.id, name: notebook.name })
        },
        { separator: true, label: '' },
        {
          label: 'Delete',
          danger: true,
          action: () => {
            if (confirm(`Delete "${notebook.name}"? This can't be undone.`)) actions.deleteNotebook(notebook.id);
          }
        }
      ]
    });
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
      <button class="row" onclick={() => actions.openNotebook(notebook.id)} oncontextmenu={(e) => openMenu(e, notebook)}>
        <Icon name={notebook.kind === 'board' ? 'board' : 'notebook'} size={14} />
        <span class="name">{notebook.name}</span>
        <span class="meta">{countPages(notebook.pageCount, notebook.kind)} &middot; {timeAgo(notebook.modifiedAt)}</span>
      </button>
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
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--text-secondary);
    text-align: left;
  }

  .row:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    font-family: var(--font-editor);
    font-size: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
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
