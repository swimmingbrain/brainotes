<script lang="ts">
  import '../app.css';
  import Toast from '$lib/ui/Toast.svelte';
  import { onMount } from 'svelte';
  import { browser, dev } from '$app/environment';
  import { beforeNavigate } from '$app/navigation';
  import { updated } from '$app/state';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  // after a deploy the chunks this tab knows about are gone from the server.
  // a full page load on the next navigation picks up the new build instead
  // of failing on a missing file
  beforeNavigate(({ willUnload, to }) => {
    if (updated.current && !willUnload && to?.url) {
      location.href = to.url.href;
    }
  });

  // the worker keeps the app working offline. the dev server builds it as a
  // module on every change, it only runs in a real build
  onMount(() => {
    if (!browser || dev || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    // a hard reload skips the worker, it is asked to take the page back
    navigator.serviceWorker.ready
      .then((reg) => {
        if (!navigator.serviceWorker.controller) reg.active?.postMessage({ type: 'claim' });
      })
      .catch(() => {});
  });
</script>

{@render children()}
<Toast />
