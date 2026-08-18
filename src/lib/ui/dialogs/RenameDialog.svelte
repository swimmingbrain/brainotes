<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../Dialog.svelte';
  import { actions } from '$lib/editor/actions';

  let { id, name: current, onclose }: { id?: string; name: string; onclose: () => void } = $props();

  let name = $state(untrack(() => current));

  function apply() {
    const next = name.trim();
    if (!next) return;
    actions.renameNotebook(next, id);
    onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    } else if (e.key === 'Escape') {
      onclose();
    }
  }
</script>

<Dialog title="Rename notebook" description="Give it a name you will recognise later." width={380} {onclose}>
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="text"
    bind:value={name}
    spellcheck="false"
    maxlength="120"
    aria-label="Name"
    autofocus
    {onkeydown}
    onfocus={(e) => e.currentTarget.select()} />
  {#snippet footer()}
    <button class="dialog-btn" onclick={onclose}>Cancel</button>
    <button class="dialog-btn primary" onclick={apply} disabled={!name.trim()}>Rename</button>
  {/snippet}
</Dialog>

<style>
  .text {
    width: 100%;
    padding: 5px 8px;
    font-family: var(--font-ui);
    font-size: 12.5px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    outline: none;
  }

  .text:focus {
    border-color: var(--accent);
  }

  .dialog-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .dialog-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .dialog-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .dialog-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #111;
  }

  .dialog-btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
</style>
