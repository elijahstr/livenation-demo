# Publish a five-slide, evidence-linked interview deck on GitHub Pages

## Goal

Publish a static five-slide deck for the independent Live Nation sales demo.
The deck gives an interviewer a short visual path to the synthetic-data demo, its evidence, and its live-service proof.

The deck uses no runtime dependency, sends no data, and contains no credential or secret.

<!-- digest:start -->
The deck is an independent, synthetic-data presentation with five slides and authenticated evidence links.
<!-- digest:end -->

## Verified context

- The repository is a public independent demo and must preserve independent-demo and synthetic-data labels. [Repository policy](../../AGENTS.md)
- `public/app.js` and `public/styles.css` have user changes. `docs/prototypes/` is untracked. This work preserves all three paths.
- The repository currently uses Bun and has no application dependency. [package.json](../../package.json)
- The existing command-center plan identifies `workspace.livenation_demo.current_sales_evidence` as the runtime evidence object. [West-region implementation plan](2026-09-28-west-region-sales-demo-implementation.md)
- The existing command-center plan identifies a deployed AgentCore Harness and a synthetic evidence-tool cycle. [West-region implementation plan](2026-09-28-west-region-sales-demo-implementation.md)
- GitHub Pages is disabled at plan time. The Pages setup therefore needs a manual enablement step after the deployment branch exists.
- GitHub Pages can publish a branch folder. A branch-root source therefore permits a deployment branch with only slide files. [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- GitHub Pages does not require a workflow when it publishes from a branch. [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- The AgentCore console is an AWS console surface. The deck must state the required console login beside its proof link. [AgentCore interfaces](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/develop-agents.html)
- Databricks Catalog Explorer exposes catalog objects through the workspace UI. The deck links to the verified workspace route for `workspace.livenation_demo.current_sales_evidence`. [Databricks Catalog Explorer](https://docs.databricks.com/aws/en/catalog-explorer)
- The serverless Databricks SQL warehouse is a real compute endpoint. Its identifier is already present in the public repository, but the deck does not expose connection credentials. [Databricks SQL warehouse](https://docs.databricks.com/aws/en/compute/sql-warehouse)
- The verified Harness is `livenation_demo-1on72c4veC` in `us-east-1`. The plan uses the documented AgentCore console root and displays the Harness identifier for quick lookup.
- A live route check returned the Databricks sign-in boundary for the catalog object and an AWS regional-console redirect. These checks verify the routes, not anonymous resource access.

The Databricks route and AWS console route require an authenticated user with access. They contain no credential or temporary token.

## Decisions

- Create at most five slides under `slides/`.
- Use static HTML, CSS, and vanilla JavaScript only.
- Keep the published deck light only with `color-scheme: light`.
- Reuse the command-center visual language: dark charcoal, Live Nation red, compact cards, data chips, and direct disclosure labels.
- Provide button, keyboard, and touch navigation.
- Give every slide a visible current-slide position and accessible name.
- Link to the authenticated Databricks workspace catalog object, the AWS AgentCore console, and public repository evidence.
- Show a dated, sanitized live-status panel beside the console links so a signed-out reader sees the verified resource state.
- State `Independent demo`, `Synthetic data`, `Console login required`, and the dated verification result in the visible deck.
- Make the source URLs configurable in one reviewed, non-secret slide-data block.
- Publish from a dedicated `gh-pages` branch whose tree contains only the contents of `slides/`.
- Do not add a GitHub Actions workflow, a package, or a runtime dependency.
- Do not change `public/app.js`, `public/styles.css`, or `docs/prototypes/`.
- Publish an empty `.nojekyll` marker and reject payload names that start with `_` or `#`.
- Use progressive enhancement. All five slides remain readable as one vertical document when JavaScript does not run.
- Add `noindex, nofollow` metadata and put `Independent demo` in the document title.

## Architecture

<!-- fig:deck-flow -->

The deck has five slides: sales problem, Databricks evidence, Kimi agent, human approval, and proof links.
Five slides move from framing to proof.
The source repository produces a static `slides/` directory. The dedicated `gh-pages` branch contains only this directory's contents. GitHub Pages serves the branch root.

## Implementation

### 1. Add the self-contained deck

Add `slides/slide-data.json`, `slides/index.template.html`, `slides/build.ts`, `slides/index.html`, `slides/styles.css`, and `slides/app.js`.

- Define exactly five semantic `<section>` slide elements in source order.
- Keep every proof URL in `slide-data.json`. Generate the committed `index.html` from the template so no-JavaScript visitors retain functional links.
- Use the existing product visual language as a reference without copying a proprietary asset or claim.
- Keep the viewport background and every state light.
- Add plain-text disclosure labels to the masthead and relevant evidence cards.
- Put a visible dated verification line on the proof slide. The implementer sets the date only after the live checks finish.
- Show all five slides in a vertical document before JavaScript adds the interactive-deck class.
- Add `Independent demo` to the document title and add `robots` metadata with `noindex, nofollow`.

The five-slide limit keeps the presentation short and avoids a technical document inside the interview narrative.

### 2. Add accessible navigation

In `slides/app.js`, track the active slide with one bounded zero-based index.

- Add Previous and Next buttons with descriptive `aria-label` values.
- Support Left Arrow, Right Arrow, Home, and End only when focus is not inside an editable control.
- Add a touch horizontal-swipe threshold. Ignore a vertical gesture and a short movement.
- Update `aria-hidden`, tab order, visible slide count, and focus after every navigation action.
- Respect `prefers-reduced-motion` and never require motion to understand a slide.
- Keep links and buttons reachable with keyboard focus and preserve a visible focus indicator.

This state model gives touch, keyboard, and button users the same five-slide path.

### 3. Add honest proof links

In `slides/index.html`, include a proof slide with direct links.

- Use `https://dbc-da714a97-83a0.cloud.databricks.com/explore/data/workspace/livenation_demo/current_sales_evidence` for the evidence view. This accepted demo link exposes the workspace host but not a credential.
- Use `https://console.aws.amazon.com/bedrock-agentcore/home?region=us-east-1#/` for AgentCore and show `livenation_demo-1on72c4veC` beside it.
- Link to the public repository and to the public implementation evidence inside it.
- Mark Databricks and AWS links as console links that require a signed-in account with access.
- Keep the links free of credential values, signed query parameters, AWS account identifiers, and temporary tokens.
- Use `target="_blank"` with `rel="noreferrer"` for authenticated console links.
- Show sanitized status facts from the final live checks: the Databricks object type and row count, plus the Harness status, model, and tool name.

These links let an authorized interviewer inspect real demo resources. They do not claim that anonymous visitors can see those resources.

### 4. Add deployment notes without automation

Add `slides/README.md` and `slides/.nojekyll`. Update the root `README.md`.

- State the exact runtime files in the deployment payload: `.nojekyll`, `app.js`, `index.html`, and `styles.css`.
- State that build sources remain on `main` and do not enter the deployment branch.
- State that no workflow belongs in the branch.
- Document manual GitHub Pages setup: select `gh-pages`, select `/(root)`, then save.
- Document the final Pages URL only after GitHub reports it.
- Document that Pages was disabled before this deployment sequence.
- Add the final Pages URL and deck path to the root repository guide after GitHub reports the URL.

Manual source selection is required because Pages is disabled at plan time. The branch-only payload prevents the published site from exposing repository files by mistake.
Only the slide payload reaches the public branch.

## Test-first validation

### Automated checks before implementation

Add `tests/slides-deck.test.ts` before deck code.

- Assert that the HTML source declares exactly five slide sections.
- Assert that each slide has a unique accessible label and position text.
- Assert that the three proof links exist, use HTTPS, and have non-empty targets.
- Assert that no proof link contains a token-like query parameter or a credential value.
- Assert that each console proof link has a visible login-required disclosure.
- Assert that each console proof link has adjacent sanitized live-status evidence.
- Assert that `index.html` matches a fresh build from `index.template.html` and `slide-data.json`.
- Assert that the source includes independent-demo, synthetic-data, and dated-verification disclosure text.
- Assert that stylesheet source sets light color scheme and contains a reduced-motion rule.
- Assert that all slides remain readable before JavaScript adds the interactive-deck class.
- Assert that the title identifies the page as an independent demo and the page requests `noindex, nofollow`.
- Assert that navigation includes button, keyboard, and touch handlers.
- Assert that `slides/` contains only the expected runtime, build-source, and documentation files.
- Assert that no published asset name starts with `_` or `#`.

### Browser checks after implementation

Serve `slides/` on `127.0.0.1` with a dependency-free Bun command.

- Check the first and final slides at desktop width.
- Check all five slides at a narrow mobile width.
- Check Previous, Next, Left Arrow, Right Arrow, Home, End, and a horizontal swipe.
- Check keyboard focus, visible focus styling, slide announcements, and no horizontal body scroll.
- Check that each external proof link has the intended target without opening an authenticated session in automation.
- Check browser console output for errors.

### Deployment checks

Before publish, inspect the staged `gh-pages` tree and prove it contains only `.nojekyll`, `app.js`, `index.html`, and `styles.css`.

After Pages is enabled, fetch the published root and each static asset.
Open the published deck at desktop and mobile widths.
Verify the public repository link from the published site.
Verify the Databricks and AWS links resolve to their sign-in or authorized-console boundary without recording an authenticated screenshot.

## Deployment sequence

<!-- fig:publish-flow -->

1. Run the automated deck tests.
2. Run the loopback browser checks.
3. Recheck the authenticated console routes and capture sanitized status facts with the dated verification result.
4. Re-run link and disclosure checks.
5. Create the dedicated `gh-pages` branch from the final `slides/` payload only, without force on the first publish.
6. Inspect the branch tree before push.
7. Push the branch.
8. Enable GitHub Pages with `gh-pages` and `/(root)` in repository settings.
9. Verify the published Pages URL and responsive deck.

For a later replacement, record the existing remote `gh-pages` commit before any force push. This commit is the rollback point.

The branch publish step changes the public site. The implementation must obtain the parent task's authorization before it performs that step.

## Risks and open questions

### Required deployment input

- The verification date must match the final live evidence check.

### Accepted constraints and exposure

- Public Pages can expose only static slide content. It cannot prove an authenticated resource to an anonymous visitor.
- The sanitized live-status panel gives the anonymous reader a dated verification record. The signed-in presenter can open the direct console links.
- The Databricks workspace host becomes public because the user requested a direct evidence link. It is an identifier, not a credential.
- GitHub Pages is disabled now. A repository administrator must enable the branch source after the branch exists.
- A five-slide deck cannot explain every technical control. The public repository evidence link provides deeper detail.

## Source record

- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Pages REST API](https://docs.github.com/en/rest/pages/pages)
- [AgentCore interfaces](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/develop-agents.html)
- [Databricks Catalog Explorer](https://docs.databricks.com/aws/en/catalog-explorer)
- [Databricks SQL warehouse](https://docs.databricks.com/aws/en/compute/sql-warehouse)
- [Repository policy](../../AGENTS.md)
- [Current command-center implementation plan](2026-09-28-west-region-sales-demo-implementation.md)

## Review record

The required independent review used Sonnet 5 for repository context and Opus 5 for judgment.
The verdict was `needs material revision`.

- Accepted: add sanitized visible status evidence beside authenticated console links.
- Accepted: remove the Databricks workspace ID query parameter and record the public workspace-host exposure.
- Accepted: verify the two console routes at their sign-in boundaries and use the documented AWS console root.
- Accepted: add `.nojekyll`, asset-name checks, and published-asset HTTP checks.
- Accepted: update the root README.
- Accepted: make the five-slide document readable without JavaScript.
- Accepted: add `noindex, nofollow` and `Independent demo` to the title.
- Accepted: record the existing deployment commit before any later force push.
- Not selected: authenticated console screenshots. The public deck instead uses sanitized live API status facts and signed-in console links. This avoids images with account or identity details while it supports the presenter workflow.
- Task-review ruling: a JavaScript-only URL block broke proof links when enhancement failed. The accepted fix uses one JSON source and a dependency-free build step that commits functional static links.
