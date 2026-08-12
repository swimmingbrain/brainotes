<script lang="ts">
  import NumberField from './NumberField.svelte';

  let {
    value,
    onchange,
    oninput,
    min = 0,
    max = 100,
    step = 1,
    precision = 1,
    unit = '',
    disabled = false,
    label
  }: {
    value: number;
    onchange: (value: number) => void;
    oninput?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    precision?: number;
    unit?: string;
    disabled?: boolean;
    label?: string;
  } = $props();

  const fill = $derived(max > min ? ((value - min) / (max - min)) * 100 : 0);
</script>

<div class="slider-row" class:disabled>
  <input
    class="slider"
    type="range"
    {min}
    {max}
    {step}
    {value}
    {disabled}
    aria-label={label}
    style="--fill: {fill}%"
    oninput={(e) => {
      const next = Number(e.currentTarget.value);
      if (oninput) oninput(next);
      else onchange(next);
    }}
    onchange={(e) => onchange(Number(e.currentTarget.value))} />
  <div class="number">
    <NumberField {value} {min} {max} {step} {precision} {unit} {disabled} {label} {onchange} {oninput} />
  </div>
</div>

<style>
  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .number {
    width: 62px;
    flex-shrink: 0;
  }

  .slider {
    flex: 1;
    min-width: 0;
    height: 14px;
    appearance: none;
    background: none;
    outline: none;
    cursor: pointer;
  }

  .slider::-webkit-slider-runnable-track {
    height: 3px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--border) var(--fill));
  }

  .slider::-moz-range-track {
    height: 3px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--border) var(--fill));
  }

  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 9px;
    height: 13px;
    margin-top: -5px;
    background: var(--text-secondary);
    border: none;
  }

  .slider::-moz-range-thumb {
    width: 9px;
    height: 13px;
    background: var(--text-secondary);
    border: none;
    border-radius: 0;
  }

  .slider:hover::-webkit-slider-thumb {
    background: var(--accent);
  }

  .slider:hover::-moz-range-thumb {
    background: var(--accent);
  }

  .slider-row.disabled {
    opacity: 0.4;
  }
</style>
