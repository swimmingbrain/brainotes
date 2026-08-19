<script lang="ts">
  import Field from '../../Field.svelte';
  import SelectField from '../../SelectField.svelte';
  import { preferences, setPreference, type Preferences } from '$lib/stores/preferences';

  const workspaces = [
    { value: 'notes', label: 'Notes' },
    { value: 'study', label: 'Study' },
    { value: 'board', label: 'Board' }
  ];

  const pdfChoices = [
    { value: 'ask', label: 'Ask every time' },
    { value: 'reference', label: 'Read it on the side' },
    { value: 'notebook', label: 'Write on it' }
  ];
</script>

<h3 class="section">Start</h3>
<Field label="Workspace">
  <SelectField
    value={$preferences.workspace}
    options={workspaces}
    label="Default workspace"
    onchange={(v) => setPreference('workspace', v as Preferences['workspace'])} />
</Field>
<p class="help">The workspace the app opens in. Ctrl+1, 2 and 3 switch between them at any time.</p>

<h3 class="section">PDFs</h3>
<Field label="Dropped PDF">
  <SelectField
    value={$preferences.pdfDrop}
    options={pdfChoices}
    label="What a dropped pdf does"
    onchange={(v) => setPreference('pdfDrop', v as Preferences['pdfDrop'])} />
</Field>
<p class="help">
  Read it on the side opens the pdf in the reference panel, next to your notes. Write on it turns it into a notebook with the pdf pages
  as paper.
</p>

<style>
  .section {
    margin: 12px 8px 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    padding-bottom: 4px;
  }

  .section:first-child {
    margin-top: 0;
  }

  .help {
    padding: 0 8px 6px 124px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }
</style>
