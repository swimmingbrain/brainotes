<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../Dialog.svelte';
  import GeneralPrefs from './prefs/GeneralPrefs.svelte';
  import ToolsPrefs from './prefs/ToolsPrefs.svelte';
  import PensPrefs from './prefs/PensPrefs.svelte';
  import PaperPrefs from './prefs/PaperPrefs.svelte';
  import InputPrefs from './prefs/InputPrefs.svelte';
  import type { PreferencesCategory } from '$lib/stores/app';

  let { category: start = 'general', onclose }: { category?: PreferencesCategory; onclose: () => void } = $props();

  let category = $state<PreferencesCategory>(untrack(() => start));

  const categories: { id: PreferencesCategory; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'tools', label: 'Tools' },
    { id: 'pens', label: 'Pens' },
    { id: 'paper', label: 'Paper' },
    { id: 'input', label: 'Input' }
  ];
</script>

<Dialog title="Preferences" description="Changes apply at once and stay in this browser." width={640} {onclose}>
  <div class="prefs">
    <nav class="categories" aria-label="Categories">
      {#each categories as c (c.id)}
        <button class="category" class:active={category === c.id} aria-current={category === c.id} onclick={() => (category = c.id)}>
          {c.label}
        </button>
      {/each}
    </nav>
    <div class="page">
      {#if category === 'general'}
        <GeneralPrefs />
      {:else if category === 'tools'}
        <ToolsPrefs />
      {:else if category === 'pens'}
        <PensPrefs />
      {:else if category === 'paper'}
        <PaperPrefs />
      {:else}
        <InputPrefs />
      {/if}
    </div>
  </div>
  {#snippet footer()}
    <button class="dialog-btn primary" onclick={onclose}>Done</button>
  {/snippet}
</Dialog>

<style>
  /* a fixed height, so the dialog does not jump when the category changes */
  .prefs {
    display: flex;
    height: 400px;
    max-height: calc(100vh - 200px);
    min-height: 240px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    margin: 0 -20px;
  }

  .categories {
    width: 132px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px 6px;
    border-right: 1px solid var(--border);
    background: var(--bg-deep);
  }

  .category {
    padding: 6px 10px;
    font-size: 12px;
    color: var(--text-secondary);
    text-align: left;
  }

  .category:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .category.active {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .page {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 6px 12px 4px;
    overflow-y: auto;
  }

  .dialog-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .dialog-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #111;
  }

  .dialog-btn.primary:hover {
    background: var(--accent-hover);
  }

  @media (max-width: 560px) {
    .prefs {
      flex-direction: column;
      height: auto;
    }

    .categories {
      width: auto;
      flex-direction: row;
      flex-wrap: wrap;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
  }
</style>
