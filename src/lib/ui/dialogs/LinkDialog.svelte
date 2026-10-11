<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../Dialog.svelte';
  import { linkProject } from '$lib/bridge/tex';

  let { tex, onclose }: { tex: string; onclose: () => void } = $props();

  let name = $state(untrack(() => tex));

  // an empty name takes the link away again
  function apply() {
    if (!name.trim() && !tex) return;
    linkProject(name.trim() || null);
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

<Dialog
  title="Link TeXbrain project"
  description="The TeXbrain project these notes are written up in. Leave it empty to unlink."
  width={380}
  {onclose}>
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="text"
    bind:value={name}
    spellcheck="false"
    maxlength="120"
    placeholder="Project name"
    aria-label="Project name"
    autofocus
    {onkeydown}
    onfocus={(e) => e.currentTarget.select()} />
  {#snippet footer()}
    <button class="dialog-btn" onclick={onclose}>Cancel</button>
    <button class="dialog-btn primary" onclick={apply} disabled={!name.trim() && !tex}>
      {name.trim() || !tex ? 'Link' : 'Unlink'}
    </button>
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

  .text::placeholder {
    color: var(--text-muted);
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
