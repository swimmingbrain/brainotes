<script lang="ts">
  let {
    value,
    options,
    onchange,
    disabled = false,
    label
  }: {
    value: string;
    options: { value: string; label: string }[];
    onchange: (value: string) => void;
    disabled?: boolean;
    label?: string;
  } = $props();
</script>

<select
  class="select"
  {value}
  {disabled}
  aria-label={label}
  onchange={(e) => onchange(e.currentTarget.value)}>
  {#each options as option (option.value)}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>

<style>
  .select {
    width: 100%;
    padding: 3px 6px;
    font-family: var(--font-ui);
    font-size: 11.5px;
    line-height: 16px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-bottom-color: var(--border);
    border-radius: 0;
    outline: none;
    cursor: pointer;
    appearance: none;
    /* the arrow, drawn in css so no image or icon component is needed here */
    background-image: linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
      linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
    background-position: calc(100% - 10px) 10px, calc(100% - 6px) 10px;
    background-size: 4px 4px, 4px 4px;
    background-repeat: no-repeat;
    padding-right: 20px;
  }

  .select:hover:not(:disabled) {
    border-bottom-color: var(--accent);
  }

  .select:focus {
    border-color: var(--accent);
  }

  .select:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .select option {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }
</style>
