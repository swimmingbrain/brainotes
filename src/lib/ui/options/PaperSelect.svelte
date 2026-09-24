<script lang="ts">
  import Icon from '../Icon.svelte';
  import Menu from '../Menu.svelte';
  import { actions } from '$lib/editor/actions';
  import { PAPER_STYLES } from '$lib/editor/commands';
  import { PAPER_COLORS } from '$lib/editor/paper';
  import { addToast, paperColor, paperStyle, type MenuItem } from '$lib/stores/app';
  import { preferences, type PaperColor } from '$lib/stores/preferences';

  function makeDefault() {
    const style = $paperStyle;
    const color = $paperColor;
    preferences.update((p) => ({ ...p, paper: { ...p.paper, style, color } }));
    addToast(`New pages start on ${PAPER_COLORS[color].label.toLowerCase()} ${style} paper`, 'success');
  }

  // the color of the page on screen, dark is the blackboard
  const items = $derived<MenuItem[]>([
    ...(Object.keys(PAPER_COLORS) as PaperColor[]).map((color) => ({
      label: PAPER_COLORS[color].label,
      checked: $paperColor === color,
      action: () => actions.setPaperColor(color)
    })),
    { separator: true, label: '' },
    {
      label: 'Make default paper',
      checked: $preferences.paper.style === $paperStyle && $preferences.paper.color === $paperColor,
      action: makeDefault
    }
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
