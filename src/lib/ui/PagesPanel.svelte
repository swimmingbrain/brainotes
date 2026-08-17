<script lang="ts">
  import Icon from './Icon.svelte';
  import { actions } from '$lib/editor/actions';
  import { PAGE_SIZES, paperPattern } from '$lib/editor/paper';
  import { contextMenu, notebookKind, pageCount, pageIndex, paperStyle } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';

  const pages = $derived(Array.from({ length: $pageCount }, (_, i) => i));
  const board = $derived($notebookKind === 'board');
  // boards are wide, paper pages follow the page size from the preferences
  const ratio = $derived(board ? 10 / 16 : PAGE_SIZES[$preferences.paper.size].ratio);
  const background = $derived(paperPattern($paperStyle, $preferences.paper.color, 8));

  function openMenu(e: MouseEvent, index: number) {
    e.preventDefault();
    contextMenu.set({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Go to page', action: () => actions.goToPage(index) },
        { label: 'New page', shortcut: 'Ctrl+Enter', action: () => actions.newPage() },
        { separator: true, label: '' },
        { label: 'Move up', disabled: index === 0, action: () => actions.movePage(index, index - 1) },
        { label: 'Move down', disabled: index === $pageCount - 1, action: () => actions.movePage(index, index + 1) },
        { separator: true, label: '' },
        { label: 'Delete page', danger: true, action: () => actions.deletePage(index) }
      ]
    });
  }
</script>

{#if $pageCount === 0}
  <div class="empty">
    <Icon name="page" size={22} />
    <p class="empty-title">No pages yet</p>
    <button class="empty-btn" onclick={() => actions.newPage()}>
      <Icon name="plus" size={13} />
      Add a page
    </button>
  </div>
{:else}
  <div class="pages">
    {#each pages as index (index)}
      <button
        class="page"
        class:active={index === $pageIndex}
        onclick={() => actions.goToPage(index)}
        oncontextmenu={(e) => openMenu(e, index)}
        title="{board ? 'Board' : 'Page'} {index + 1}">
        <span class="sheet" style="aspect-ratio: 1 / {ratio}; background: {background}"></span>
        <span class="number">{index + 1}</span>
      </button>
    {/each}
    <button class="add" onclick={() => actions.newPage()} title="New page (Ctrl+Enter)">
      <Icon name="plus" size={14} />
    </button>
  </div>
{/if}

<style>
  .pages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
  }

  .page {
    width: 100%;
    max-width: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }

  .sheet {
    display: block;
    width: 100%;
    border: 1px solid var(--border);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .page:hover .sheet {
    border-color: var(--text-muted);
  }

  .page.active .sheet {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .number {
    font-family: var(--font-editor);
    font-size: 10px;
    color: var(--text-muted);
  }

  .page.active .number {
    color: var(--accent);
  }

  .add {
    width: 100%;
    max-width: 150px;
    height: 32px;
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
