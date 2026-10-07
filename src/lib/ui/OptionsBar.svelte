<script lang="ts">
  import Icon from './Icon.svelte';
  import PenOptions from './options/PenOptions.svelte';
  import EraserOptions from './options/EraserOptions.svelte';
  import ShapeOptions from './options/ShapeOptions.svelte';
  import TextOptions from './options/TextOptions.svelte';
  import SelectOptions from './options/SelectOptions.svelte';
  import PaperSelect from './options/PaperSelect.svelte';
  import ZoomControls from './options/ZoomControls.svelte';
  import { actions } from '$lib/editor/actions';
  import { toolById } from '$lib/editor/tools';
  import { activeTool, updatePanels } from '$lib/stores/app';

  const tool = $derived(toolById($activeTool));

  function openReference() {
    updatePanels((p) => ({ ...p, rightOpen: true }));
    actions.openReference();
  }
</script>

<div class="options-bar" role="toolbar" aria-label="{tool.label} options">
  <div class="left">
    <span class="tool-name">
      <Icon name={tool.icon} size={13} />
      {tool.label}
    </span>
    <span class="sep"></span>

    {#if $activeTool === 'pen' || $activeTool === 'highlighter'}
      <PenOptions />
    {:else if $activeTool === 'eraser'}
      <EraserOptions />
    {:else if $activeTool === 'shape'}
      <ShapeOptions />
    {:else if $activeTool === 'text'}
      <TextOptions />
    {:else if $activeTool === 'select'}
      <SelectOptions />
    {:else if $activeTool === 'image'}
      <button class="text-btn" onclick={() => actions.insertImage()} title="Pick an image to place on the page">
        <Icon name="image" size={13} />
        Insert image
      </button>
      <span class="sep"></span>
      <span class="hint">or paste one with Ctrl+V, or drop it on the page</span>
    {:else if $activeTool === 'snip'}
      <button class="text-btn" onclick={openReference} title="Open a PDF in the reference panel">
        <Icon name="pdf" size={13} />
        Open a PDF
      </button>
      <span class="sep"></span>
      <span class="hint">drag a box over the reference page, the clip lands in your notes</span>
    {:else if $activeTool === 'laser'}
      <span class="hint">a red line that stays while you draw and fades 1 second after you lift, nothing is kept</span>
    {:else}
      <span class="hint">drag to move around, or hold space with any tool</span>
    {/if}
  </div>

  <div class="right">
    <PaperSelect />
    <span class="sep"></span>
    <ZoomControls />
  </div>
</div>

<style>
  .options-bar {
    height: var(--toolbar-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 6px 0 10px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  /* on a narrow window the tool options scroll sideways instead of running
     into the paper and zoom controls */
  .left {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .left::-webkit-scrollbar {
    height: 0;
  }

  .right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .tool-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sep {
    width: 1px;
    height: 16px;
    margin: 0 6px;
    background: var(--border);
    flex-shrink: 0;
  }

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

  .text-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .hint {
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }
</style>
