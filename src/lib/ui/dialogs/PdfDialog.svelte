<script lang="ts">
  import { get } from 'svelte/store';
  import Dialog from '../Dialog.svelte';
  import { actions } from '$lib/editor/actions';
  import { writeOn, type PdfTarget } from '$lib/editor/pdfs';
  import { PDF_LAYOUTS, type PdfLayout } from '$lib/pdf/layout';
  import { notebookOpen } from '$lib/stores/app';
  import { preferences, setPreference } from '$lib/stores/preferences';

  let { files, onclose }: { files: File[]; onclose: () => void } = $props();

  let layout = $state<PdfLayout>(get(preferences).pdfLayout);
  let target = $state<PdfTarget>('new');
  let remember = $state(false);

  const title = $derived(files.length === 1 ? files[0].name : `${files.length} pdfs`);

  // the files are taken first, closing takes the props away with the dialog
  function read() {
    const list = files;
    if (remember) setPreference('pdfDrop', 'reference');
    onclose();
    actions.openReference(list);
  }

  function write() {
    const list = files;
    if (remember) setPreference('pdfDrop', 'notebook');
    onclose();
    void writeOn(list, layout, $notebookOpen ? target : 'new');
  }
</script>

{#snippet sheet(kind: PdfLayout, big: boolean)}
  <!-- a page with the pdf page on it, as the layout puts it -->
  <svg class="sheet" class:big viewBox="0 0 40 40" aria-hidden="true">
    {#if kind === 'full'}
      <rect class="paper" x="10" y="3" width="20" height="34" />
      <rect class="pdf" x="10" y="3" width="20" height="34" />
      <path class="text" d="M13 9h11M13 13h14M13 17h12M13 21h14M13 25h9" />
    {:else if kind === 'below'}
      <rect class="paper" x="10" y="3" width="20" height="34" />
      <rect class="pdf" x="10" y="3" width="20" height="12" />
      <path class="text" d="M13 7h9M13 10.5h12" />
      <path class="lines" d="M12 20h16M12 24h16M12 28h16M12 32h16" />
    {:else}
      <rect class="paper" x="2" y="11" width="36" height="18" />
      <rect class="pdf" x="2" y="11" width="21" height="18" />
      <path class="text" d="M5 16h12M5 20h15M5 24h10" />
      <path class="lines" d="M26 16h10M26 20h10M26 24h10" />
    {/if}
  </svg>
{/snippet}

<Dialog title="Open {title}" description="Read it next to your notes, or write right on its pages." width={560} {onclose}>
  <div class="choices">
    <button class="choice" onclick={read}>
      <svg class="art" viewBox="0 0 64 40" aria-hidden="true">
        <rect class="paper" x="4" y="4" width="30" height="32" />
        <path class="lines" d="M8 12h22M8 17h22M8 22h22M8 27h22" />
        <rect class="panel" x="38" y="4" width="22" height="32" />
        <rect class="pdf" x="41" y="8" width="16" height="22" />
        <path class="text" d="M43.5 12h10M43.5 15.5h11M43.5 19h8" />
      </svg>
      <span class="choice-title">Read on the side</span>
      <span class="choice-text">Opens in the reference panel. Snip parts of it into your notes.</span>
    </button>

    <div class="choice write">
      <button class="choice-head" onclick={write}>
        <span class="art-wrap">{@render sheet(layout, true)}</span>
        <span class="choice-title">Write on it</span>
        <span class="choice-text">Every page of it becomes a page you can write on.</span>
      </button>
      <div class="options">
        <div class="seg layouts" role="radiogroup" aria-label="Layout">
          {#each PDF_LAYOUTS as item (item.id)}
            <button
              class="seg-btn"
              class:active={layout === item.id}
              role="radio"
              aria-checked={layout === item.id}
              onclick={() => (layout = item.id)}>
              {@render sheet(item.id, false)}
              <span>{item.label}</span>
            </button>
          {/each}
        </div>
        {#if $notebookOpen}
          <div class="seg" role="radiogroup" aria-label="Where the pages go">
            <button class="seg-btn wide" class:active={target === 'new'} role="radio" aria-checked={target === 'new'} onclick={() => (target = 'new')}>
              New notebook
            </button>
            <button
              class="seg-btn wide"
              class:active={target === 'append'}
              role="radio"
              aria-checked={target === 'append'}
              title="After the last page of the notebook that is open"
              onclick={() => (target = 'append')}>
              This notebook
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#snippet footer()}
    <label class="remember" title="Change it again in Preferences, General">
      <input type="checkbox" bind:checked={remember} />
      Always do this
    </label>
    <button class="dialog-btn" onclick={onclose}>Cancel</button>
  {/snippet}
</Dialog>

<style>
  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 18px 14px 16px;
    text-align: center;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }

  button.choice:hover,
  .choice-head:hover {
    color: var(--text-primary);
  }

  button.choice:hover,
  .write:has(.choice-head:hover) {
    border-color: var(--accent);
    background: var(--bg-hover);
  }

  .write {
    justify-content: flex-start;
    padding: 0;
    gap: 0;
  }

  .choice-head {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 14px 12px;
    color: var(--text-secondary);
  }

  .art,
  .art-wrap {
    height: 56px;
    display: flex;
    align-items: center;
    margin-bottom: 4px;
  }

  .art {
    width: 90px;
  }

  .choice-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .choice-text {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text-muted);
    max-width: 200px;
  }

  .options {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 10px 10px;
  }

  .seg {
    display: flex;
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
  }

  .seg-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 5px 2px 4px;
    font-size: 10.5px;
    color: var(--text-muted);
    background: var(--bg-surface);
  }

  .seg-btn.wide {
    padding: 6px 4px;
    font-size: 11px;
    white-space: nowrap;
  }

  .seg-btn:hover {
    color: var(--text-primary);
  }

  .seg-btn.active {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .sheet {
    width: 28px;
    height: 28px;
  }

  .sheet.big {
    width: 56px;
    height: 56px;
  }

  svg .paper {
    fill: #f4f4f5;
    stroke: none;
  }

  svg .pdf {
    fill: #c9d4e6;
  }

  svg .panel {
    fill: var(--bg-surface);
    stroke: var(--border);
  }

  svg .text {
    stroke: #5b6b86;
    stroke-width: 1.4;
  }

  svg .lines {
    stroke: #a9b6cc;
    stroke-width: 0.8;
  }

  .seg-btn.active .pdf,
  .choice-head .pdf {
    fill: #e8c9a8;
  }

  .seg-btn.active .text,
  .choice-head .text {
    stroke: #8a5a2c;
  }

  .remember {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: auto;
    font-size: 11.5px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .remember input {
    accent-color: var(--accent);
  }

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
</style>
