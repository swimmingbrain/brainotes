<script lang="ts">
  import PreferencesDialog from './dialogs/PreferencesDialog.svelte';
  import ShortcutsDialog from './dialogs/ShortcutsDialog.svelte';
  import RenameDialog from './dialogs/RenameDialog.svelte';
  import { dialog } from '$lib/stores/app';

  // every dialog the app can open, in one switch, so the page never has to
  // know which one is up. each body owns its own Dialog frame
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
    {/if}
  {/key}
{/if}
