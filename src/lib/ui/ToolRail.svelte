<script lang="ts">
  import { tools } from '$lib/editor/tools';
  import { activeTool, panels, toggleLeftPanel, toggleRightPanel } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';
  import Icon from './Icon.svelte';

  const shown = $derived(tools.filter((tool) => $preferences.tools[tool.id]));

  // a tool that was just hidden in the preferences can't stay the active one
  $effect(() => {
    if (shown.length > 0 && !shown.some((tool) => tool.id === $activeTool)) {
      activeTool.set(shown.find((tool) => tool.id === 'pen')?.id ?? shown[0].id);
    }
  });
</script>

<div class="tool-rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
  <div class="tools">
    {#each shown as tool (tool.id)}
      <button
        class="tool-btn"
        class:active={$activeTool === tool.id}
        title="{tool.label} ({tool.shortcut})"
        aria-label={tool.label}
        aria-pressed={$activeTool === tool.id}
        onclick={() => activeTool.set(tool.id)}>
        <Icon name={tool.icon} size={15} />
      </button>
    {/each}
  </div>

  <div class="panel-toggles">
    <button
      class="tool-btn"
      class:on={$panels.leftOpen}
      title="Pages panel (Ctrl+B)"
      aria-label="Pages panel"
      aria-pressed={$panels.leftOpen}
      onclick={toggleLeftPanel}>
      <Icon name="panelLeft" size={15} />
    </button>
    <button
      class="tool-btn"
      class:on={$panels.rightOpen}
      title="Reference panel (Ctrl+Alt+B)"
      aria-label="Reference panel"
      aria-pressed={$panels.rightOpen}
      onclick={toggleRightPanel}>
      <Icon name="panelRight" size={15} />
    </button>
  </div>
</div>

<style>
  .tool-rail {
    width: var(--toolbar-h);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: var(--bg-surface);
    border-right: 1px solid var(--border);
    overflow: hidden;
  }

  .tools,
  .panel-toggles {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 3px 0;
  }

  .tools {
    min-height: 0;
    overflow-y: auto;
  }

  .tools::-webkit-scrollbar {
    width: 0;
  }

  .panel-toggles {
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .tool-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tool-btn.active {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .tool-btn.on {
    color: var(--accent);
  }
</style>
