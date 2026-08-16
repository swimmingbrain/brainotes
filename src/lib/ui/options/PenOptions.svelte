<script lang="ts">
  import Icon from '../Icon.svelte';
  import Menu from '../Menu.svelte';
  import SelectField from '../SelectField.svelte';
  import Slider from '../Slider.svelte';
  import PenChips from './PenChips.svelte';
  import SwatchRow from './SwatchRow.svelte';
  import { HIGHLIGHTER_COLORS, INK_COLORS } from '$lib/editor/colors';
  import { addFavourite, makeDefaultPen, PEN_TYPE_OPTIONS } from '$lib/editor/pens';
  import { activeTool, currentPen, dialog, setToolOption, toolOptions, type MenuItem } from '$lib/stores/app';
  import type { PenType } from '$lib/stores/preferences';

  const marker = $derived($activeTool === 'highlighter');
  const pen = $derived(currentPen($activeTool, $toolOptions));

  // pen and highlighter are one pen with a type, picking the other type
  // switches the tool along with it
  function setType(type: string) {
    const next = type as PenType;
    if (next === 'highlighter') {
      activeTool.set('highlighter');
      return;
    }
    setToolOption('penType', next);
    activeTool.set('pen');
  }

  function setColor(color: string) {
    setToolOption(marker ? 'highlighterColor' : 'penColor', color);
  }

  function setSize(size: number) {
    setToolOption(marker ? 'highlighterSize' : 'penSize', size);
  }

  const menu = $derived<MenuItem[]>([
    { label: 'Add to favourites', action: () => addFavourite(pen) },
    { label: 'Make default pen', action: () => makeDefaultPen(pen) },
    { separator: true, label: '' },
    { label: 'Edit favourites...', action: () => dialog.set({ kind: 'preferences', category: 'pens' }) }
  ]);
</script>

<PenChips />
<span class="sep"></span>
<SwatchRow value={pen.color} colors={marker ? HIGHLIGHTER_COLORS : INK_COLORS} onchange={setColor} label="Pen color" />
<span class="sep"></span>
<span class="label">size</span>
<div class="size">
  {#if marker}
    <Slider value={pen.size} min={6} max={40} step={1} precision={0} label="Highlighter size" onchange={setSize} />
  {:else}
    <Slider value={pen.size} min={0.5} max={12} step={0.5} precision={1} label="Pen size" onchange={setSize} />
  {/if}
</div>
<span class="sep"></span>
<div class="type">
  <SelectField value={pen.type} options={PEN_TYPE_OPTIONS} label="Pen type" onchange={setType} />
</div>
<Menu items={menu}>
  {#snippet trigger({ toggle })}
    <button class="icon-btn" onclick={toggle} title="Favourites and default pen" aria-label="Pen options">
      <Icon name="more" size={14} />
    </button>
  {/snippet}
</Menu>

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
    width: 140px;
    flex-shrink: 0;
  }

  .type {
    width: 104px;
    flex-shrink: 0;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin-left: 2px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
