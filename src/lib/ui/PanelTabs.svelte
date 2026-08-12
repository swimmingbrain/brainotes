<script lang="ts">
  import type { Snippet } from 'svelte';

  export interface PanelTab {
    id: string;
    label: string;
    badge?: number | string;
  }

  let {
    tabs,
    active,
    onchange,
    right
  }: {
    tabs: PanelTab[];
    active: string;
    onchange: (id: string) => void;
    right?: Snippet;
  } = $props();
</script>

<div class="panel-header">
  <div class="tabs" role="tablist">
    {#each tabs as tab (tab.id)}
      <button
        class="panel-tab"
        class:active={tab.id === active}
        role="tab"
        aria-selected={tab.id === active}
        onclick={() => onchange(tab.id)}>
        {tab.label}
        {#if tab.badge !== undefined && tab.badge !== 0}
          <span class="badge">{tab.badge}</span>
        {/if}
      </button>
    {/each}
  </div>
  {#if right}
    <div class="right">{@render right()}</div>
  {/if}
</div>

<style>
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    height: 32px;
    border-bottom: 1px solid var(--border);
    padding: 0 3px;
    flex-shrink: 0;
    background: var(--bg-surface);
  }

  .tabs {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow-x: auto;
  }

  .tabs::-webkit-scrollbar {
    height: 0;
  }

  .panel-tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .panel-tab:hover {
    color: var(--text-secondary);
  }

  .panel-tab.active {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .badge {
    font-family: var(--font-editor);
    font-size: 9px;
    line-height: 14px;
    min-width: 14px;
    padding: 0 3px;
    text-align: center;
    color: var(--text-muted);
    background: var(--bg-deep);
    border: 1px solid var(--border);
  }

  .right {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 4px;
    flex-shrink: 0;
  }
</style>
