<script lang="ts">
  import { page } from '$app/state';
  import Logo from '$lib/ui/Logo.svelte';

  const missing = $derived(page.status === 404);
</script>

<svelte:head>
  <title>{missing ? 'Not found' : 'Error'} | braiNOTES</title>
</svelte:head>

<div class="error-page">
  <div class="error-content">
    <span class="error-icon"><Logo size={40} /></span>
    <h1>{page.status}</h1>
    <p>{missing ? 'There is no page at this address.' : page.error?.message}</p>
    <a href="/" data-sveltekit-reload>&larr; Back to braiNOTES</a>
  </div>
</div>

<style>
  .error-page {
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    background: var(--bg-deep);
  }

  .error-content {
    text-align: center;
  }

  .error-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
    color: var(--accent);
  }

  h1 {
    font-family: var(--font-editor);
    font-size: 28px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 24px;
  }

  a {
    font-size: 12px;
    font-family: var(--font-editor);
    color: var(--text-muted);
    text-decoration: none;
  }

  a:hover {
    color: var(--accent);
  }
</style>
