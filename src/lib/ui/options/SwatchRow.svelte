<script lang="ts">
  import { sameColor } from '$lib/editor/colors';

  let {
    value,
    colors,
    onchange,
    disabled = false,
    label = 'Color'
  }: {
    value: string;
    colors: string[];
    onchange: (color: string) => void;
    disabled?: boolean;
    label?: string;
  } = $props();

  const custom = $derived(!colors.some((c) => sameColor(c, value)));
</script>

<div class="swatches" class:disabled role="radiogroup" aria-label={label}>
  {#each colors as color (color)}
    <button
      class="swatch"
      class:active={sameColor(color, value)}
      style="background: {color}"
      title={color}
      role="radio"
      aria-checked={sameColor(color, value)}
      aria-label={color}
      {disabled}
      onclick={() => onchange(color)}></button>
  {/each}
  <label class="swatch custom" class:active={custom} title="Any color" style={custom ? `background: ${value}` : ''}>
    <input type="color" {value} {disabled} aria-label="Any color" onchange={(e) => onchange(e.currentTarget.value)} />
  </label>
</div>

<style>
  .swatches {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .swatches.disabled {
    opacity: 0.35;
  }

  .swatch {
    position: relative;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .swatch:hover:not(:disabled) {
    border-color: var(--text-secondary);
  }

  .swatch.active {
    outline: 1px solid var(--accent);
    outline-offset: 1px;
  }

  /* the rainbow says "any color" until one has been picked */
  .custom {
    cursor: pointer;
    overflow: hidden;
    background: conic-gradient(#e06c75, #e5c07b, #73c991, #61afef, #c678dd, #e06c75);
  }

  .custom input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    opacity: 0;
    cursor: pointer;
  }
</style>
