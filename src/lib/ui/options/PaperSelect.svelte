<script lang="ts">
  import Icon from '../Icon.svelte';
  import Menu from '../Menu.svelte';
  import { actions } from '$lib/editor/actions';
  import { PAPER_STYLES } from '$lib/editor/commands';
  import { addToast, paperStyle, type MenuItem } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';

  function makeDefault() {
    const style = $paperStyle;
    preferences.update((p) => ({ ...p, paper: { ...p.paper, style } }));
    addToast(`New pages start on ${style} paper`, 'success');
  }

  const items = $derived<MenuItem[]>([
    { label: 'Make default paper', checked: $preferences.paper.style === $paperStyle, action: makeDefault }
  ]);
</script>

<div class="paper" role="radiogroup" aria-label="Paper">
  {#each PAPER_STYLES as style (style.id)}
    <button
      class="icon-btn"
      class:active={$paperStyle === style.id}
      role="radio"
      aria-checked={$paperStyle === style.id}
      title="{style.label} paper"
      aria-label="{style.label} paper"
      onclick={() => actions.setPaperStyle(style.id)}>
      <Icon name={style.id} size={14} />
    </button>
  {/each}
  <Menu {items}>
    {#snippet trigger({ toggle })}
      <button class="icon-btn narrow" onclick={toggle} title="Paper options" aria-label="Paper options">
        <Icon name="chevronDown" size={12} />
      </button>
    {/snippet}
  </Menu>
</div>

<style>
  .paper {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--text-secondary);
  }

  .icon-btn.narrow {
    width: 16px;
    color: var(--text-muted);
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .icon-btn.active {
    background: var(--accent-dim);
    color: var(--accent);
  }
</style>
