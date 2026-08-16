<script lang="ts">
  import { samePen } from '$lib/editor/pens';
  import { activeTool, currentPen, toolOptions, usePen } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';

  const current = $derived(currentPen($activeTool, $toolOptions));

  // the dot grows with the pen, inside what still fits a 34px bar
  function dot(size: number): number {
    return Math.max(4, Math.min(12, Math.round(size * 1.4)));
  }
</script>

<div class="chips" role="radiogroup" aria-label="Favourite pens">
  {#each $preferences.pens as pen (pen.id)}
    <button
      class="chip"
      class:active={samePen(pen, current)}
      role="radio"
      aria-checked={samePen(pen, current)}
      title="{pen.type} {pen.color} {pen.size}"
      onclick={() => usePen(pen)}>
      <span
        class="dot"
        class:soft={pen.type === 'highlighter'}
        style="width: {dot(pen.size)}px; height: {dot(pen.size)}px; background: {pen.color}"></span>
      <span class="size">{pen.size}</span>
    </button>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 6px;
    border: 1px solid transparent;
    color: var(--text-muted);
  }

  .chip:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .chip.active {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
  }

  .dot {
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18);
  }

  .dot.soft {
    opacity: 0.75;
  }

  .size {
    font-family: var(--font-editor);
    font-size: 10px;
  }
</style>
