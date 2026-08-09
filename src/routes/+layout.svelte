<script lang="ts">
  import '../app.css';
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
</script>

{@render children()}
