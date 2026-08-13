<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    description,
    width = 420,
    onclose,
    children,
    footer
  }: {
    title: string;
    description?: string;
    width?: number;
    onclose: () => void;
    children?: Snippet;
    footer?: Snippet;
  } = $props();

  let panel = $state<HTMLDivElement | null>(null);

  const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

  function focusable(): HTMLElement[] {
    if (!panel) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== 'Tab') return;
    // tab must not wander back into the editor behind the dialog
    const items = focusable();
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !panel?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  $effect(() => {
    const items = focusable();
    (items[0] ?? panel)?.focus();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dialog-backdrop" onclick={onclose} {onkeydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog"
    bind:this={panel}
    style="width: {width}px"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}>
    <div class="dialog-head">
      <h2 class="dialog-title">{title}</h2>
      <button class="dialog-close" onclick={onclose} aria-label="Close">&#xd7;</button>
    </div>
    {#if description}
      <p class="dialog-desc">{description}</p>
    {/if}
    {#if children}
      <div class="dialog-body">{@render children()}</div>
    {/if}
    {#if footer}
      <div class="dialog-footer">{@render footer()}</div>
    {/if}
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.5);
  }

  .dialog {
    max-width: 100%;
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    animation: fade-in 100ms ease;
    outline: none;
  }

  .dialog-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .dialog-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .dialog-close {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    line-height: 1;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .dialog-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .dialog-desc {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 16px;
  }

  .dialog-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 16px;
  }
</style>
