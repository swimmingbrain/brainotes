<script lang="ts">
  import Dialog from '../Dialog.svelte';

  let {
    title,
    message,
    confirm,
    danger = false,
    onconfirm,
    onclose
  }: {
    title: string;
    message: string;
    confirm: string;
    danger?: boolean;
    onconfirm: () => void;
    onclose: () => void;
  } = $props();

  // the action first, closing takes the props away with the dialog
  function apply() {
    onconfirm();
    onclose();
  }
</script>

<Dialog {title} description={message} width={380} {onclose}>
  {#snippet footer()}
    <button class="dialog-btn" onclick={onclose}>Cancel</button>
    <button class="dialog-btn primary" class:danger onclick={apply}>{confirm}</button>
  {/snippet}
</Dialog>

<style>
  .dialog-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .dialog-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .dialog-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #111;
  }

  .dialog-btn.primary:hover {
    background: var(--accent-hover);
  }

  .dialog-btn.danger,
  .dialog-btn.danger:hover {
    background: var(--error);
    border-color: var(--error);
    color: #111;
  }

  .dialog-btn.danger:hover {
    filter: brightness(1.1);
  }
</style>
