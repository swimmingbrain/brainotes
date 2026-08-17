<script lang="ts">
  import Slider from '../Slider.svelte';
  import ToggleField from '../ToggleField.svelte';
  import { setToolOption, toolOptions, type EraserMode } from '$lib/stores/app';

  const modes: { id: EraserMode; label: string; hint: string }[] = [
    { id: 'stroke', label: 'Stroke', hint: 'Takes away whole strokes' },
    { id: 'area', label: 'Area', hint: 'Cuts away only what it passes over' }
  ];
</script>

<div class="segments" role="radiogroup" aria-label="Eraser mode">
  {#each modes as mode (mode.id)}
    <button
      class="segment"
      class:active={$toolOptions.eraserMode === mode.id}
      role="radio"
      aria-checked={$toolOptions.eraserMode === mode.id}
      title={mode.hint}
      onclick={() => setToolOption('eraserMode', mode.id)}>
      {mode.label}
    </button>
  {/each}
</div>
<span class="sep"></span>
<span class="label">size</span>
<div class="size">
  <Slider
    value={$toolOptions.eraserSize}
    min={4}
    max={80}
    step={2}
    precision={0}
    label="Eraser size"
    onchange={(v) => setToolOption('eraserSize', v)} />
</div>
<span class="sep"></span>
<span class="label">highlighter only</span>
<ToggleField
  value={$toolOptions.eraseHighlighterOnly}
  label="Erase only highlighter"
  onchange={(v) => setToolOption('eraseHighlighterOnly', v)} />

<style>
  .segments {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .segment {
    height: 24px;
    padding: 0 10px;
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  .segment:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .segment.active {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .sep {
    width: 1px;
    height: 16px;
    margin: 0 6px;
    background: var(--border);
    flex-shrink: 0;
  }

  .label {
    margin-right: 6px;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .size {
    width: 140px;
    flex-shrink: 0;
  }
</style>
