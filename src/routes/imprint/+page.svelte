<script lang="ts">
  import Logo from '$lib/ui/Logo.svelte';
</script>

<svelte:head>
  <title>Imprint | braiNOTES</title>
  <meta name="description" content="Legal notice and contact information for braiNOTES, free handwritten notes in the browser by Braian Plaku." />
  <link rel="canonical" href="https://notes.swimmingbrain.dev/imprint" />
  <meta property="og:title" content="Imprint | braiNOTES" />
  <meta property="og:url" content="https://notes.swimmingbrain.dev/imprint" />
</svelte:head>

<div class="legal">
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="logo" data-sveltekit-reload>
        <span class="logo-mark"><Logo size={24} /></span>
        <span class="logo-name">braiNOTES</span>
      </a>
    </div>
  </nav>

  <div class="content">
    <h1>Imprint</h1>

    <h2>Responsible for Content</h2>
    <p>
      Braian Plaku<br />
      <a href="https://swimmingbrain.dev" target="_blank" rel="noopener">swimmingbrain.dev</a>
    </p>

    <h2>Contact</h2>
    <p>
      GitHub: <a href="https://github.com/swimmingbrain/brainotes" target="_blank" rel="noopener">swimmingbrain/brainotes</a>
    </p>

    <h2>Liability for Content</h2>
    <p>
      The contents of this website have been created with the utmost care. However, we cannot guarantee
      the accuracy, completeness, or timeliness of the content. As a service provider, we are responsible
      for our own content on these pages under general law. However, we are not obligated to monitor
      transmitted or stored third-party information or to investigate circumstances that indicate illegal activity.
    </p>

    <h2>Liability for Links</h2>
    <p>
      This website contains links to external third-party websites over whose content we have no influence.
      Therefore, we cannot accept any liability for this external content. The respective provider or operator
      of the pages is always responsible for the content of the linked pages.
    </p>
  </div>

  <footer class="footer">
    <a href="/" data-sveltekit-reload>&larr; Back to braiNOTES</a>
  </footer>
</div>

<style>
  /* the app shell pins html and body to the viewport and hides the overflow.
     the legal pages are documents, so they hand the scrolling back. the two
     selectors are deliberately heavier than app.css's plain `html, body`,
     because which of the two stylesheets loads last is not fixed */
  :global(html:root), :global(html body) {
    height: auto;
    overflow: auto;
  }

  .legal {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
  }

  .nav {
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }

  .nav-inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 32px;
    height: 48px;
    display: flex;
    align-items: center;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }

  .logo-mark {
    display: flex;
    align-items: center;
    color: var(--accent);
  }

  .logo-name {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 18px;
    color: var(--text-primary);
  }

  .content {
    flex: 1;
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 32px;
    width: 100%;
  }

  h1 {
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 24px;
  }

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 24px 0 8px;
  }

  p {
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-secondary);
  }

  p a {
    color: var(--accent);
    text-decoration: none;
  }

  p a:hover {
    color: var(--accent-hover);
  }

  .footer {
    border-top: 1px solid var(--border);
    padding: 16px 32px;
    max-width: 720px;
    margin: 0 auto;
    width: 100%;
  }

  .footer a {
    font-size: 12px;
    font-family: var(--font-editor);
    color: var(--text-muted);
    text-decoration: none;
  }

  .footer a:hover {
    color: var(--accent);
  }
</style>
