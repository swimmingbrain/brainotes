<script lang="ts" module>
  // each copy on a page needs its own mask id
  let count = 0;
</script>

<script lang="ts">
  let { size = 24 }: { size?: number } = $props();

  const uid = `bn${++count}`;
</script>

<svg width={size} height={size} viewBox="4 9 56 46" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <mask id="{uid}-h">
      <rect width="64" height="64" fill="#fff" />
      <rect x="9.5" y="14.8" width="5.4" height="5" rx="1" fill="#000" /><rect x="9.5" y="24.6" width="5.4" height="5" rx="1" fill="#000" /><rect x="9.5" y="34.4" width="5.4" height="5" rx="1" fill="#000" /><rect x="9.5" y="44.2" width="5.4" height="5" rx="1" fill="#000" />
      <path d="M21.5 43.5C26 43.5 34.5 36.5 37.5 27.5C39.5 21 37 16 32.5 16C27.5 16 26 21.5 27 27.5C28.5 35.5 33.5 42.5 40.5 42.5C47 42.5 48.5 34.5 53 34.5" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    </mask>
  </defs>
  <rect x="5" y="10" width="54" height="44" rx="4" fill="currentColor" mask="url(#{uid}-h)" />
</svg>
