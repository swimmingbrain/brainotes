<script lang="ts">
  import { onMount } from 'svelte';
  import { penStats } from '$lib/engine/stats';
  import { preferences } from '$lib/stores/preferences';

  let text = $state('');

  function rate(count: number, ms: number): string {
    return ms > 0 && count > 1 ? String(Math.round(((count - 1) * 1000) / ms)) : '-';
  }

  onMount(() => {
    penStats.on = true;
    // the display rate from the time between frames, the middle of the last 60
    const gaps: number[] = [];
    let before = 0;
    let raf = 0;
    const frame = (now: number) => {
      if (before) {
        gaps.push(now - before);
        if (gaps.length > 60) gaps.shift();
      }
      before = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // at most 4 times a second, nothing happens per pen event
    const timer = setInterval(() => {
      const s = penStats;
      const ms = s.last - s.first;
      const sorted = gaps.slice().sort((a, b) => a - b);
      const hz = sorted.length > 10 ? Math.round(1000 / sorted[sorted.length >> 1]) : 0;
      const ink = 'ink' in navigator;
      const trail = !ink ? 'not in this browser' : !$preferences.inkTrail ? 'off' : s.trailReady ? 'active' : 'asked, not active';
      const next = [
        `pointer      ${s.kind || '-'}`,
        `rawupdate    ${!s.rawThere ? 'not in this browser' : s.rawUsed ? 'in use' : 'not used'}`,
        `events/s     ${rate(s.events, ms)}`,
        `samples/s    ${rate(s.samples, ms)} with coalesced`,
        `predicted    ${s.moves > 0 ? (s.predicted / s.moves).toFixed(1) : '-'} per event`,
        `pressure     ${s.kind ? `${s.pMin.toFixed(2)} to ${s.pMax.toFixed(2)}` : '-'}`,
        `desync       ${s.desynchronized}`,
        `ink trail    ${trail}`,
        `live draw    ${s.draws > 0 ? (s.drawMs / s.draws).toFixed(2) : '-'} ms per event`,
        `display      ${hz || '-'} Hz`
      ].join('\n');
      if (next !== text) text = next;
    }, 250);

    return () => {
      penStats.on = false;
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  });
</script>

<div class="pen-diagnostics" aria-hidden="true">{text}</div>

<style>
  .pen-diagnostics {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 5px 8px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-family: var(--font-editor);
    font-size: 10.5px;
    line-height: 1.45;
    white-space: pre;
    pointer-events: none;
    user-select: none;
  }
</style>
