<p align="center">
  <img src="static/brainotes-logo-readme.svg" alt="brainotes logo" width="80" />
</p>

<h1 align="center">braiNOTES</h1>

<p align="center">
  Handwritten notes and a whiteboard that run entirely in your browser.<br/>
  No accounts. No uploads. Write with a pen, keep the pdf next to your notes.
</p>

Lecture notes work better by hand, but the apps that do it well want a subscription, an account or one particular tablet, and the free ones tend to lose the pdf somewhere along the way. braiNOTES opens in a tab, a stylus writes, the slides sit next to the notes, and everything stays in the browser. It is early: the shell, the tools and the preferences are in place, the canvas and the pdf side come next.

## Running locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. `pnpm check` runs the type checks, `pnpm test` the tests and `pnpm build` writes the static site to `build/`.

## License

MIT, see [LICENSE](LICENSE).
