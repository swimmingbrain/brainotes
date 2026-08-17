<script lang="ts">
  import Icon from '../Icon.svelte';
  import Slider from '../Slider.svelte';
  import SwatchRow from './SwatchRow.svelte';
  import { INK_COLORS } from '$lib/editor/colors';
  import { setToolOption, toolOptions, type ShapeKind } from '$lib/stores/app';

  const kinds: { id: ShapeKind; label: string; icon: string }[] = [
    { id: 'line', label: 'Line', icon: 'line' },
    { id: 'arrow', label: 'Arrow', icon: 'arrow' },
    { id: 'rectangle', label: 'Rectangle', icon: 'rect' },
    { id: 'ellipse', label: 'Ellipse', icon: 'ellipse' }
  ];
</script>

<div class="kinds" role="radiogroup" aria-label="Shape">
  {#each kinds as kind (kind.id)}
    <button
      class="icon-btn"
      class:active={$toolOptions.shapeKind === kind.id}
      role="radio"
      aria-checked={$toolOptions.shapeKind === kind.id}
      title={kind.label}
      aria-label={kind.label}
      onclick={() => setToolOption('shapeKind', kind.id)}>
      <Icon name={kind.icon} size={14} />
    </button>
  {/each}
</div>
<span class="sep"></span>
<SwatchRow
  value={$toolOptions.shapeColor}
  colors={INK_COLORS}
  label="Shape color"
  onchange={(c) => setToolOption('shapeColor', c)} />
<span class="sep"></span>
<span class="label">size</span>
<div class="size">
  <Slider
    value={$toolOptions.shapeSize}
    min={0.5}
    max={12}
    step={0.5}
    precision={1}
    label="Line width"
    onchange={(v) => setToolOption('shapeSize', v)} />
</div>

<style>
  .kinds {
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

  .icon-btn.active {
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
    flex-shrink: 0;
  }

  .size {
    width: 140px;
    flex-shrink: 0;
  }
</style>
