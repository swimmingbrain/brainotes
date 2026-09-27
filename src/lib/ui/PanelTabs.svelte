<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  export interface PanelTab {
    id: string;
    label: string;
    badge?: number | string;
    // the whole name when the label is cut short
    title?: string;
  }

  let {
    tabs,
    active,
    onchange,
    onclose,
    right
  }: {
    tabs: PanelTab[];
    active: string;
    onchange: (id: string) => void;
    // tabs get a close button when this is given
    onclose?: (id: string) => void;
    right?: Snippet;
  } = $props();

  function onauxclick(e: MouseEvent, id: string) {
    if (e.button !== 1 || !onclose) return;
    e.preventDefault();
    onclose(id);
  }
</script>

<div class="panel-header">
  <div class="tabs" role="tablist">
    {#each tabs as tab (tab.id)}
      <div class="tab" class:active={tab.id === active} class:closable={onclose !== undefined}>
        <button
          class="panel-tab"
          class:active={tab.id === active}
          role="tab"
          aria-selected={tab.id === active}
          title={tab.title}
          onclick={() => onchange(tab.id)}
          onauxclick={(e) => onauxclick(e, tab.id)}>
          <span class="label">{tab.label}</span>
          {#if tab.badge !== undefined && tab.badge !== 0}
            <span class="badge">{tab.badge}</span>
          {/if}
        </button>
        {#if onclose}
          <button class="tab-close" onclick={() => onclose(tab.id)} title="Close" aria-label="Close {tab.label}">
            <Icon name="close" size={10} />
          </button>
        {/if}
      </div>
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

  .tab {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .tab.active {
    background: var(--bg-hover);
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

  .tab.closable .panel-tab {
    padding-right: 4px;
  }

  .label {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .panel-tab:hover {
    color: var(--text-secondary);
  }

  .panel-tab.active {
    color: var(--text-primary);
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-right: 4px;
    color: var(--text-muted);
    opacity: 0;
  }

  .tab:hover .tab-close,
  .tab.active .tab-close {
    opacity: 1;
  }

  .tab-close:hover {
    color: var(--text-primary);
    background: var(--border);
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
