<script lang="ts">
  import ColorField from '../../ColorField.svelte';
  import Icon from '../../Icon.svelte';
  import NumberField from '../../NumberField.svelte';
  import SelectField from '../../SelectField.svelte';
  import { newPenId, PEN_TYPE_OPTIONS } from '$lib/editor/pens';
  import { preferences, setPreference, type PenPreset, type PenType } from '$lib/stores/preferences';

  function updatePen(id: string, change: Partial<PenPreset>) {
    preferences.update((p) => ({ ...p, pens: p.pens.map((pen) => (pen.id === id ? { ...pen, ...change } : pen)) }));
  }

  // a highlighter is far wider than a pen, so switching the type brings the
  // size along to something that makes sense for it
  function setType(pen: PenPreset, type: PenType) {
    if (type === pen.type) return;
    let size = pen.size;
    if (type === 'highlighter' && size < 6) size = 18;
    if (pen.type === 'highlighter' && type !== 'highlighter' && size > 12) size = 2.5;
    updatePen(pen.id, { type, size });
  }

  function addPen() {
    const pen: PenPreset = { id: newPenId(), type: 'ballpoint', color: '#1f1f22', size: 2.5 };
    preferences.update((p) => ({ ...p, pens: [...p.pens, pen] }));
  }

  function removePen(id: string) {
    preferences.update((p) => {
      const pens = p.pens.filter((pen) => pen.id !== id);
      if (pens.length === 0) return p;
      const defaultPen = p.defaultPen === id ? pens[0].id : p.defaultPen;
      return { ...p, pens, defaultPen };
    });
  }
</script>

<h3 class="section">Favourite pens</h3>
<div class="pens">
  <div class="row head">
    <span class="col-default">default</span>
    <span class="col-type">type</span>
    <span class="col-color">color</span>
    <span class="col-size">size</span>
    <span class="col-remove"></span>
  </div>
  {#each $preferences.pens as pen (pen.id)}
    <div class="row">
      <span class="col-default">
        <button
          class="pick"
          class:on={$preferences.defaultPen === pen.id}
          role="radio"
          aria-checked={$preferences.defaultPen === pen.id}
          aria-label="Make this the default pen"
          title="Default pen"
          onclick={() => setPreference('defaultPen', pen.id)}></button>
      </span>
      <span class="col-type">
        <SelectField value={pen.type} options={PEN_TYPE_OPTIONS} label="Pen type" onchange={(v) => setType(pen, v as PenType)} />
      </span>
      <span class="col-color">
        <ColorField value={pen.color} label="Pen color" onchange={(color) => updatePen(pen.id, { color })} />
      </span>
      <span class="col-size">
        <NumberField
          value={pen.size}
          min={0.5}
          max={40}
          step={0.5}
          precision={1}
          label="Pen size"
          onchange={(size) => updatePen(pen.id, { size })} />
      </span>
      <span class="col-remove">
        <button
          class="remove"
          disabled={$preferences.pens.length === 1}
          onclick={() => removePen(pen.id)}
          title="Remove this pen"
          aria-label="Remove this pen">
          <Icon name="trash" size={13} />
        </button>
      </span>
    </div>
  {/each}
  <button class="add" onclick={addPen}>
    <Icon name="plus" size={13} />
    Add pen
  </button>
</div>
<p class="help">
  These are the chips in the options bar. The default pen is the one in your hand when the app opens.
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

  .pens {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 8px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 26px;
  }

  .row.head {
    min-height: 18px;
    font-family: var(--font-editor);
    font-size: 10px;
    color: var(--text-muted);
  }

  .col-default {
    width: 44px;
    display: flex;
    justify-content: center;
    flex-shrink: 0;
  }

  .col-type {
    width: 110px;
    flex-shrink: 0;
  }

  .col-color {
    flex: 1;
    min-width: 0;
  }

  .col-size {
    width: 56px;
    flex-shrink: 0;
  }

  .col-remove {
    width: 22px;
    flex-shrink: 0;
  }

  .pick {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid var(--text-muted);
  }

  .pick:hover {
    border-color: var(--accent);
  }

  .pick.on {
    border-color: var(--accent);
    background: radial-gradient(circle, var(--accent) 3px, transparent 3.5px);
  }

  .remove {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .remove:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--error);
  }

  .remove:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .add {
    display: flex;
    align-items: center;
    gap: 5px;
    align-self: flex-start;
    margin: 6px 0 0 52px;
    padding: 5px 10px;
    font-size: 11.5px;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .add:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .help {
    padding: 10px 8px 6px 60px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }
</style>
