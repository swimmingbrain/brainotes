<script lang="ts">
  import Icon from './Icon.svelte';
  import { actions } from '$lib/editor/actions';

  // enter/leave fire for every child the pointer crosses, a counter is the
  // only reliable way to know when the drag has actually left the window
  let depth = 0;
  let visible = $state(false);
  let overReference = $state(false);

  function hasFiles(e: DragEvent): boolean {
    const types = e.dataTransfer?.types;
    return types ? Array.from(types).includes('Files') : false;
  }

  function onReference(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('[data-drop="reference"]') !== null;
  }

  function ondragenter(e: DragEvent) {
    if (!hasFiles(e)) return;
    depth++;
    visible = true;
  }

  // every dragover over the window has to be answered, everywhere: the one
  // spot that forgets lets the browser open the dropped file and leave the
  // notes behind
  function ondragover(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    overReference = onReference(e.target);
  }

  function ondragleave(e: DragEvent) {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) visible = false;
  }

  function ondrop(e: DragEvent) {
    depth = 0;
    visible = false;
    if (!hasFiles(e) || !e.dataTransfer) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    if (onReference(e.target)) actions.openReference(files);
    else actions.importFiles(files, { x: e.clientX, y: e.clientY });
  }
</script>

<svelte:window {ondragenter} {ondragover} {ondragleave} {ondrop} />

{#if visible}
  <div class="drop-overlay" aria-hidden="true">
    <div class="drop-card">
      <Icon name={overReference ? 'pdf' : 'import'} size={28} />
      <span class="drop-title">{overReference ? 'Drop to read it on the side' : 'Drop to import'}</span>
      <span class="drop-hint">pdfs, images, .brainotes files</span>
    </div>
  </div>
{/if}

<style>
  /* purely visual: drops fall through to whatever sits under the pointer */
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 950;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(17, 17, 19, 0.7);
    pointer-events: none;
    animation: fade-in 100ms ease;
  }

  .drop-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 28px 40px;
    color: var(--accent);
    background: var(--bg-surface);
    border: 1px dashed var(--accent);
  }

  .drop-title {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 22px;
    color: var(--text-primary);
  }

  .drop-hint {
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
  }
</style>
