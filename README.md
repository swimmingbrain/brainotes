<p align="center">
  <img src="static/brainotes-logo-readme.svg" alt="brainotes logo" width="80" />
</p>

<h1 align="center">braiNOTES</h1>

<p align="center">
  Handwritten notes and a whiteboard that run in your browser.<br/>
  Write with a pen, keep the pdf next to your notes.
</p>

<p align="center">
  <img src="docs/screenshot.png" alt="braiNOTES in Study mode, handwritten notes with a diagram snipped from the slides, and the lecture pdf open on the side" width="800" />
</p>

<p align="center">
  <a href="https://notes.swimmingbrain.dev"><strong>Try it now &rarr; notes.swimmingbrain.dev</strong></a>
</p>

braiNOTES is an open source app for writing by hand, like OneNote or GoodNotes, but in a browser tab. It is made for lectures: the slides open next to your notes or become the pages you write on. There is no account and no server, everything stays in your browser.

## Features

- Ballpoint, fountain pen, marker, pencil and highlighter, with pen pressure
- Notebooks on blank, lined, grid or dotted paper, and whiteboards without edges
- Write on a pdf, or read it on the side and snip parts of it into your notes
- Pictures, shapes, text, a lasso, an eraser and a laser pointer
- Export to PDF with the original pages and vector ink, or a page to PNG
- `.brainotes` files to back up a notebook or share it
- Saves by itself and works offline once it has been opened

The fountain pen and the highlighter on dotted paper:

<p align="center">
  <img src="docs/pen.gif" alt="A heading and two lines of an integration written with the fountain pen on dotted paper, the result marked with the highlighter" width="800" />
</p>

A lecture pdf on the side, a part of a slide snipped into the notes, its page badge leading back to the slide:

<p align="center">
  <img src="docs/study.gif" alt="A drawing snipped from a slide into the notes, the p. 2 badge jumps back to the slide, a line written under it" width="800" />
</p>

A whiteboard on dark paper, circles that snap when the pen holds still, the laser pointer:

<p align="center">
  <img src="docs/board.gif" alt="The board turns dark, two rough circles snap into clean ones, the laser circles the overlap" width="800" />
</p>

## Shortcuts

| Key | What it does |
|-----|--------------|
| `P` `H` `E` `V` | Pen, highlighter, eraser, select |
| `S` `T` `X` `L` | Shapes, text, snip, laser |
| `Space` | Hand while held |
| `Ctrl+Z` `Ctrl+Shift+Z` | Undo, redo |
| `Ctrl+Enter` | New page |
| `PageDown` `PageUp` | Next and previous page |
| `Ctrl+1` `Ctrl+2` `Ctrl+3` | Notes, Study, Board |
| `Ctrl+Shift+F` | Present in fullscreen |
| `Ctrl+K` | Command palette |
| `?` | All shortcuts |

## Bridge

The bridge connects braiNOTES to [brainBRIDGE](https://github.com/swimmingbrain/brainbridge), a small server on your computer, so a coding agent can read your pages, write on them and write them up in [TeXbrain](https://github.com/swimmingbrain/texbrain).

<p align="center">
  <img src="docs/bridge.gif" alt="The bridge switched on in the preferences turns green, a line of text from the server lands on the page and goes again with one undo, the TeXbrain button opens the linked project" width="800" />
</p>

- Open [notes.swimmingbrain.dev/?bridge](https://notes.swimmingbrain.dev/?bridge) or switch on Bridge in Preferences, General. Allow the local connection when the browser asks and the Bridge segment in the status bar turns green.
- `Bridge: connect` and `Bridge: disconnect` in the command palette do the same.
- `Link TeXbrain project` in the palette ties the notebook to a TeXbrain project, the TeXbrain button in the top bar then opens it.
- Every edit that comes over the bridge is one undo step.
- The socket only goes to 127.0.0.1, nothing leaves your computer.

## Running locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. `pnpm test` runs the tests, `pnpm check` the type checks and `pnpm build` writes the static site to `build/`. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) if you want to help.

## How it works

- Ink is drawn into cached canvas tiles, only the tiles where something changed are drawn again.
- A stroke is an outline from perfect-freehand, made from the points and the pen pressure.
- The line is drawn the moment the pen moves. A one euro filter calms a shaky hand while you write and a light refit runs when the pen lifts.
- PDFs are drawn by pdf.js in a worker, only the pages you see and at the zoom you see them.
- Notebooks, pages and files live in IndexedDB and are saved a moment after every change.
- A `.brainotes` file is a zip with the notebook, one json file per page and the pdfs and pictures.
- The PDF export puts the original pdf pages into the file and the ink on top as vectors.

## Tech stack

| Part | Library |
|------|---------|
| Framework | Svelte 5 + SvelteKit (static adapter) |
| Strokes | perfect-freehand |
| Reading PDFs | pdf.js |
| Writing PDFs | pdf-lib (the pdfme fork) |
| Storage | IndexedDB through idb |
| Files | fflate, browser-fs-access |
| Language | TypeScript |

## License

MIT, see [LICENSE](LICENSE). The libraries keep their own licenses, [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) lists them.
