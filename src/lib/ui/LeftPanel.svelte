<script lang="ts">
  import Icon from './Icon.svelte';
  import Menu from './Menu.svelte';
  import PanelTabs from './PanelTabs.svelte';
  import PagesPanel from './PagesPanel.svelte';
  import NotebooksPanel from './NotebooksPanel.svelte';
  import { actions } from '$lib/editor/actions';
  import { leftPanelTab, library, notebookId, notebookKind, pageCount, type LeftPanelTab, type MenuItem } from '$lib/stores/app';

  const tabs = $derived([
    { id: 'pages', label: $notebookKind === 'board' ? 'Boards' : 'Pages', badge: $pageCount },
    { id: 'notebooks', label: 'Notebooks', badge: $library.length }
  ]);

  const newItems: MenuItem[] = [
    { label: 'New notebook', action: () => actions.newNotebook('paper') },
    { label: 'New whiteboard', action: () => actions.newNotebook('board') }
  ];
</script>

<section class="panel" aria-label="Pages and notebooks">
  <PanelTabs {tabs} active={$leftPanelTab} onchange={(id) => leftPanelTab.set(id as LeftPanelTab)}>
    {#snippet right()}
      {#if $leftPanelTab === 'pages'}
        <button
          class="head-btn"
          onclick={() => actions.newPage()}
          title="New {$notebookKind === 'board' ? 'board' : 'page'} (Ctrl+Enter)"
          aria-label="New page">
          <Icon name="plus" size={14} />
        </button>
      {:else}
        <Menu items={newItems}>
          {#snippet trigger({ toggle })}
            <button class="head-btn" onclick={toggle} title="New notebook or whiteboard" aria-label="New">
              <Icon name="plus" size={14} />
            </button>
          {/snippet}
        </Menu>
      {/if}
    {/snippet}
  </PanelTabs>
  <div class="body">
    {#if $leftPanelTab === 'pages'}
      <!-- the thumbnails belong to one notebook, another one starts over -->
      {#key $notebookId}
        <PagesPanel />
      {/key}
    {:else}
      <NotebooksPanel />
    {/if}
  </div>
</section>

<style>
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--bg-elevated);
    overflow: hidden;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .head-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--text-muted);
  }

  .head-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
