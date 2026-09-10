<script lang="ts">
  import Icon from './Icon.svelte';
  import PanelTabs from './PanelTabs.svelte';
  import PdfReader from './reference/PdfReader.svelte';
  import ImageReader from './reference/ImageReader.svelte';
  import { actions } from '$lib/editor/actions';
  import { closeReference, showReference } from '$lib/editor/references';
  import { activeReference, references } from '$lib/stores/reference';

  const tabs = $derived(
    $references.length > 0
      ? $references.map((r) => ({ id: r.id, label: r.name.replace(/\.pdf$/i, ''), title: r.name }))
      : [{ id: 'reference', label: 'Reference' }]
  );
  const shown = $derived($references.find((r) => r.id === $activeReference) ?? null);
</script>

<section class="panel" aria-label="Reference">
  <PanelTabs
    {tabs}
    active={shown?.id ?? 'reference'}
    onchange={(id) => id !== 'reference' && showReference(id)}
    onclose={$references.length > 0 ? closeReference : undefined}>
    {#snippet right()}
      <button
        class="head-btn"
        onclick={() => actions.openReference()}
        title="Open a PDF or an image to read on the side"
        aria-label="Open a reference">
        <Icon name="plus" size={14} />
      </button>
    {/snippet}
  </PanelTabs>
  <!-- the drop overlay sends files dropped in here to the reference panel -->
  <div class="body" data-drop="reference">
    {#if shown}
      {#key shown.id}
        {#if shown.kind === 'pdf'}
          <PdfReader file={shown.id} />
        {:else}
          <ImageReader file={shown.id} name={shown.name} />
        {/if}
      {/key}
    {:else}
      <div class="empty">
        <Icon name="pdf" size={26} />
        <p class="empty-title">Nothing open on the side</p>
        <p class="empty-text">drop a pdf here to read it next to your notes</p>
        <button class="empty-btn" onclick={() => actions.openReference()}>
          <Icon name="import" size={13} />
          Open a PDF
        </button>
      </div>
    {/if}
  </div>
</section>

<style>
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--bg-elevated);
    overflow: hidden;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-deep);
  }

  .head-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--text-muted);
  }

  .head-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 16px;
    padding: 24px 16px;
    color: var(--text-muted);
    text-align: center;
    border: 1px dashed var(--border);
  }

  .empty-title {
    font-size: 12.5px;
    color: var(--text-secondary);
  }

  .empty-text {
    font-family: var(--font-editor);
    font-size: 10.5px;
  }

  .empty-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 6px;
    padding: 5px 10px;
    font-size: 11.5px;
    color: var(--text-secondary);
    background: var(--bg-surface);
    border: 1px solid var(--border);
  }

  .empty-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
