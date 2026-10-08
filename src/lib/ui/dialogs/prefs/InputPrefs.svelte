<script lang="ts">
  import Field from '../../Field.svelte';
  import Slider from '../../Slider.svelte';
  import ToggleField from '../../ToggleField.svelte';
  import { preferences, setPreference } from '$lib/stores/preferences';

  // stored from 0 to 1, shown in percent
  function percent(value: number): number {
    return Math.round(value * 100);
  }
</script>

<h3 class="section">Touch</h3>
<Field label="Finger draws">
  <ToggleField value={$preferences.fingerDraws} label="Finger draws" onchange={(v) => setPreference('fingerDraws', v)} />
</Field>
<p class="help">Off: only the pen writes, a finger moves and zooms the page. On: a finger writes too, two fingers still move.</p>

<h3 class="section">Pen</h3>
<Field label="Pressure">
  <Slider
    value={percent($preferences.pressure)}
    min={0}
    max={100}
    step={5}
    precision={0}
    unit="%"
    label="Pressure sensitivity"
    onchange={(v) => setPreference('pressure', v / 100)} />
</Field>
<p class="help">How much pressing harder makes the line thicker. Zero draws every line at the same width.</p>
<Field label="Smoothing">
  <Slider
    value={percent($preferences.smoothing)}
    min={0}
    max={100}
    step={5}
    precision={0}
    unit="%"
    label="Smoothing"
    onchange={(v) => setPreference('smoothing', v / 100)} />
</Field>
<p class="help">Evens out a shaky hand while you write and once more when you lift the pen. The line always reaches the pen, a lot of it rounds small corners. Zero draws exactly what the pen sends.</p>
<Field label="Hold to snap">
  <ToggleField value={$preferences.holdToSnap} label="Hold to snap shapes" onchange={(v) => setPreference('holdToSnap', v)} />
</Field>
<p class="help">Hold the pen still at the end of a stroke and it turns into a clean line, arrow, rectangle or ellipse.</p>
<Field label="System ink trail">
  <ToggleField value={$preferences.inkTrail} label="System ink trail" onchange={(v) => setPreference('inkTrail', v)} />
</Field>
<p class="help">Lets the system draw the newest bit of a pen line ahead of the page, so the ink sits right under the pen. Only some browsers on Windows have it. Turn it off if the tip looks wrong.</p>
<Field label="Pen diagnostics">
  <ToggleField value={$preferences.penDiagnostics} label="Pen diagnostics" onchange={(v) => setPreference('penDiagnostics', v)} />
</Field>
<p class="help">Shows a small box in the corner of the page with what the pen and the browser report while you write: events and samples per second, pressure, and whether the fast drawing paths are on. Handy when the pen feels slow.</p>

<style>
  .section {
    margin: 12px 8px 4px;
    font-family: var(--font-editor);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    padding-bottom: 4px;
  }

  .section:first-child {
    margin-top: 0;
  }

  .help {
    padding: 0 8px 6px 124px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }
</style>
