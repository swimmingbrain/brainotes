<script lang="ts">
  import { untrack } from 'svelte';

  let {
    value,
    onchange,
    oninput,
    disabled = false,
    label
  }: {
    value: string;
    onchange: (value: string) => void;
    oninput?: (value: string) => void;
    disabled?: boolean;
    label?: string;
  } = $props();

  let draft = $state(untrack(() => value));

  // the hex box is free to hold half typed values while someone edits it,
  // the swatch keeps showing the last one that parsed
  $effect(() => {
    draft = value;
  });

  function normalize(text: string): string | null {
    const hex = text.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return '#' + hex.split('').map((c) => c + c).join('').toLowerCase();
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return '#' + hex.toLowerCase();
    return null;
  }

  function commitText() {
    const hex = normalize(draft);
    if (hex) onchange(hex);
    else draft = value;
  }
</script>

<div class="color-field" class:disabled>
  <label class="swatch" style="background: {value}">
    <input
      type="color"
      {value}
      {disabled}
      aria-label={label ?? 'Color'}
      oninput={(e) => oninput?.(e.currentTarget.value)}
      onchange={(e) => onchange(e.currentTarget.value)} />
  </label>
  <input
    class="hex"
    bind:value={draft}
    {disabled}
    spellcheck="false"
    aria-label={label ? label + ' hex' : 'Hex'}
    onkeydown={(e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commitText();
    }}
    onblur={commitText} />
</div>

<style>
  .color-field {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
  }

  .swatch {
    position: relative;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border: 1px solid var(--border);
    cursor: pointer;
    overflow: hidden;
  }

  .swatch input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    cursor: pointer;
  }

  .hex {
    flex: 1;
    min-width: 0;
    padding: 3px 6px;
    font-family: var(--font-editor);
    font-size: 11.5px;
    line-height: 16px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-bottom-color: var(--border);
    outline: none;
  }

  .hex:focus {
    border-color: var(--accent);
  }

  .color-field.disabled {
    opacity: 0.4;
  }
</style>
