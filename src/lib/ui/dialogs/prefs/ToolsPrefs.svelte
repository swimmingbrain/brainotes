<script lang="ts">
  import Field from '../../Field.svelte';
  import Icon from '../../Icon.svelte';
  import ToggleField from '../../ToggleField.svelte';
  import { tools, type ToolId } from '$lib/editor/tools';
  import { preferences } from '$lib/stores/preferences';

  const shownCount = $derived(tools.filter((tool) => $preferences.tools[tool.id]).length);

  function setTool(id: ToolId, on: boolean) {
    preferences.update((p) => ({ ...p, tools: { ...p.tools, [id]: on } }));
  }
</script>

<h3 class="section">Tool rail</h3>
{#each tools as tool (tool.id)}
  <Field label={tool.label}>
    {#snippet before()}
      <Icon name={tool.icon} size={14} />
    {/snippet}
    <div class="control">
      <ToggleField
        value={$preferences.tools[tool.id]}
        label="Show {tool.label}"
        disabled={$preferences.tools[tool.id] && shownCount === 1}
        onchange={(v) => setTool(tool.id, v)} />
      <kbd>{tool.shortcut}</kbd>
    </div>
  </Field>
{/each}
<p class="help">A hidden tool leaves the rail and its key does nothing. Holding space still gives the hand.</p>

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

  .control {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .help {
    padding: 6px 8px 6px 144px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }
</style>
