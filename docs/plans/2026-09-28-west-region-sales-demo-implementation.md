# West-region command center implements a safe, observable recovery demo

## Goal

Build the local West-region command center from the approved design.
The application reads six synthetic aggregate venue rows from Databricks, selects one measured alert, asks Kimi for a bounded explanation, and records a human-approved local simulation.

The application demonstrates real Databricks and AgentCore connections without customer data, free-form prompts, email delivery, or advertising changes.

<!-- digest:start -->
The command center makes one safe recovery decision visible from data read through local action audit.
<!-- digest:end -->

## Verified context

- The approved source design is [2026-09-28-west-region-sales-demo-design.md](../superpowers/specs/2026-09-28-west-region-sales-demo-design.md).
- `src/harness-tool-cycle.ts` already parses AgentCore streams and limits tool handoffs to three iterations.
- `scripts/invoke-harness.ts` currently loads the AgentCore SDK and invokes the deployed Kimi Harness.
- The current project uses Bun with no application dependency.
- The Databricks profile is `livenation-demo`.
- The live legacy table is `workspace.livenation_demo.show_sales_snapshots`.
- The live legacy table and curated view each expose six columns and two rows before this migration.
- The managed Kimi Harness is deployed in AWS and has completed a synthetic evidence-tool cycle.
- `docs/prototypes/` is an untracked visual reference. This work does not edit, stage, delete, or import it.

The facts above come from repository inspection and the approved design. The live Databricks row shape must be verified again before the migration changes it.

## Decisions

- Run one Bun HTTP server on `127.0.0.1` only.
- Add no third-party dependency.
- Read only `workspace.livenation_demo.current_sales_evidence` at application runtime.
- Keep one constant SQL statement with typed `region` and `fresh_after` parameters.
- Limit the statement result to 25 rows and 65,536 bytes.
- Wait at most 50 seconds for the statement, then cancel it.
- Accept only `west` rows whose `origin` is `synthetic`.
- Select only a deterministic alert. Kimi cannot select, create, or change an alert.
- Keep the existing AgentCore stream parser and three-iteration cap.
- Refactor the evidence lookup into an injected resolver.
- Move the current AgentCore SDK lookup and invoke code into a reusable client module.
- Give Kimi only the selected synthetic aggregate and a fixed prompt.
- Do not pass edited drafts, UI text, or arbitrary operator text to Kimi.
- Display Kimi output as model rationale, not measured fact.
- Use Email, Social, and Dismiss as local simulations only.
- Save synthetic action records in ignored `outputs/demo-actions.json`.
- Serialize local action-store writes.
- Make edits invalidate approval.
- Return the original record for a duplicate execution request.
- Use one invocation-only West tool override for `get_sales_evidence`.
- Keep the existing `allowedTools: ["*"]` override isolated to the Kimi tool cycle and document its built-in-tool exposure.
- The user selected root for the `livenation-demo` profile. Root retains direct command authority, while the application calls only `InvokeHarness`.

## Architecture

<!-- fig:architecture -->

The first lane establishes measured truth. The second lane creates only local records after a human decision.

## API contract

All JSON routes send `content-type: application/json; charset=utf-8`.
The server rejects unsupported methods with `405` and unknown API routes with `404`.

| Route | Method | Request | Response | Purpose |
| --- | --- | --- | --- | --- |
| `/api/sales-check` | `POST` | None | `200` check result | Read and validate evidence, select an alert, and get a Kimi rationale. |
| `/api/state` | `GET` | None | `200` current state | Return the last check and the local action records. |
| `/api/actions/:actionId` | `GET` | None | `200` action record | Return one stored action. |
| `/api/actions` | `POST` | `alertSnapshotHash`, `actionType` | `201` pending action | Prepare a synthetic Email, Social, or Dismiss action. |
| `/api/actions/:actionId` | `PATCH` | `content` | `200` pending action | Replace a draft and invalidate its approval. |
| `/api/actions/:actionId/approve` | `POST` | None | `200` approved action | Record human approval. |
| `/api/actions/:actionId/execute` | `POST` | None | `200` completed action | Write a local simulation result, or return the original result for a duplicate key. |
| `/*` | `GET` | None | Static asset or HTML | Serve the command center from `public/`. |

`POST /api/sales-check` returns one of `alert`, `healthy`, `stale`, `empty`, or `error` states.
Only `alert` contains a selected aggregate and a Kimi rationale.

`POST /api/actions` rejects an unknown action type, a missing snapshot, or a snapshot that differs from the current alert.
`PATCH /api/actions/:actionId` accepts only a bounded plain-text draft and sets the state to `pending`.
`POST /api/actions/:actionId/execute` rejects every state except `approved`.

## Data migration and rollback

### Pre-write capture

1. Use the local Databricks CLI with the `livenation-demo` profile.
2. Record `DESCRIBE HISTORY workspace.livenation_demo.show_sales_snapshots`.
3. Record `SHOW CREATE TABLE workspace.livenation_demo.show_sales_snapshots`.
4. Record the curated view DDL with `SHOW CREATE TABLE workspace.livenation_demo.current_sales_evidence`.
5. Save the read-only capture under ignored `outputs/migrations/` with a timestamp.

This capture creates a reversible point before the demo-only change.

### Migration

1. Use `CREATE OR REPLACE TABLE workspace.livenation_demo.show_sales_snapshots` with the reviewed 13-column contract.
2. Generate `data_as_of` during seed execution.
3. Insert six West-region rows for the approved real venue names.
4. Set `origin` to `synthetic` for every row.
5. Set Hayden Homes Amphitheater below `0.75` and every other row at or above `0.75`.
6. Use `ALTER VIEW workspace.livenation_demo.current_sales_evidence AS` to expose the exact contract.
7. Query the view and prove that all six rows validate.

The table operation intentionally replaces the legacy demo table only inside `workspace.livenation_demo`.
The view operation avoids a drop and preserves the view object identity.

### Rollback

1. Stop the local server.
2. Use the captured Delta table version with `RESTORE TABLE workspace.livenation_demo.show_sales_snapshots TO VERSION AS OF <captured-version>`.
3. Restore the captured view definition with `ALTER VIEW ... AS <captured-definition>`.
4. Query the restored view and compare its row count to the capture.
5. Delete only the local `outputs/demo-actions.json` file if the user requests local demo-state removal.

Databricks documents replacement table behavior, view alteration, and Delta restore in the sources below. The live command must use the captured version, not an inferred version number.

## Implementation

### 1. Create domain types and deterministic sales logic

Add `src/west-sales.ts`.

- Define the 13-field `WestSalesEvidence` contract.
- Validate all field types, finite numeric values, non-empty identifiers, valid ISO timestamps, `west` region, and `synthetic` origin.
- Reject zero or negative targets and sales values outside the public capacity.
- Calculate the ratio without rounding.
- Reject a row older than seven days, inclusive of the cutoff.
- Detect ratios below `0.75` only.
- Sort candidates by lowest ratio, earliest show date, then `event_id`.
- Export a stable snapshot hash from the selected evidence.

This module makes alert truth testable and independent from the model or UI.

### 2. Add the Databricks statement adapter

Add `src/databricks-sales-adapter.ts` and `config/demo-runtime.json`.

- Export the one `SALES_EVIDENCE_SQL` constant.
- Call `databricks api post /api/2.0/sql/statements` through Bun subprocess APIs.
- Send typed `region` and `fresh_after` parameters only.
- Request `format: JSON_ARRAY`, `disposition: INLINE`, row limit `25`, byte limit `65536`, and a `50s` wait timeout.
- Poll only when the first response is pending.
- Cancel the statement on the deadline, then return a typed timeout error.
- Set a subprocess deadline above the 50-second API wait. Kill the CLI process after cancellation if it does not exit.
- Decode inline JSON into untrusted values before `west-sales.ts` validates them.
- Reject `manifest.truncated: true` and reject a validated row count other than exactly six.
- Keep the profile and warehouse configuration in server environment variables, not browser assets.
- Store non-secret defaults in `config/demo-runtime.json`: Databricks profile, warehouse ID, catalog, schema, AWS profile, AWS region, host, port, threshold, and freshness hours.
- Let environment variables override each non-secret default.

The constant query prevents a UI value from becoming SQL text. Typed parameters preserve the same boundary inside Databricks.

### 3. Reuse the Harness invocation safely

Add `src/agentcore-harness-client.ts`.

- Move the fixed-version AgentCore SDK lookup from `scripts/invoke-harness.ts` into this module.
- Export an `AgentCoreHarnessClient` that creates `HarnessInvoker` functions.
- Preserve `AWS_PROFILE`, `AWS_REGION`, and one-attempt behavior.
- Create an invocation-only `tools` override for `get_sales_evidence`. Its schema accepts only the selected `event_id` and region `west`.
- Preserve the existing `allowedTools: ["*"]` override only in a named Kimi evidence invocation method.
- Explain in code comments that this override exposes built-in `shell` and `file_operations` tools and adds approximately 900 input tokens of tool-definition overhead per model request.
- Do not edit `config/create-harness.json`, Terraform, `assertHarnessSetup`, or setup tests.

Update `src/harness-tool-cycle.ts`.

- Replace the direct fixture call with an injected `resolveEvidence(input)` function.
- Keep the stream-event parser, exact `get_sales_evidence` name check, malformed-input rejection, and three-iteration default.
- Make the resolver validate the exact selected event ID and region `west`, then return only the selected aggregate. Do not allow record enumeration.

Update `scripts/invoke-harness.ts` to import the reusable client. Preserve its existing direct smoke behavior.

### 4. Add the demo service

Add `src/demo-service.ts`.

- Compose the Databricks adapter, deterministic detector, Harness client, and action store through interfaces.
- Run Databricks validation before a Harness call.
- Return `empty`, `stale`, or `healthy` without calling Kimi.
- For an alert, create one fixed prompt that includes the selected event ID and venue name, but no sales figures. Require the structured evidence tool call.
- Give the injected evidence resolver only that same selected aggregate.
- Treat a Kimi answer with zero structured tool calls as an error. Preserve measured evidence and create no draft.
- Convert a Harness error into an `error` result that preserves measured evidence and creates no draft.
- Save the last successful check in memory for action snapshot validation.

### 5. Add explicit local action state

Add `src/action-state.ts` and `src/action-store.ts`.

- Define `pending`, `approved`, `executing`, `completed`, `failed`, and `unknown` states.
- Define legal transitions and return a domain error for every other transition.
- Compute an idempotency key from alert snapshot, action type, and approved content hash.
- Put load, state validation, idempotency lookup, mutation, and persist inside one in-process action-store queue critical section.
- Write via a temporary sibling file and rename only after a complete JSON write.
- Return the prior completed record when the same idempotency key executes again.
- Treat a known local write failure as `failed`.
- Treat an uncertain write outcome as `unknown` and block automatic retry.
- Keep `outputs/demo-actions.json` ignored and injectable for tests.

### 6. Add the local server and functional UI

Add `src/server.ts`, `public/index.html`, `public/app.js`, and `public/styles.css`.

- Bind only to `127.0.0.1` and set Bun `idleTimeout: 0`.
- Implement the exact API routes in this plan.
- Use Bun's documented `{ dir }` static route for `public/`, with a traversal regression test.
- Accept Host headers only for `127.0.0.1:<configured port>` and `localhost:<configured port>`.
- Follow Variant C hierarchy without reading it at runtime or changing its source files.
- Show the West portfolio rail, evidence panel, Kimi rationale panel, disclosure labels, editable action draft, approval control, and local action log.
- Start with Hayden Homes selected only after a real check selects it.
- Disable actions when a check has no valid alert or the model result failed.
- Keep all operator-entered text local to the browser and local action record.
- Render Kimi text and operator draft text with `textContent` only. Do not use `innerHTML` for either value.
- State that Email and Social are simulations and Dismiss is a local audit record.

### 7. Add controlled data seeding and live verification

Add `scripts/seed-west-sales-demo.ts` and `scripts/verify-west-sales-demo.ts`.

- The seed script performs capture, replacement table seed, view alteration, and view verification only in `workspace.livenation_demo`.
- The seed script generates current timestamps during execution.
- The verification script uses a temporary action-store path.
- The verification script runs the fixed sales check, checks six synthetic West rows, expects Hayden Homes, invokes Kimi once, asserts one structured tool call, approves one simulated action, and proves duplicate execution reuses the original record.
- The verification script removes its temporary action store in a `finally` block.
- Neither script prints credential values.

Update `package.json`.

- Add exact Bun scripts for `dev`, `seed-west-demo`, `verify-west-demo`, and the existing checks.

Update `scripts/validate-setup.ts` and `tests/setup.test.ts`.

- Require Databricks CLI version `1.17.0`.
- Keep the version check local and do not print profile credential values.

Update `README.md`.

- Explain the command-center flow, local startup, required profiles, synthetic boundary, and one live verification command.
- Keep the wildcard built-in-tool risk visible near the Kimi invocation instructions.

### 8. Add focused tests

Add `tests/west-sales.test.ts`, `tests/databricks-sales-adapter.test.ts`, `tests/demo-service.test.ts`, `tests/action-store.test.ts`, and `tests/server.test.ts`.

- Use fakes for Databricks and AgentCore behavior in unit and integration tests.
- Use a temporary action-store location for each test.
- Test every acceptance case in the approved design.
- Test fixed SQL text, typed parameters, row and byte limits, timeout cancellation, subprocess kill behavior, `manifest.truncated`, seven-row rejection, and malformed results.
- Update `tests/harness-tool-cycle.test.ts` for the injected resolver and dynamic West-schema behavior.
- Test that the Harness receives only one selected aggregate and a fixed prompt that requires the tool call.
- Test that edits invalidate approval, duplicate execution preserves the original record, and two concurrent execute requests produce one execution.
- Test local HTTP behavior, disclosure labels, static asset traversal rejection, host rejection, HTML literal-text rendering, and a slow fake that exceeds ten seconds.

## Validation

Run these checks in order:

1. `bun test`.
2. `bun run validate-setup`.
3. `terraform -chdir=infra validate`.
4. `bun run seed-west-demo`.
5. `bun run verify-west-demo`.
6. Start the server on `127.0.0.1`.
7. Check `/`, `/api/state`, and an unknown API route with HTTP requests.
8. Use headless Chrome for desktop and narrow screenshots.
9. Check the visible labels `Live Nation portfolio venue` and `Real venue with synthetic demonstration data`.
10. Check README freshness against the implementation.
11. Run one simplify pass.
12. Repeat affected tests and live verification after the simplify pass.
13. Run one external code review on the final diff.
14. Apply accepted review findings once and repeat affected checks.

The live verification costs one Databricks statement and one Kimi Harness call. The Databricks CLI cold query took 21.8 seconds in this session. The verifier therefore uses a deadline above the API wait. It sends no external message and changes no advertisement.

## Deployment sequence

<!-- fig:deployment-sequence -->

1. Review `terraform -chdir=infra plan` before any infrastructure change.
2. Run the data seed only after pre-write capture completes.
3. Run all tests and the bounded live verification.
4. Keep the local server on loopback for visual review.
5. Commit the application, tests, documentation, and generated plan companion.
6. Push directly to `main` after the required review and checks.

This plan adds no cloud infrastructure. Terraform validation and plan protect the existing Harness from accidental configuration drift.

## Risks and open questions

### Accepted risk: wildcard Harness tools

The Kimi inline-tool handoff needs `allowedTools: ["*"]` in the current Harness configuration.
This exposes built-in `shell` and `file_operations` tools during that model call.
The built-in tool definitions add approximately 900 input tokens to each model request.

The demo reduces the risk through a fixed prompt, selected synthetic aggregate, and no free-form input.
This is not safe for untrusted text or production data.

### Accepted risk: local JSON state

The action audit is a local synthetic file. A process crash can leave an action at `unknown`.
The state machine blocks automatic retry in that state and requires an operator decision.

### Open questions

None. The scope, venue set, truth boundary, model, data contract, and simulated-action boundary are settled.

## Source record

- [Databricks Statement Execution API](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial): typed parameter, inline JSON, polling, cancellation, and statement status behavior.
- [Databricks CREATE TABLE](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-ddl-create-table-using): `CREATE OR REPLACE TABLE` behavior for the demo table.
- [Databricks ALTER VIEW](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-ddl-alter-view): view-definition update behavior without a drop.
- [Databricks Delta restore](https://docs.databricks.com/aws/en/sql/language-manual/delta-restore): table rollback from captured history.
- [AgentCore Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html): inline tool handoff behavior.
- [InvokeHarness API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarness.html): streaming Harness invocation contract.
- [AgentCore Harness security](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-security.html): managed Harness security guidance.
- [Bun HTTP routing](https://bun.com/docs/runtime/http/routing): local Bun server route behavior.

## Review record

External Sonnet 5 supplied repository context. External Opus 5 reviewed the plan.
The verdict is ship with minor revisions.

Accepted corrections:

- Use the exact legacy table and current Statement Execution values.
- Add the runtime configuration file and environment overrides.
- Use the constrained West invocation tool schema and exact selected-event resolver.
- Require one Kimi structured tool call.
- Set Bun `idleTimeout: 0` and test a slow request.
- Raise the statement row limit to 25 while accepting exactly six validated rows.
- Reject unexpected Host headers and render untrusted text with `textContent` only.
- Serialize the complete action-store transaction and test concurrent execution.
- Use Bun static directory routing with traversal coverage.
- Pin Databricks CLI `1.17.0` in validation and tests.
- Record root-profile authority, the Harness-only application path, the 21.8-second cold query, and the built-in tool-definition token overhead.
- Keep captures under `outputs/migrations/`.

No unresolved material finding remains. Do not run a second review for these revisions.
