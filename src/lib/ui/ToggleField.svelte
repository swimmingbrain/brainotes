<script lang="ts">
  let {
    value,
    onchange,
    disabled = false,
    label
  }: {
    value: boolean;
    onchange: (value: boolean) => void;
    disabled?: boolean;
    label?: string;
  } = $props();
</script>

<button
  class="switch"
  class:on={value}
  role="switch"
  aria-checked={value}
  aria-label={label}
  {disabled}
  onclick={() => onchange(!value)}>
  <span class="knob"></span>
</button>

<style>
  .switch {
    width: 26px;
    height: 14px;
    padding: 2px;
    display: flex;
    align-items: center;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .switch:hover:not(:disabled) {
    border-color: var(--text-muted);
  }

  .switch.on {
    background: var(--accent-dim);
    border-color: var(--accent);
  }

  .switch:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .knob {
    width: 8px;
    height: 8px;
    background: var(--text-muted);
    transition: transform 0.1s ease, background 0.1s ease;
  }

  .switch.on .knob {
    background: var(--accent);
    transform: translateX(12px);
  }
</style>
