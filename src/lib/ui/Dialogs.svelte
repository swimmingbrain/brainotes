<script lang="ts">
  import PreferencesDialog from './dialogs/PreferencesDialog.svelte';
  import ShortcutsDialog from './dialogs/ShortcutsDialog.svelte';
  import RenameDialog from './dialogs/RenameDialog.svelte';
  import ConfirmDialog from './dialogs/ConfirmDialog.svelte';
  import PdfDialog from './dialogs/PdfDialog.svelte';
  import { dialog } from '$lib/stores/app';

  function close() {
    dialog.set(null);
  }
</script>

{#if $dialog}
  {#key $dialog}
    {#if $dialog.kind === 'preferences'}
      <PreferencesDialog category={$dialog.category} onclose={close} />
    {:else if $dialog.kind === 'shortcuts'}
      <ShortcutsDialog onclose={close} />
    {:else if $dialog.kind === 'rename'}
      <RenameDialog id={$dialog.id} name={$dialog.name} onclose={close} />
    {:else if $dialog.kind === 'confirm'}
      <ConfirmDialog
        title={$dialog.title}
        message={$dialog.message}
        confirm={$dialog.confirm}
        danger={$dialog.danger}
        onconfirm={$dialog.onconfirm}
        onclose={close} />
    {:else if $dialog.kind === 'pdf'}
      <PdfDialog files={$dialog.files} onclose={close} />
    {/if}
  {/key}
{/if}
