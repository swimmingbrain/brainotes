<script lang="ts">
  import Logo from '$lib/ui/Logo.svelte';
</script>

<svelte:head>
  <title>Privacy Policy | braiNOTES</title>
  <meta name="description" content="braiNOTES privacy policy. Your notes stay in your browser, nothing is uploaded to any server." />
  <link rel="canonical" href="https://notes.swimmingbrain.dev/privacy" />
  <meta property="og:title" content="Privacy Policy | braiNOTES" />
  <meta property="og:url" content="https://notes.swimmingbrain.dev/privacy" />
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
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: October 2026</p>

    <h2>Overview</h2>
    <p>
      braiNOTES is a browser-based app for handwritten notes. Your notes, pdfs and pictures are kept in your
      browser on your device. We do not collect, store, or transmit your notes or personal data to any server.
    </p>

    <h2>Files</h2>
    <p>
      PDFs, pictures and <code>.brainotes</code> files reach the app through a file picker, by drag and drop or
      by pasting. They are read right in the tab: pdf.js draws the pdfs, the browser decodes the pictures, and a
      <code>.brainotes</code> file is unzipped in place. No file data is uploaded to external servers.
    </p>
    <p>
      Every pdf and picture you add is copied into the browser's storage, next to the notebook it belongs to, so
      the notebook opens again without asking for the file. The app keeps no link to the file on your disk.
    </p>
    <p>
      Exports are made in the tab as well. A PDF, a PNG or a <code>.brainotes</code> file is written to the place
      you pick, or downloaded the usual way in browsers without a save dialog.
    </p>
    <p>
      Paste in the right click menu or the command palette reads the clipboard, which the browser may ask your
      permission for. What it reads goes onto the page and nowhere else. Copying a
      selection puts the short text <code>brainotes items</code> on the clipboard, so a later paste knows the
      items are still the newest copy. The items themselves stay in the tab.
    </p>

    <h2>Data Storage</h2>
    <p>
      braiNOTES uses your browser's own storage and nothing else. None of it leaves your browser, and all of it
      can be cleared at any time through your browser settings. This is everything the app writes:
    </p>
    <p>
      <strong>localStorage</strong> holds small settings under five keys:
      <code>brainotes-preferences</code> (everything in the preferences dialog),
      <code>brainotes-layout</code> (the panel sizes of each workspace),
      <code>brainotes-last</code> (which notebook was open last),
      <code>brainotes-reading</code> (the page and zoom you were at in each pdf on the side, for the last hundred)
      and <code>brainotes-reading-tab</code> (which pdf or picture each notebook had open on the side). When a
      tab closes before a change has reached the database, the change is written under
      <code>brainotes-rescue-</code> and the notebook's id, and moved into the database the next time that
      notebook opens.
    </p>
    <p>
      <strong>IndexedDB</strong> holds one database, <code>brainotes</code>, with three stores:
      <code>notebooks</code>, the name, kind, dates and page list of each notebook; <code>pages</code>, the
      strokes, shapes, text and placed pictures of every page; and <code>assets</code>, the pdfs and pictures
      you added, with their file name and type.
    </p>
    <p>
      <strong>Cache Storage</strong> holds the app itself, so it works offline: the files of the build you
      loaded, including the data pdf.js needs for some pdfs, the last good copy of everything else from this
      site, and the fonts once they have been loaded.
    </p>
    <p>
      The app asks the browser to keep this storage persistent, so it is not cleared on its own when the disk
      runs low. Some browsers ask you first. Clearing the site's data still removes all of it, notebooks
      included, so export a <code>.brainotes</code> file first if you want to keep one.
    </p>

    <h2>Analytics</h2>
    <p>
      We do not use tracking scripts, analytics services, or advertising networks.
    </p>

    <h2>Third-Party Services</h2>
    <p>
      <strong>Fonts.</strong> The interface loads its fonts from Google Fonts (fonts.googleapis.com and
      fonts.gstatic.com) when the page loads. Google's privacy policy applies to that request. The stylesheet
      is asked for on every visit, the font files are kept in Cache Storage after the first one. This request
      never carries your notes.
    </p>
    <p>
      <strong>Hosting.</strong> The site is served by GitHub Pages. Like any web server, GitHub receives the
      usual request data when your browser loads the app, such as your IP address and browser, and GitHub's
      privacy statement applies. While a tab is open, the app asks the same server about once a minute whether a
      new version has been published, so the next page load picks it up. Nothing about you or your notes goes
      with it.
    </p>
    <p>
      That is the complete list. There is no backend, no account, no error reporting and no upload. Once the
      page has loaded, the app works with the network switched off.
    </p>

    <h2>Cookies</h2>
    <p>
      braiNOTES does not use cookies, and there is no account to sign in to. The settings listed above are
      stored in localStorage.
    </p>

    <h2>Changes</h2>
    <p>
      We may update this policy from time to time. Changes will be reflected on this page with an updated date.
    </p>

    <h2>Contact</h2>
    <p>
      For questions about this policy, contact us via
      <a href="https://github.com/swimmingbrain/brainotes" target="_blank" rel="noopener">GitHub</a>.
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
    margin-bottom: 4px;
  }

  .updated {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-editor);
    margin-bottom: 32px;
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

  /* only the headings space the sections, so paragraphs need their own gap */
  p + p {
    margin-top: 12px;
  }

  p a {
    color: var(--accent);
    text-decoration: none;
  }

  p a:hover {
    color: var(--accent-hover);
  }

  /* the storage keys are named exactly, so they are set in the mono face */
  p :global(code) {
    font-family: var(--font-editor);
    font-size: 12px;
    color: var(--text-primary);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 1px 5px;
    white-space: nowrap;
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
