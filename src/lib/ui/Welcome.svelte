<script lang="ts">
  import Logo from './Logo.svelte';
  import Icon from './Icon.svelte';
  import { actions } from '$lib/editor/actions';
  import { countPages, timeAgo } from '$lib/format';
  import { library } from '$lib/stores/app';

  const recents = $derived([...$library].sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 6));
</script>

<div class="welcome-state">
  <div class="welcome-content">
    <div class="welcome-icon"><Logo size={44} /></div>
    <h1 class="welcome-title">braiNOTES</h1>
    <p class="welcome-desc">Write by hand, keep the pdf next to your notes. Everything stays in this browser.</p>

    <div class="welcome-actions">
      <button class="welcome-btn primary" onclick={() => actions.newNotebook('paper')}>
        <Icon name="plus" size={14} />
        New notebook
      </button>
      <button class="welcome-btn secondary" onclick={() => actions.newNotebook('board')}>
        <Icon name="board" size={14} />
        New whiteboard
      </button>
      <button class="welcome-btn secondary" onclick={() => actions.importFiles()}>
        <Icon name="pdf" size={14} />
        Open PDF
      </button>
    </div>

    {#if recents.length > 0}
      <div class="recents">
        <h2 class="recents-heading">Recent</h2>
        {#each recents as recent (recent.id)}
          <button class="recent" onclick={() => actions.openNotebook(recent.id)}>
            <Icon name={recent.kind === 'board' ? 'board' : 'notebook'} size={14} />
            <span class="recent-name">{recent.name}</span>
            <span class="recent-when">{countPages(recent.pageCount, recent.kind)} &middot; {timeAgo(recent.modifiedAt)}</span>
          </button>
        {/each}
      </div>
    {/if}

    <p class="welcome-hint">or drop a pdf or an image anywhere</p>
  </div>
</div>

<style>
  .welcome-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    padding: 32px 20px;
    background: var(--bg-deep);
  }

  .welcome-content {
    text-align: center;
    max-width: 560px;
    width: 100%;
  }

  .welcome-icon {
    margin: 0 auto 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
  }

  .welcome-title {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 26px;
    font-weight: 400;
    color: var(--text-primary);
    margin-bottom: 6px;
  }

  .welcome-desc {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.6;
    margin-bottom: 24px;
  }

  .welcome-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }

  .welcome-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
  }

  .welcome-btn.primary {
    background: var(--accent);
    color: #111;
  }

  .welcome-btn.primary:hover {
    background: var(--accent-hover);
  }

  .welcome-btn.secondary {
    background: var(--bg-surface);
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .welcome-btn.secondary:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .recents {
    text-align: left;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    margin-bottom: 20px;
  }

  .recents-heading {
    font-size: 10px;
    font-weight: 500;
    font-family: var(--font-editor);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }

  .recent {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    font-size: 12px;
    color: var(--text-secondary);
    text-align: left;
  }

  .recent:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .recent-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-when {
    font-family: var(--font-editor);
    font-size: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .welcome-hint {
    font-size: 11px;
    font-family: var(--font-editor);
    color: var(--text-muted);
  }
</style>
