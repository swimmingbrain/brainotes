<script lang="ts">
  import { tick } from 'svelte';
  import { commandPaletteOpen } from '$lib/stores/app';
  import type { Command } from '$lib/editor/commands';
  import Icon from './Icon.svelte';

  let { commands = [] }: { commands?: Command[] } = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);
  let resultsEl = $state<HTMLDivElement | null>(null);

  const filtered = $derived.by(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return commands;
    return commands.filter(
      (cmd) => cmd.label.toLowerCase().includes(lower) || (cmd.category?.toLowerCase().includes(lower) ?? false)
    );
  });

  // the palette is only in the dom while it is open, so the field has to be
  // given the keyboard every time it appears, not once on mount
  $effect(() => {
    if ($commandPaletteOpen) void focusInput();
  });

  async function focusInput() {
    await tick();
    inputEl?.focus();
  }

  function close() {
    commandPaletteOpen.set(false);
    query = '';
    selectedIndex = 0;
  }

  function run(cmd: Command) {
    close();
    cmd.action();
  }

  // arrowing past the bottom of the list has to bring the row into view,
  // otherwise the selection walks off screen
  function move(step: number) {
    selectedIndex = (selectedIndex + step + filtered.length) % filtered.length;
    resultsEl?.children[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function onkeydown(e: KeyboardEvent) {
    // the input and the backdrop share this handler, the key must not reach
    // both or enter runs one command from the filtered list and another from
    // the full one
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length) move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length) move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[selectedIndex];
      if (cmd) run(cmd);
    }
  }
</script>

{#if $commandPaletteOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="backdrop" onclick={close} {onkeydown}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="palette" onclick={(e) => e.stopPropagation()}>
      <div class="search-row">
        <span class="search-icon"><Icon name="search" size={14} /></span>
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={() => (selectedIndex = 0)}
          placeholder="Type a command..."
          class="search-input"
          spellcheck="false"
          aria-label="Command"
          {onkeydown} />
      </div>

      <div class="results" bind:this={resultsEl}>
        {#if filtered.length === 0}
          <div class="no-results">No matching commands</div>
        {:else}
          {#each filtered as cmd, i (cmd.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="result-item"
              class:selected={i === selectedIndex}
              onclick={() => run(cmd)}
              onmouseenter={() => (selectedIndex = i)}>
              <span class="result-label">{cmd.label}</span>
              {#if cmd.shortcut}
                <span class="result-shortcut">
                  {#each cmd.shortcut.split(/\+(?=.)/) as key, k (k)}
                    <kbd>{key}</kbd>
                  {/each}
                </span>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    justify-content: center;
    padding: 15vh 16px 16px;
    background: rgba(0, 0, 0, 0.5);
  }

  .palette {
    width: 480px;
    max-width: 100%;
    max-height: 360px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: fade-in 100ms ease;
    align-self: flex-start;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }

  .search-icon {
    display: flex;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .search-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-ui);
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .results {
    overflow-y: auto;
    padding: 4px;
  }

  .result-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 10px;
    cursor: pointer;
  }

  .result-item.selected {
    background: var(--bg-hover);
  }

  .result-label {
    min-width: 0;
    font-size: 12.5px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-shortcut {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .no-results {
    padding: 14px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
