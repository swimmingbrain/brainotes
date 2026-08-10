<script lang="ts">
  import type { Snippet } from 'svelte';

  // the label/control row every panel is built from. the label column has a
  // fixed width so controls line up down a whole panel, whatever they are
  let {
    label,
    hint,
    children,
    before,
    after
  }: {
    label: string;
    hint?: string;
    children: Snippet;
    before?: Snippet;
    after?: Snippet;
  } = $props();
</script>

<div class="field">
  {#if before}
    <div class="before">{@render before()}</div>
  {/if}
  <span class="field-label" title={hint ?? label}>{label}</span>
  <div class="field-control">{@render children()}</div>
  {#if after}
    <div class="after">{@render after()}</div>
  {/if}
</div>

<style>
  .field {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    min-height: 24px;
  }

  .field-label {
    flex: 0 0 110px;
    font-size: 11.5px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .field-control {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .before,
  .after {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    color: var(--text-muted);
  }
</style>
