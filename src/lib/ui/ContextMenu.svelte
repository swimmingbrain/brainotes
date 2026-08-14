<script lang="ts">
  import { contextMenu } from '$lib/stores/app';
  import Menu from './Menu.svelte';

  function close() {
    contextMenu.set(null);
  }
</script>

{#if $contextMenu}
  {#key $contextMenu}
    <Menu items={$contextMenu.items} at={{ x: $contextMenu.x, y: $contextMenu.y }} onclose={close} />
  {/key}
{/if}
