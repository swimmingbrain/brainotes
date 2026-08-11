<script lang="ts">
  // the scrubby number every parameter row uses: drag sideways to change it,
  // click to type it. oninput fires all the way through a drag so the preview
  // can follow, onchange only once the value has settled
  let {
    value,
    onchange,
    oninput,
    min,
    max,
    step = 1,
    unit = '',
    precision = 2,
    disabled = false,
    label
  }: {
    value: number;
    onchange: (value: number) => void;
    oninput?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    precision?: number;
    disabled?: boolean;
    label?: string;
  } = $props();

  let editing = $state(false);
  let dragging = $state(false);
  let draft = $state('');
  let input = $state<HTMLInputElement | null>(null);

  const display = $derived(format(value));

  function format(n: number): string {
    if (!Number.isFinite(n)) return '0';
    const fixed = n.toFixed(precision);
    // drop the zeros a fixed precision leaves behind, keep the number readable
    return precision > 0 ? fixed.replace(/\.?0+$/, '') : fixed;
  }

  function clamp(n: number): number {
    if (!Number.isFinite(n)) return value;
    // the step grid starts at the minimum, otherwise a range like 0.1..30 in
    // steps of 0.5 would snap its own lowest value down to zero
    const base = min ?? 0;
    let snapped = step > 0 ? base + Math.round((n - base) / step) * step : n;
    if (min !== undefined && snapped < min) snapped = min;
    if (max !== undefined && snapped > max) snapped = max;
    return Number(snapped.toFixed(6));
  }

  function commit(n: number) {
    onchange(clamp(n));
  }

  function startEdit() {
    if (disabled) return;
    draft = format(value);
    editing = true;
    queueMicrotask(() => {
      input?.focus();
      input?.select();
    });
  }

  function commitDraft() {
    editing = false;
    const text = draft.replace(',', '.').replace(/[^0-9.eE+-]/g, '').trim();
    // an empty box or something that isn't a number keeps the old value,
    // it must never turn into a zero or a NaN behind someone's back
    if (!text) return;
    const parsed = Number(text);
    if (Number.isFinite(parsed)) commit(parsed);
  }

  function onpointerdown(e: PointerEvent) {
    if (disabled || editing || e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const startValue = value;
    let moved = false;
    el.setPointerCapture(e.pointerId);

    function move(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      dragging = true;
      // shift is the fine pass, the modifier people already expect
      const scale = ev.shiftKey ? 0.1 : 1;
      const next = clamp(startValue + dx * step * scale);
      if (oninput) oninput(next);
      else onchange(next);
    }

    function up(ev: PointerEvent) {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (moved) {
        dragging = false;
        const dx = ev.clientX - startX;
        const scale = ev.shiftKey ? 0.1 : 1;
        commit(startValue + dx * step * scale);
      } else {
        startEdit();
      }
    }

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  function onkeydown(e: KeyboardEvent) {
    if (disabled) return;
    const factor = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      commit(value + step * factor);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      commit(value - step * factor);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startEdit();
    }
  }

  function oneditkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editing = false;
    }
  }
</script>

{#if editing}
  <input
    class="number-input"
    bind:this={input}
    bind:value={draft}
    onkeydown={oneditkeydown}
    onblur={commitDraft}
    aria-label={label} />
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <span
    class="number"
    class:dragging
    class:disabled
    role="spinbutton"
    aria-label={label}
    aria-valuenow={value}
    aria-valuemin={min}
    aria-valuemax={max}
    tabindex={disabled ? -1 : 0}
    {onpointerdown}
    {onkeydown}>{display}{unit}</span>
{/if}

<style>
  .number,
  .number-input {
    display: block;
    width: 100%;
    padding: 3px 6px;
    font-family: var(--font-editor);
    font-size: 11.5px;
    line-height: 16px;
    color: var(--accent);
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-bottom-color: var(--border);
    outline: none;
    text-align: right;
    user-select: none;
    cursor: ew-resize;
  }

  .number:hover:not(.disabled),
  .number.dragging {
    border-bottom-color: var(--accent);
  }

  .number:focus-visible {
    border-color: var(--accent);
  }

  .number.disabled {
    color: var(--text-muted);
    cursor: default;
  }

  .number-input {
    cursor: text;
    color: var(--text-primary);
    border-color: var(--accent);
  }
</style>
