<script lang="ts">
  import { tick, untrack, type Snippet } from 'svelte';
  import type { MenuItem } from '$lib/stores/app';
  import Icon from './Icon.svelte';
  import Self from './Menu.svelte';

  // two shapes of the same list: hung under a trigger button (a menu bar
  // entry, a panel's "more" button) or dropped at a point (context menu).
  // one component so both keep the same keys, colors and submenu behaviour
  let {
    items,
    trigger,
    at = null,
    onclose,
    nested = false
  }: {
    items: MenuItem[];
    trigger?: Snippet<[{ open: boolean; toggle: () => void }]>;
    at?: { x: number; y: number } | null;
    onclose?: () => void;
    nested?: boolean;
  } = $props();

  let open = $state(untrack(() => at !== null));
  let panel = $state<HTMLDivElement | null>(null);
  let root = $state<HTMLDivElement | null>(null);
  let activeIndex = $state(-1);
  let openSubmenu = $state(-1);
  let pos = $state(untrack(() => ({ x: at?.x ?? 0, y: at?.y ?? 0 })));
  let anchorPos = $state<{ x: number; y: number } | null>(null);
  let subEl = $state<HTMLDivElement | null>(null);
  let subPos = $state<{ index: number; x: number; y: number } | null>(null);
  let scrolled = $state(0);

  const positioned = $derived(at !== null);
  // the placement is only used once it has been measured, so a submenu never
  // flashes at the wrong spot for a frame
  const subAt = $derived(subPos && subPos.index === openSubmenu ? subPos : null);

  // px of air kept between a menu and the edge of the window
  const MARGIN = 4;

  function selectable(item: MenuItem): boolean {
    return !item.separator && !item.disabled;
  }

  function close() {
    open = false;
    openSubmenu = -1;
    activeIndex = -1;
    anchorPos = null;
    onclose?.();
  }

  function toggle() {
    open = !open;
    if (open) anchorPos = null;
    else close();
  }

  function run(item: MenuItem, index: number) {
    if (!selectable(item)) return;
    if (item.children?.length) {
      openSubmenu = openSubmenu === index ? -1 : index;
      return;
    }
    close();
    item.action?.();
  }

  function move(step: number) {
    const count = items.length;
    let next = activeIndex;
    for (let i = 0; i < count; i++) {
      next = (next + step + count) % count;
      if (selectable(items[next])) break;
    }
    activeIndex = next;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'ArrowRight') {
      const item = items[activeIndex];
      if (item?.children?.length) {
        e.preventDefault();
        openSubmenu = activeIndex;
      }
    } else if (e.key === 'ArrowLeft' && nested) {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' || e.key === ' ') {
      const item = items[activeIndex];
      if (item) {
        e.preventDefault();
        run(item, activeIndex);
      }
    }
  }

  function onpointerdown(e: PointerEvent) {
    if (!open) return;
    const target = e.target as Node;
    if (root?.contains(target) || panel?.contains(target)) return;
    close();
  }

  // a menu that would hang off the screen is pulled back inside instead of
  // scrolling the page
  $effect(() => {
    if (!positioned || nested || !panel || !at) return;
    const rect = panel.getBoundingClientRect();
    const x = Math.max(MARGIN, Math.min(at.x, window.innerWidth - rect.width - MARGIN));
    const y = Math.max(MARGIN, Math.min(at.y, window.innerHeight - rect.height - MARGIN));
    if (x !== pos.x || y !== pos.y) pos = { x, y };
  });

  // a menu hung under a trigger near the bottom of a panel would lay itself
  // out below the window. it flips above the trigger when there is room there
  // and is pulled back inside on both axes when there is not. it is placed in
  // window coordinates because a panel that clips its content would otherwise
  // cut the menu down to a sliver
  $effect(() => {
    if (positioned || !open || !panel || !root) return;
    const trigger = root.getBoundingClientRect();
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    let x = Math.min(trigger.left, window.innerWidth - w - MARGIN);
    x = Math.max(MARGIN, x);
    let y = trigger.bottom;
    if (y + h > window.innerHeight - MARGIN) {
      y = trigger.top - h >= MARGIN ? trigger.top - h : Math.max(MARGIN, window.innerHeight - h - MARGIN);
    }
    const now = untrack(() => anchorPos);
    if (!now || now.x !== x || now.y !== y) anchorPos = { x, y };
  });

  // the same for a submenu: it opens to the right of its row, flips to the
  // left when that would run off the screen and slides up until it fits
  $effect(() => {
    const el = subEl;
    const index = openSubmenu;
    if (!el || index < 0) return;
    // the row moves with the menu around it, and with its scrolling
    void pos;
    void anchorPos;
    void scrolled;
    const row = el.parentElement?.getBoundingClientRect();
    if (!row) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = row.right - 3;
    if (x + w > window.innerWidth - MARGIN) x = row.left - w + 3;
    x = Math.max(MARGIN, Math.min(x, window.innerWidth - w - MARGIN));
    let y = row.top - MARGIN;
    if (y + h > window.innerHeight - MARGIN) y = window.innerHeight - h - MARGIN;
    y = Math.max(MARGIN, y);
    const now = untrack(() => subPos);
    if (!now || now.index !== index || now.x !== x || now.y !== y) subPos = { index, x, y };
  });

  $effect(() => {
    if (positioned) open = true;
  });

  // the list drives itself from the keyboard once it is up, but only the top
  // level takes focus: a submenu that opens on hover must not steal it. the
  // focus waits for the placement to reach the dom, because a menu that is
  // still hidden cannot take it and would leave escape and the arrows to
  // whatever opened it
  $effect(() => {
    if (!open || !panel || nested) return;
    if (!positioned && !anchorPos) return;
    const el = panel;
    void tick().then(() => {
      if (el.isConnected) el.focus();
    });
  });
</script>

<svelte:window onpointerdown={onpointerdown} />

{#if trigger}
  <div class="menu-root" bind:this={root}>
    {@render trigger({ open, toggle })}
    {#if open}
      <div
        class="menu anchored"
        class:placed={anchorPos !== null}
        bind:this={panel}
        style={anchorPos ? `left: ${anchorPos.x}px; top: ${anchorPos.y}px` : ''}
        role="menu"
        tabindex="-1"
        onscroll={() => scrolled++}
        {onkeydown}>
        {@render list()}
      </div>
    {/if}
  </div>
{:else if open}
  <div
    class="menu floating"
    class:nested
    bind:this={panel}
    style="left: {pos.x}px; top: {pos.y}px"
    role="menu"
    tabindex="-1"
    onscroll={() => scrolled++}
    {onkeydown}>
    {@render list()}
  </div>
{/if}

{#snippet list()}
  {#each items as item, i}
    {#if item.separator}
      <div class="menu-sep"></div>
    {:else}
      <div class="menu-row">
        <button
          class="menu-item"
          class:active={i === activeIndex}
          class:danger={item.danger}
          disabled={item.disabled}
          role="menuitem"
          onmouseenter={() => {
            activeIndex = i;
            openSubmenu = item.children?.length ? i : -1;
          }}
          onclick={() => run(item, i)}>
          <span class="check">
            {#if item.checked}<Icon name="check" size={12} />{/if}
          </span>
          <span class="label">{item.label}</span>
          {#if item.children?.length}
            <span class="arrow"><Icon name="chevronRight" size={12} /></span>
          {:else if item.shortcut}
            <span class="shortcut">{item.shortcut}</span>
          {/if}
        </button>
        {#if item.children?.length && openSubmenu === i}
          <div
            class="submenu"
            class:placed={subAt !== null}
            bind:this={subEl}
            style={subAt ? `left: ${subAt.x}px; top: ${subAt.y}px` : ''}>
            <Self items={item.children} at={{ x: 0, y: 0 }} nested onclose={close} />
          </div>
        {/if}
      </div>
    {/if}
  {/each}
{/snippet}

<style>
  .menu-root {
    position: relative;
    display: flex;
    align-items: center;
  }

  .menu {
    min-width: 180px;
    max-width: 320px;
    /* a list longer than the window scrolls instead of running off it */
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    padding: 3px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    animation: fade-in 80ms ease;
    outline: none;
  }

  /* fixed like the submenus, so a panel with hidden overflow cannot clip it */
  .menu.anchored {
    position: fixed;
    z-index: 900;
    visibility: hidden;
  }

  .menu.anchored.placed {
    visibility: visible;
  }

  .menu.floating {
    position: fixed;
    z-index: 1200;
  }

  /* a submenu sits inside its row, the row does the placing */
  .menu.nested {
    position: static;
  }

  .menu-row {
    position: relative;
  }

  /* fixed, so the row it hangs off can be scrolled or clipped and the
     submenu still lands where it fits in the window */
  .submenu {
    position: fixed;
    z-index: 1300;
    visibility: hidden;
  }

  .submenu.placed {
    visibility: visible;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 8px;
    font-size: 12px;
    color: var(--text-secondary);
    text-align: left;
  }

  .menu-item:hover:not(:disabled),
  .menu-item.active:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .menu-item:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .menu-item.danger {
    color: var(--error);
  }

  .check {
    width: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    flex-shrink: 0;
  }

  .label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .shortcut {
    font-family: var(--font-editor);
    font-size: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .arrow {
    display: flex;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .menu-sep {
    height: 1px;
    margin: 3px 6px;
    background: var(--border);
  }
</style>
