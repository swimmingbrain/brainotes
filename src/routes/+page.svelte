<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from '$lib/ui/TopBar.svelte';
  import OptionsBar from '$lib/ui/OptionsBar.svelte';
  import ToolRail from '$lib/ui/ToolRail.svelte';
  import LeftPanel from '$lib/ui/LeftPanel.svelte';
  import CanvasArea from '$lib/ui/CanvasArea.svelte';
  import RightPanel from '$lib/ui/RightPanel.svelte';
  import Resizer from '$lib/ui/Resizer.svelte';
  import StatusBar from '$lib/ui/StatusBar.svelte';
  import Welcome from '$lib/ui/Welcome.svelte';
  import CommandPalette from '$lib/ui/CommandPalette.svelte';
  import ContextMenu from '$lib/ui/ContextMenu.svelte';
  import Dialogs from '$lib/ui/Dialogs.svelte';
  import DropOverlay from '$lib/ui/DropOverlay.svelte';
  import { buildCommands } from '$lib/editor/commands';
  // these plug their actions in, the start screen needs them before any canvas
  import '$lib/editor/images';
  import '$lib/editor/references';
  import '$lib/editor/exports';
  import { installShortcuts } from '$lib/editor/shortcuts';
  import { startLibrary } from '$lib/editor/library';
  import { watchFullscreen } from '$lib/editor/present';
  import { MIN_LEFT, MIN_RIGHT, notebookName, notebookOpen, panels, starting, updatePanels } from '$lib/stores/app';
  import { preferences } from '$lib/stores/preferences';

  const RAIL = 34;
  const SPLITTER = 3;
  // the canvas is what this is all for, the panels give way before it does
  const MIN_CANVAS = 280;

  let mainWidth = $state(1200);

  const commands = $derived(buildCommands($preferences.tools));

  // what the panels can share once the rail and the splitters have their room
  const free = $derived(
    mainWidth - RAIL - ($panels.leftOpen ? SPLITTER : 0) - ($panels.rightOpen ? SPLITTER : 0)
  );
  const leftWidth = $derived.by(() => {
    if (!$panels.leftOpen) return 0;
    const max = free - MIN_CANVAS - ($panels.rightOpen ? MIN_RIGHT : 0);
    return Math.max(MIN_LEFT, Math.min($panels.leftWidth, max));
  });

  const rightWidth = $derived.by(() => {
    if (!$panels.rightOpen) return 0;
    const max = free - MIN_CANVAS - leftWidth;
    return Math.max(MIN_RIGHT, Math.min(Math.round($panels.rightShare * free), max));
  });

  function resizeLeft(delta: number) {
    const max = free - MIN_CANVAS - rightWidth;
    const next = Math.max(MIN_LEFT, Math.min(leftWidth + delta, max));
    updatePanels((p) => ({ ...p, leftWidth: next }));
  }

  // the splitter sits on the left edge of the reference panel, dragging it
  // left makes the panel wider
  function resizeRight(delta: number) {
    const max = free - MIN_CANVAS - leftWidth;
    const next = Math.max(MIN_RIGHT, Math.min(rightWidth - delta, max));
    if (free > 0) updatePanels((p) => ({ ...p, rightShare: next / free }));
  }

  onMount(() => {
    const removeShortcuts = installShortcuts();
    const removeFullscreen = watchFullscreen();
    const stopLibrary = startLibrary();
    return () => {
      stopLibrary();
      removeFullscreen();
      removeShortcuts();
    };
  });
</script>

<svelte:head>
  <title>{$notebookOpen ? `braiNOTES | ${$notebookName}` : 'braiNOTES'}</title>
</svelte:head>

<div class="app">
  <TopBar />

  {#if $notebookOpen}
    <OptionsBar />
    <main class="main-area" bind:clientWidth={mainWidth}>
      <ToolRail />

      {#if $panels.leftOpen}
        <div class="side" style="width: {leftWidth}px">
          <LeftPanel />
        </div>
        <Resizer onresize={resizeLeft} />
      {/if}

      <div class="canvas">
        <CanvasArea />
      </div>

      {#if $panels.rightOpen}
        <Resizer onresize={resizeRight} />
        <div class="side" style="width: {rightWidth}px">
          <RightPanel />
        </div>
      {/if}
    </main>
  {:else if $starting}
    <div class="main-area"></div>
  {:else}
    <Welcome />
  {/if}

  <StatusBar />
</div>

<CommandPalette {commands} />
<ContextMenu />
<Dialogs />
<DropOverlay />

<style>
  .app {
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
    overflow: hidden;
  }

  .main-area {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .side {
    flex-shrink: 0;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .canvas {
    flex: 1;
    min-width: 0;
    height: 100%;
  }
</style>
