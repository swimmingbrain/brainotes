<script lang="ts">
  import Slider from '../Slider.svelte';
  import SwatchRow from './SwatchRow.svelte';
  import { INK_COLORS } from '$lib/editor/colors';
  import { setToolOption, toolOptions } from '$lib/stores/app';
</script>

<span class="label">size</span>
<div class="size">
  <Slider
    value={$toolOptions.textSize}
    min={10}
    max={72}
    step={1}
    precision={0}
    unit=" px"
    label="Text size"
    onchange={(v) => setToolOption('textSize', v)} />
</div>
<span class="sep"></span>
<SwatchRow
  value={$toolOptions.textColor}
  colors={INK_COLORS}
  label="Text color"
  onchange={(c) => setToolOption('textColor', c)} />

<style>
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
    width: 150px;
    flex-shrink: 0;
  }
</style>
