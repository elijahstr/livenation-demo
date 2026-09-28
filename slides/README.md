# Slide deck deployment notes

The source directory contains these files:

- `.nojekyll`
- `README.md`
- `app.js`
- `build.ts`
- `index.html`
- `index.template.html`
- `serve.ts`
- `slide-data.json`
- `styles.css`

Run `bun run slides/build.ts` after an approved change to `slide-data.json` or `index.template.html`.
Commit the generated `index.html` with those source changes.

The deployment payload contains only `.nojekyll`, `app.js`, `index.html`, and `styles.css` at the `gh-pages` branch root.
No workflow belongs in that branch.

GitHub Pages publishes the `gh-pages` branch from `/(root)`.
The live deck is `https://elijahstr.github.io/livenation-demo/`.

For a local review, run `bun run slides/serve.ts` and open the loopback address that the command prints.
