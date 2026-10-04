<script lang="ts" module>
  // 16px grid, 1.5 stroke, round caps, shapes that read better solid override the stroke
  const paths: Record<string, string> = {
    select: '<path d="M4 2.5v9.2l2.4-2.3 1.6 3.6 1.9-.9-1.6-3.5h3.3z"/>',
    lasso: '<path d="M5.2 12C3.2 11.3 2 9.8 2 8c0-2.8 2.7-5 6-5s6 2.2 6 5-2.7 5-6 5c-.9 0-1.7-.2-2.5-.4"/><path d="M5.4 12.3c-.9.5-1.2 1.3-.7 2.2"/>',
    pen: '<path d="M11.5 2.5 13.5 4.5 5.5 12.5 2.5 13.5 3.5 10.5z"/><path d="M9.8 4.2 11.8 6.2"/>',
    highlighter: '<path d="M10.2 2.2 13.8 5.8 9.3 10.3 5.7 6.7z"/><path d="M5.7 6.7 4.4 10.4l1.2 1.2 3.7-1.3"/><path d="M2.5 14h5"/>',
    eraser: '<path d="M9.6 2.5 13.5 6.4 6.4 13.5 2.5 9.6z"/><path d="M5.5 6.6 9.4 10.5"/><path d="M6.4 13.5h7"/>',
    shape: '<rect x="2" y="7.5" width="6.5" height="6.5" rx="1"/><circle cx="10.8" cy="5.2" r="3.2"/>',
    snip: '<path d="M4.5 1.8v9.7h9.7"/><path d="M1.8 4.5h9.7v9.7"/>',
    laser: '<circle cx="4.5" cy="11.5" r="2.2" fill="currentColor" stroke="none"/><circle cx="8.2" cy="7.8" r="1.2" fill="currentColor" stroke="none"/><circle cx="10.9" cy="5.1" r=".9" fill="currentColor" stroke="none"/><circle cx="13.2" cy="2.8" r=".6" fill="currentColor" stroke="none"/>',
    hand: '<path d="M5.6 8V4.3a1.1 1.1 0 0 1 2.2 0v3.1V3.3a1.1 1.1 0 0 1 2.2 0v4.1V4.7a1.1 1.1 0 0 1 2.2 0v4.8c0 2.2-1.7 4-3.9 4-2 0-3-1-4.1-2.8L3.1 9.3a1.1 1.1 0 0 1 1.7-1.4z"/>',
    text: '<path d="M3 4.4V3h10v1.4M8 3v10M6 13h4"/>',
    line: '<path d="M3 13 13 3"/>',
    arrow: '<path d="M3 13 13 3M7 3h6v6"/>',
    rect: '<rect x="2" y="3.5" width="12" height="9" rx="1"/>',
    ellipse: '<ellipse cx="8" cy="8" rx="6" ry="4.6"/>',
    page: '<path d="M3.5 2.5a1 1 0 0 1 1-1h5l3 3v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z"/><path d="M9.5 1.5v3h3"/>',
    notebook: '<rect x="4" y="1.8" width="9.5" height="12.4" rx="1"/><path d="M7 1.8v12.4M2.5 4.5h3M2.5 8h3M2.5 11.5h3"/>',
    board: '<rect x="1.8" y="2.2" width="12.4" height="8.6" rx="1"/><path d="M5.2 14 6.6 10.8M10.8 14 9.4 10.8M4.5 5.5h4M4.5 7.8h6"/>',
    pdf: '<path d="M3.5 2.5a1 1 0 0 1 1-1h5l3 3v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z"/><path d="M9.5 1.5v3h3"/><path d="M6.3 12V7.2h1.6a1.4 1.4 0 0 1 0 2.8H6.3"/>',
    library: '<path d="M2.8 2.5v11M5.6 4.5v9M8.4 3.5v10M10.6 3.9l2.6 9.6"/>',
    blank: '<rect x="2.5" y="2" width="11" height="12" rx="1"/>',
    lines: '<rect x="2.5" y="2" width="11" height="12" rx="1"/><path d="M5 5.5h6M5 8h6M5 10.5h6"/>',
    grid: '<rect x="2.5" y="2" width="11" height="12" rx="1"/><path d="M6.2 2v12M9.8 2v12M2.5 6h11M2.5 10h11"/>',
    dots: '<rect x="2.5" y="2" width="11" height="12" rx="1"/><circle cx="6.2" cy="6" r=".9" fill="currentColor" stroke="none"/><circle cx="9.8" cy="6" r=".9" fill="currentColor" stroke="none"/><circle cx="6.2" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="9.8" cy="10" r=".9" fill="currentColor" stroke="none"/>',
    panelLeft: '<rect x="1.8" y="2.5" width="12.4" height="11" rx="1"/><path d="M6 2.5v11"/>',
    panelRight: '<rect x="1.8" y="2.5" width="12.4" height="11" rx="1"/><path d="M10 2.5v11"/>',
    zoomIn: '<circle cx="7" cy="7" r="4.4"/><path d="M10.2 10.2 13.8 13.8M5.2 7h3.6M7 5.2v3.6"/>',
    zoomOut: '<circle cx="7" cy="7" r="4.4"/><path d="M10.2 10.2 13.8 13.8M5.2 7h3.6"/>',
    fullscreen: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
    command: '<path d="M10 4v8a2 2 0 1 0 2-2H4a2 2 0 1 0 2 2V4a2 2 0 1 0-2 2h8a2 2 0 1 0-2-2"/>',
    link: '<path d="M6.5 9.5 9.5 6.5"/><path d="M7.5 4.8 9 3.3a2.6 2.6 0 0 1 3.7 3.7l-1.5 1.5M8.5 11.2 7 12.7A2.6 2.6 0 0 1 3.3 9l1.5-1.5"/>',
    eye: '<path d="M1.5 8S3.8 3.8 8 3.8 14.5 8 14.5 8 12.2 12.2 8 12.2 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/>',
    eyeOff: '<path d="M6.3 3.9A6.6 6.6 0 0 1 8 3.8c4.2 0 6.5 4.2 6.5 4.2a12 12 0 0 1-2 2.6M4.3 5.1A11.7 11.7 0 0 0 1.5 8s2.3 4.2 6.5 4.2c1 0 1.9-.2 2.6-.5"/><path d="M6.7 6.7a1.8 1.8 0 0 0 2.5 2.5"/><path d="M2.6 2.6 13.4 13.4"/>',
    lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
    unlock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/>',
    plus: '<path d="M8 3.5v9M3.5 8h9"/>',
    minus: '<path d="M3.5 8h9"/>',
    close: '<path d="M4 4 12 12M12 4 4 12"/>',
    chevronDown: '<path d="M4 6 8 10l4-4"/>',
    chevronUp: '<path d="M4 10 8 6l4 4"/>',
    chevronRight: '<path d="M6 4l4 4-4 4"/>',
    chevronLeft: '<path d="M10 4 6 8l4 4"/>',
    search: '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13.8 13.8"/>',
    folder: '<path d="M1.8 12.8v-9.6h4.2l1.5 2h6.7v7.6z"/>',
    image: '<rect x="1.8" y="3" width="12.4" height="10" rx="1"/><circle cx="5.6" cy="6.4" r="1.2"/><path d="M2 11.2 5.8 7.6l3 2.6 2.4-2 2.9 2.7"/>',
    gear: '<circle cx="8" cy="8" r="2.2"/><path d="M12.7 9.8a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 1 1-1.7 1.7l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.1a1.2 1.2 0 1 1-2.4 0v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 1 1-1.7-1.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6h-.1a1.2 1.2 0 1 1 0-2.4h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1.2 1.2 0 1 1 1.7-1.7l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9v-.1a1.2 1.2 0 1 1 2.4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 1 1 1.7 1.7l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6h.1a1.2 1.2 0 1 1 0 2.4h-.1a1 1 0 0 0-.9.6z"/>',
    export: '<path d="M8 10.5V2.5M5.2 5.3 8 2.5l2.8 2.8"/><path d="M2.8 10v3.5h10.4V10"/>',
    import: '<path d="M8 2.5v8M5.2 7.7 8 10.5l2.8-2.8"/><path d="M2.8 10v3.5h10.4V10"/>',
    save: '<path d="M2.5 3.5a1 1 0 0 1 1-1h7l3 3v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/><path d="M5 2.5v4h5.5v-4M4.5 13.5v-4h7v4"/>',
    undo: '<path d="M3 5.5h6.5a3.5 3.5 0 0 1 0 7H6"/><path d="M5.5 3 3 5.5 5.5 8"/>',
    redo: '<path d="M13 5.5H6.5a3.5 3.5 0 0 0 0 7H10"/><path d="M10.5 3 13 5.5 10.5 8"/>',
    camera: '<path d="M2 5.5h2.5l1-1.6h5l1 1.6H14v7.5H2z"/><circle cx="8" cy="9" r="2.4"/>',
    trash: '<path d="M2.5 4h11M6 4V2.8h4V4M4 4v9.2h8V4M6.5 6.5v4.5M9.5 6.5v4.5"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
    more: '<circle cx="3.4" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.6" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
    check: '<path d="M3 8.4 6.3 11.6 13 4.8"/>',
    warning: '<path d="M8 2.5 14.5 13.5h-13z"/><path d="M8 6.4v3.2M8 11.6v.4"/>',
    info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.4v4M8 4.8v.4"/>',
    palette: '<path d="M8 1.8a6.2 6.2 0 0 0 0 12.4c.9 0 1.4-.6 1.4-1.3 0-.4-.2-.7-.4-1-.2-.3-.4-.5-.4-.9 0-.6.5-1.1 1.1-1.1h1.3a3.2 3.2 0 0 0 3.2-3.2c0-2.8-2.8-4.9-6.2-4.9z"/><circle cx="5.2" cy="6.2" r=".9" fill="currentColor" stroke="none"/><circle cx="8" cy="4.6" r=".9" fill="currentColor" stroke="none"/><circle cx="10.9" cy="6" r=".9" fill="currentColor" stroke="none"/>',
    github: '<path fill="currentColor" stroke="none" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>'
  };
</script>

<script lang="ts">
  let { name, size = 16 }: { name: string; size?: number } = $props();

  const markup = $derived(paths[name] ?? '');
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false">{@html markup}</svg>

<style>
  svg {
    display: block;
    flex-shrink: 0;
  }
</style>
