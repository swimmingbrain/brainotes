<script lang="ts">
  import Logo from './Logo.svelte';
  import Icon from './Icon.svelte';
  import Menu from './Menu.svelte';
  import { actions } from '$lib/editor/actions';
  import { renameNotebook } from '$lib/editor/commands';
  import { presenting, togglePresent } from '$lib/editor/present';
  import {
    commandPaletteOpen,
    dialog,
    history,
    notebookKind,
    notebookName,
    notebookOpen,
    saveState,
    setWorkspace,
    showLeftTab,
    starting,
    workspace,
    WORKSPACES,
    type MenuItem
  } from '$lib/stores/app';

  const saveTitles: Record<string, string> = {
    saved: 'Saved in this browser',
    saving: 'Saving...',
    failed: 'Could not save, the browser storage may be full'
  };

  // a whiteboard calls its pages boards
  const exportItems: MenuItem[] = $derived.by(() => {
    const page = $notebookKind === 'board' ? 'board' : 'page';
    return [
      { label: `PDF, all ${page}s`, action: () => actions.exportNotebook('pdf', 'all') },
      { label: `PDF, this ${page}`, action: () => actions.exportNotebook('pdf', 'page') },
      { label: `PNG, this ${page}`, action: () => actions.exportNotebook('png', 'page') },
      { separator: true, label: '' },
      { label: '.brainotes file', action: () => actions.exportNotebook('brainotes') }
    ];
  });
</script>

<div class="topbar">
  <div class="topbar-left">
    <div class="logo" title="braiNOTES">
      <span class="logo-icon"><Logo size={20} /></span>
      <span class="logo-text">braiNOTES</span>
    </div>
    <span class="separator"></span>
    {#if $notebookOpen}
      <div class="file-info">
        <button class="filename" onclick={renameNotebook} title="Rename the notebook">{$notebookName}</button>
        <span
          class="save-dot"
          class:saving={$saveState === 'saving'}
          class:failed={$saveState === 'failed'}
          title={saveTitles[$saveState]}></span>
      </div>
    {:else if !$starting}
      <span class="filename muted">No notebook</span>
    {/if}
  </div>

  <div class="workspaces">
    {#each WORKSPACES as ws (ws.id)}
      <button
        class="tool-btn"
        class:active={$workspace === ws.id}
        title="{ws.label} ({ws.shortcut})"
        onclick={() => setWorkspace(ws.id)}>
        {ws.label}
      </button>
    {/each}
  </div>

  <div class="topbar-actions">
    <!-- with nothing open the start screen is the library -->
    <button
      class="action-btn"
      onclick={() => showLeftTab('notebooks')}
      disabled={!$notebookOpen}
      title="Your notebooks in this browser">
      <Icon name="library" size={14} />
      <span>Library</span>
    </button>
    <button class="action-btn" onclick={() => actions.importFiles()} title="Import a PDF or images (Ctrl+O)">
      <Icon name="import" size={14} />
      <span>Import</span>
    </button>
    <span class="separator"></span>
    <button
      class="action-btn icon-only"
      onclick={() => actions.undo()}
      disabled={!$history.canUndo}
      title="Undo (Ctrl+Z)"
      aria-label="Undo">
      <Icon name="undo" size={14} />
    </button>
    <button
      class="action-btn icon-only"
      onclick={() => actions.redo()}
      disabled={!$history.canRedo}
      title="Redo (Ctrl+Shift+Z)"
      aria-label="Redo">
      <Icon name="redo" size={14} />
    </button>
    <span class="separator"></span>
    <button
      class="action-btn icon-only"
      onclick={() => commandPaletteOpen.set(true)}
      title="Command palette (Ctrl+K)"
      aria-label="Command palette">
      <Icon name="command" size={14} />
    </button>
    <button
      class="action-btn icon-only"
      onclick={() => dialog.set({ kind: 'preferences' })}
      title="Preferences (Ctrl+,)"
      aria-label="Preferences">
      <Icon name="gear" size={14} />
    </button>
    <button
      class="action-btn icon-only"
      class:on={$presenting}
      onclick={togglePresent}
      title="Present in fullscreen (Ctrl+Shift+F)"
      aria-label="Present">
      <Icon name="fullscreen" size={14} />
    </button>
    <a
      class="action-btn icon-only"
      href="https://github.com/swimmingbrain/brainotes"
      target="_blank"
      rel="noopener"
      title="GitHub"
      aria-label="GitHub">
      <Icon name="github" size={14} />
    </a>
    <Menu items={exportItems}>
      {#snippet trigger({ toggle })}
        <button class="action-btn accent" onclick={toggle} disabled={!$notebookOpen} title="Export the notebook">
          <Icon name="export" size={14} />
          <span>Export</span>
        </button>
      {/snippet}
    </Menu>
  </div>
</div>

<style>
  .topbar {
    height: var(--topbar-h);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    flex-shrink: 0;
    gap: 10px;
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    user-select: none;
  }

  .logo-icon {
    display: flex;
    align-items: center;
    color: var(--accent);
  }

  .logo-text {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 16px;
    color: var(--text-primary);
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .filename {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-editor);
    padding: 1px 4px;
  }

  .filename:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .filename.muted,
  .filename.muted:hover {
    background: none;
    color: var(--text-muted);
    cursor: default;
  }

  .save-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--success);
  }

  .save-dot.saving {
    background: var(--accent);
    animation: pulse 1.5s infinite;
  }

  .save-dot.failed {
    background: var(--error);
  }

  .workspaces {
    display: flex;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px 10px;
    color: var(--text-secondary);
    font-size: 11.5px;
  }

  .tool-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tool-btn.active {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    flex: 1;
    justify-content: flex-end;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-secondary);
    text-decoration: none;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .action-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .action-btn.on {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .action-btn.accent {
    background: var(--accent);
    color: #111;
  }

  .action-btn.accent:hover:not(:disabled) {
    background: var(--accent-hover);
    color: #111;
  }

  .action-btn.icon-only {
    padding: 5px 7px;
  }

  .separator {
    width: 1px;
    height: 16px;
    background: var(--border);
    margin: 0 3px;
    flex-shrink: 0;
  }

  /* the labels are the first thing to go on a narrow window, the icons carry
     the meaning on their own */
  .action-btn span {
    display: none;
  }

  @media (min-width: 768px) {
    .action-btn span {
      display: inline;
    }
  }

  @media (max-width: 600px) {
    .logo-text {
      display: none;
    }

    .workspaces {
      display: none;
    }
  }
</style>
