# Security

Everything in braiNOTES runs in your browser. No server of mine sees your notes. Nothing is uploaded. One request goes to another server and that is the whole list: the fonts, from Google Fonts as the page loads. It never carries your notes. The site itself is served by GitHub Pages, and an open tab asks it about once a minute whether a new version is out. There is no backend, no API, no account, no telemetry and no error reporting.

PDFs are read by pdf.js in a web worker, pictures are decoded by the browser, and a `.brainotes` file is unzipped in the tab with fflate. There are no shell commands, no `exec`, nothing that runs outside the tab.

## What stays on your machine

Everything the app keeps is in your browser's storage for this origin, and clearing the site's data removes all of it:

- **localStorage**: five keys of settings, `brainotes-preferences`, `brainotes-layout`, `brainotes-last`, `brainotes-reading` and `brainotes-reading-tab`, plus a `brainotes-rescue-` key for a notebook whose last change had not reached the database when its tab closed. It is moved into the database the next time the notebook opens.
- **IndexedDB**: the `brainotes` database holds the notebooks, their pages with all the ink, and the pdfs and pictures you added to them.
- **Cache Storage**: the app's own files and the pdf.js data so it works offline, and the fonts once they have been loaded.

A pdf or a picture you add is copied into IndexedDB. The app keeps no handle to the file on your disk.

## Reporting

If you find a security problem, please don't open a public issue. Use the private vulnerability reporting under the Security tab of this repository and I'll get back to you as soon as I can.
