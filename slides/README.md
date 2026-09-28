# Slide deck deployment notes

The deployment payload contains these `slides/` files at the deployment branch root:

- `.nojekyll`
- `README.md`
- `app.js`
- `index.html`
- `serve.ts`
- `styles.css`

The `gh-pages` branch contains only these payload files at its root.
No workflow belongs in that branch.

GitHub Pages was disabled before this deployment sequence.
After the branch exists, select `gh-pages`, select `/(root)`, and save the source setting.
Record the final Pages URL only after GitHub reports it.

For a local review, run `bun run slides/serve.ts` and open the loopback address that the command prints.
