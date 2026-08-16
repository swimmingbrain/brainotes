<script lang="ts">
  import Icon from '../Icon.svelte';
  import { actions } from '$lib/editor/actions';
  import { zoomPercent } from '$lib/stores/app';
</script>

<div class="zoom">
  <button class="icon-btn" onclick={() => actions.zoomOut()} title="Zoom out (Ctrl+-)" aria-label="Zoom out">
    <Icon name="zoomOut" size={14} />
  </button>
  <button class="percent" onclick={() => actions.zoomReset()} title="Fit the page width (Ctrl+0)">
    {$zoomPercent}%
  </button>
  <button class="icon-btn" onclick={() => actions.zoomIn()} title="Zoom in (Ctrl+=)" aria-label="Zoom in">
    <Icon name="zoomIn" size={14} />
  </button>
</div>

<style>
  .zoom {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--text-secondary);
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .percent {
    min-width: 46px;
    height: 24px;
    padding: 0 4px;
    font-family: var(--font-editor);
    font-size: 11px;
    color: var(--accent);
    text-align: center;
  }

  .percent:hover {
    background: var(--bg-hover);
  }
</style>
