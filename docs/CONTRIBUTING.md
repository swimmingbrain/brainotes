# Contributing

There is no formal process. Fork the repo, make your change, open a pull request. Small and focused beats big and sweeping, so if you plan something larger, open an issue first and we can talk it through before you spend time on it.

## Running locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` in Chrome or Edge. A pen or a touch screen helps, but the mouse draws too.

`pnpm check` runs the type checker and has to come back with no errors and no warnings, `pnpm test` runs the unit tests, and `pnpm build` writes the static site to `build/`.

## Where things live

- `src/lib/engine` is the canvas: the notebook in memory, strokes, tiles, the tools and undo. Plain TypeScript, no Svelte in it.
- `src/lib/pdf` reads and draws pdfs with pdf.js, `src/lib/export` writes the pdf and png exports.
- `src/lib/storage` is IndexedDB, the autosave and the `.brainotes` file.
- `src/lib/editor` is what the buttons and the keys call, `src/lib/ui` are the Svelte components, one per file.

## Style

There is no linter and no formatter, so keep the style of the file you are in: two spaces, single quotes, semicolons, and lowercase comments that explain why rather than what. Points of strokes never go into Svelte state, the engine keeps them in plain arrays.

Commit messages are short and lowercase with a type prefix, like `fix: the highlighter shows on dark slides` or `feat: shift click adds to the selection`. The types in use are `feat`, `fix`, `perf`, `docs`, `test`, `refactor` and `chore`.

## License

By contributing you agree that your work is released under the MIT license, like the rest of the project.
