<script lang="ts">
  import Field from '../../Field.svelte';
  import Icon from '../../Icon.svelte';
  import SelectField from '../../SelectField.svelte';
  import Slider from '../../Slider.svelte';
  import { PAPER_STYLES } from '$lib/editor/commands';
  import { PAGE_SIZES, PAPER_COLORS, paperPattern } from '$lib/editor/paper';
  import { preferences, setPaper, type PageSize, type PaperColor } from '$lib/stores/preferences';

  const colors = Object.entries(PAPER_COLORS) as [PaperColor, (typeof PAPER_COLORS)[PaperColor]][];
  const sizes = (Object.entries(PAGE_SIZES) as [PageSize, { label: string }][]).map(([value, size]) => ({
    value,
    label: value === 'wide' ? '16:9 (slides)' : size.label
  }));

  const paper = $derived($preferences.paper);
  // the preview shows the paper at half size, like a page seen from a step back
  const preview = $derived(paperPattern(paper.style, paper.color, paper.spacing / 2));
</script>

<h3 class="section">New notebooks</h3>
<Field label="Style">
  <div class="segments" role="radiogroup" aria-label="Paper style">
    {#each PAPER_STYLES as style (style.id)}
      <button
        class="segment"
        class:active={paper.style === style.id}
        role="radio"
        aria-checked={paper.style === style.id}
        onclick={() => setPaper('style', style.id)}>
        <Icon name={style.id} size={13} />
        {style.label}
      </button>
    {/each}
  </div>
</Field>
<Field label="Spacing">
  <Slider value={paper.spacing} min={12} max={48} step={2} precision={0} unit=" px" label="Line spacing" onchange={(v) => setPaper('spacing', v)} />
</Field>
<Field label="Paper color">
  <div class="segments" role="radiogroup" aria-label="Paper color">
    {#each colors as [id, color] (id)}
      <button
        class="segment"
        class:active={paper.color === id}
        role="radio"
        aria-checked={paper.color === id}
        onclick={() => setPaper('color', id)}>
        <span class="chip" style="background: {color.paper}"></span>
        {color.label}
      </button>
    {/each}
  </div>
</Field>
<Field label="Page size">
  <SelectField value={paper.size} options={sizes} label="Page size" onchange={(v) => setPaper('size', v as PageSize)} />
</Field>
<div class="preview" style="background: {preview}" aria-hidden="true"></div>
<p class="help">
  New notebooks start on this paper, a new page takes the paper of the page you are on. The options bar changes that
  page, dark paper turns it into a blackboard.
</p>

<style>
  .section {
    margin: 0 8px 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    padding-bottom: 4px;
  }

  .segments {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  .segment {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px;
    font-size: 11.5px;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .segment:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .segment.active {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
  }

  .chip {
    width: 10px;
    height: 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .preview {
    height: 64px;
    margin: 8px 8px 4px 124px;
    border: 1px solid var(--border);
  }

  .help {
    padding: 2px 8px 6px 124px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }
</style>
