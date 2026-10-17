# Premium scale: safe, resumable Harbor Works expansion

<!-- chips:Tier 1 data mutation|Completed: 277 of 277 scale bundles|10,000 Bronze / 9,999 Silver|Final dry run complete -->

**Status: completed.** All 277 scale bundles are ready. The final state has an empty selection, no pending statement, and `publishedAt` `2026-10-17T02:51:44.603Z`. The final local dry run returns `mode: "complete"` with zero cloud calls. The supervisor returned `success`, used 130.3 MiB peak memory, and used zero swap. It retained seven-bundle children and one final three-bundle child. The foundation has a verified, owned data contract. The loader did not change the contract.

The independent final proof reports 10,000 Bronze envelopes, 9,999 accepted Silver rows, 278 total batch IDs, and 277 scale batch IDs. It reports $45,180.00 admission revenue, $9,360.00 parking revenue, 1,899 valid admission tickets, and 273 admission buyers. The A100 option remains `E200` / `premier-parking` / `box_office` / quantity 12 / $40.00. Predictive Optimization is inherited. No manual `OPTIMIZE` or `ANALYZE` command ran.

<!-- digest:start -->
The loader grew the verified foundation from 28 Bronze and 27 Silver rows to exactly 10,000 Bronze and 9,999 Silver rows. The completion supervisor applied one verified child at a time. It stopped only after the final three-bundle child and the complete dry run.
<!-- digest:end -->

<!-- fig:scale-flow -->

## Goal

Add a safe scale loader for the existing Premium Databricks teaching dataset. The loader adds 9,972 valid envelopes in 277 deterministic bundles of 36 envelopes. It preserves the Harbor Works foundation batch and its one expected rejection.

The final state has exactly 10,000 Bronze envelopes and 9,999 accepted Silver rows. The foundation contributes 28 Bronze envelopes, 27 accepted Silver rows, and one rejected event. The scale loader contributes 9,972 accepted Bronze and Silver envelopes. It has no rejected scale envelope.

## Scope

### Included

- `src/premium-scale.ts`, `scripts/setup-premium-scale.ts`, focused tests, and a scale-run guide.
- Insert-only data writes to the five existing Bronze tables and the 15 non-finance Silver tables.
- Deterministic local generation, preflight, apply, journal, cancellation, and post-batch proof.
- Existing Gold objects as read-only validation targets. Their global result sets grow with accepted scale rows.

### Excluded

- Schema DDL, table DDL, view replacement, Gold definition changes, seller permissions, grants, principals, and finance rows.
- A 10,000-record single write, general autofill loop, background worker, or `OPTIMIZE` after each batch. The authorized completion supervisor is the one temporary exception.
- A new source system, real customer data, and cloud changes outside the stated five Bronze and 15 Silver tables.

## Risk tier and write boundary

**Tier 1 applies.** This work mutates a live managed dataset. A bad batch can change reports and analytics. The loader must preserve prior accepted rows and must stop before a foreign object, changed row, or incomplete proof can cause a later write.

The write set is limited to the five owned Bronze tables: `salesforce_raw`, `ticketmaster_raw`, `artist_catalog_raw`, `inventory_raw`, and `finance_raw`. The scale generator writes no finance envelope, so `finance_raw` remains unchanged. The accepted scale rows write only to these 15 non-finance Silver tables: `accounts`, `contacts`, `identity_links`, `contracts`, `activities`, `entitlements`, `orders`, `order_items`, `tickets`, `scans`, `venues`, `events`, `artists`, `artist_relations`, and `inventory_snapshots`.

The runner must allow only prepared read queries and insert-only `MERGE` statements into these owned tables. It must reject `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, DDL, `CREATE OR REPLACE`, ownership actions, permissions actions, and `OPTIMIZE`.

## Verified context

### Verified facts

- The independent final proof records 10,000 Bronze envelopes, 9,999 accepted Silver rows, 278 total batch IDs, and 277 scale batch IDs.
- The final proof records statement IDs `01f1c9d5-e7a2-1588-a3c8-d2df8f0dec78`, `01f1c9d5-e8bd-1388-a759-6c75979326de`, `01f1c9d5-e9e1-1a9e-94e2-e9fd0f7153f2`, and `01f1c9d5-eb00-150b-bb08-78196b001020`.
- The final state has an empty selection, no pending statement, and `publishedAt` `2026-10-17T02:51:44.603Z`.
- The final local dry run returns `mode: "complete"` and makes zero cloud calls.
- The completion supervisor returned `success`. Its peak memory was 130.3 MiB and it used zero swap. It retained seven-bundle children and one final three-bundle child.
- The first supervisor launch exited 127 before a Databricks CLI process or cloud submission. The systemd user environment omitted `/home/elijahstraight/.local/bin`. The corrected launch exported the proven local `PATH` before it checked the CLI.
- The foundation plan records two verified complete runs. It records 28 Bronze envelopes, 27 accepted Silver rows, one expected `AC-E-BAD` rejection, 17 Silver entities, and six Gold objects.
- The foundation uses five Bronze tables and 17 Silver tables. Gold reads the 15 operational Silver tables and excludes `event_financials` and `artist_deal_terms`.
- The foundation preserves `A100` tools. Gold objects use global source data. A scale load therefore increases Gold result sets without a Gold definition change.
- The foundation contract stores source and batch IDs, payload hashes, and natural keys. It uses insert-only `MERGE` and fails a changed matching payload.
- The existing plan names `src/premium-foundation.ts` and `scripts/setup-premium-databricks.ts` as the pure validation and bounded CLI patterns.
- `DESCRIBE SCHEMA EXTENDED ln_premium_silver` shows inherited Predictive Optimization is enabled from the metastore.
- Bundle `premium-scale-v1-0001` completed with 36 new records. Its proof reports 64 Bronze envelopes, 63 accepted Silver rows, and Gold metrics of $490 admission revenue, $75 parking revenue, 11 valid admission tickets, and two admission buyers.
- The A100 premier option remains `E200` / `premier-parking` / quantity 12 / price $40.
- No manual `OPTIMIZE` or `ANALYZE` command ran.
- Historical recovery evidence selected ordinals 9 through 15 with input hash `3221b6dc2ae6727d5068ea6b6eccb8a67f3ef76affc3d926eedf2610d928be66`. Its pending statement was `Count selected artists candidates` with ID `01f1c9b9-c74b-1692-b446-fa6ab25010ae` and state `SUCCEEDED`.
- After bundle 0036, the saved execution state has ready ordinals 1 through 36 and no selected ordinals. It proves 1,324 Bronze envelopes and 1,323 accepted Silver rows.
- Detached services for bundles 0016 through 0022, 0023 through 0029, and 0030 through 0036 completed. Their peak memory was 68.8 MiB, 66.0 MiB, and 59.3 MiB. Each service used zero swap.
- The systemd user environment omitted `/home/elijahstraight/.local/bin`. A proof unit with that environment ran `command -v databricks` and exited 127 in one millisecond.
- The failed supervisor stopped at `Verify inherited Predictive Optimization`. It saved selected ordinals 37 through 43 and a pending item without `statementId`. It stopped before a statement ID and before any write. No Databricks CLI process or cloud submission occurred.
- During saved bundles `premium-scale-v1-0009` through `premium-scale-v1-0015`, observed cancellation and rejection behavior was consistent with status GET transport failures after statement IDs were recorded. Later status evidence reported one statement as `CANCELED` and one as `SUCCEEDED`. The transport cause remains an inference.
- Before this fix, the `DatabricksStatements.execute` catch path set `timedOut` after any transport error that occurred after it received a statement ID. It therefore did not distinguish a failed status GET from an execution deadline.
- The Databricks [Get statement API](https://docs.databricks.com/api/workspace/statementexecution/getstatement) states that `wait_timeout: "0s"` returns a statement ID with a `PENDING` state. It also states that Databricks retains terminal statements for at least 12 hours.

### Inferences to verify during implementation

- The existing table metadata, ownership markers, columns, and candidate keys still match the foundation contract.
- The current stored Gold definitions still match their recorded hashes and still exclude finance.
- The current statement executor supports the same bounded submit, poll, cancellation, and result-limit behavior used by the foundation.

## Locked decisions

### Deterministic 36-envelope bundle

Each bundle is keyed by zero-padded ordinal and has one seed. The ID format is `premium-scale-v1-0001` through `premium-scale-v1-0277`. The generator derives every source ID, natural key, timestamp, payload, and SHA-256 hash from the version and ordinal. The same ordinal must always produce byte-identical canonical envelopes.

Each valid bundle has exactly 36 envelopes:

| Domain | Envelope composition | Count |
| --- | --- | ---: |
| Salesforce | account, contact, identity link, contract, two activities, two entitlements | 8 |
| Artist catalog | venue, two artists, relation, two events | 6 |
| Ticketmaster | two orders, four order items, eight tickets, six scans | 20 |
| Inventory | two snapshots | 2 |
| Finance | none | 0 |
| **Total** |  | **36** |

The generator assigns CA, OR, and WA venues. It emits both past and future events. It includes cancelled and refunded line cases, duplicate scans, and rejected scans. These cases add business complexity, but every generated envelope passes validation and enters Silver.

The foundation batch remains separate. It retains `AC-E-BAD` as the only rejected source record. No scale batch can reuse its IDs or alter its payload.

### Bounded application protocol

The default command is dry run. It validates the target batch, prints the exact object and record scope, and makes no Databricks CLI call.

`--apply` selects only the next unapplied batch. The first apply selects one bundle. The next 39 applies select at most seven consecutive bundles, or 252 envelopes. The final, forty-first apply selects three bundles, or 108 envelopes. A normal command must never loop until the 10,000 target or fill missing batches automatically.

### Authorized completion supervisor

The user instruction dated 2026-10-17 overrides the no-outer-loop operational decision for this completion run only: “Continue until all 10,000 records are added.” The supervisor starts at bundle 0037. It does not widen an individual batch.

The supervisor starts one child apply at a time. Each child runs the existing `scripts/setup-premium-scale.ts --apply` command. Each child keeps all existing preflight, journal, `MERGE`, Gold proof, and state-publication gates.

Each child has a 25-minute timeout. The detached supervisor service has `MemoryMax=768M`, `MemorySwapMax=0`, and `RuntimeMaxSec=4h`. It waits 30 seconds after each successful child. It stops after any nonzero child exit.

After each child, the supervisor requires empty `selectedOrdinals`. It requires `readyOrdinals` to increase by exactly `min(7, 277-prior_ready_count)`. It rejects a ready count above 277. At ready count 277, it runs the local dry run and requires `mode: "complete"`. It permits at most 40 iterations.

The supervisor sent each child JSON result to the systemd journal. The launch command detached the supervisor from the terminal. The following temporary script completed this one bounded scale load.

```bash
#!/usr/bin/bash
set -euo pipefail

export PATH=/home/elijahstraight/.local/bin:/home/elijahstraight/.bun/bin:/usr/local/bin:/usr/bin:/bin
export HOME=/home/elijahstraight

ROOT=/home/elijahstraight/repos/livenation-demo
BUN=/home/elijahstraight/.bun/bin/bun
JQ=/usr/bin/jq
TIMEOUT=/usr/bin/timeout
SLEEP=/usr/bin/sleep
RUNNER=/home/elijahstraight/repos/livenation-demo/scripts/setup-premium-scale.ts
STATE=/home/elijahstraight/repos/livenation-demo/outputs/premium-scale/execution-state.json
MAX_READY=277
MAX_ITERATIONS=40

verify_state() {
  "$JQ" -e '
    type == "object" and
    (.selectedOrdinals | type == "array") and
    (.readyOrdinals | type == "array") and
    ([.selectedOrdinals[] | type] | all(. == "number")) and
    ([.readyOrdinals[] | type] | all(. == "number")) and
    (.selectedOrdinals == []) and
    (.readyOrdinals as $ready | $ready == [range(1; ($ready | length) + 1)])
  ' "$STATE" >/dev/null
}

command -v databricks >/dev/null

iteration=0
while [ "$iteration" -lt "$MAX_ITERATIONS" ]; do
  verify_state
  before_ready="$("$JQ" -er '.readyOrdinals | length' "$STATE")"
  if [ "$iteration" -eq 0 ]; then [ "$before_ready" -eq 36 ]; fi
  if [ "$before_ready" -eq "$MAX_READY" ]; then
    dry_json="$($BUN "$RUNNER")"
    printf '%s\n' "$dry_json"
    printf '%s\n' "$dry_json" | "$JQ" -e '.mode == "complete"' >/dev/null
    exit 0
  fi

  expected_increment=$((MAX_READY - before_ready))
  if [ "$expected_increment" -gt 7 ]; then expected_increment=7; fi
  iteration=$((iteration + 1))

  set +e
  child_json="$($TIMEOUT --signal=INT --kill-after=45s 25m "$BUN" "$RUNNER" --apply)"
  child_status=$?
  set -e
  printf '%s\n' "$child_json"
  if [ "$child_status" -ne 0 ]; then exit "$child_status"; fi
  printf '%s\n' "$child_json" | "$JQ" -e . >/dev/null

  verify_state
  after_ready="$("$JQ" -er '.readyOrdinals | length' "$STATE")"
  [ "$after_ready" -le "$MAX_READY" ]
  [ "$after_ready" -eq "$((before_ready + expected_increment))" ]

  if [ "$after_ready" -lt "$MAX_READY" ]; then "$SLEEP" 30; fi
done

exit 1
```

Launch the planned script only through this detached service command:

```bash
/usr/bin/systemd-run --user --no-block --unit=premium-scale-completion-supervisor --collect --property=MemoryMax=768M --property=MemorySwapMax=0 --property=RuntimeMaxSec=4h --working-directory=/home/elijahstraight/repos/livenation-demo /usr/bin/bash /tmp/livenation-premium-scale-completion-supervisor.sh
```

### Historical launch failure and reconciliation

The original supervisor service did not export the interactive user PATH. Its proof unit could not find `databricks`. It exited 127 in one millisecond. The runner stopped at `Verify inherited Predictive Optimization` before it created a statement ID or made a write. No Databricks CLI process or cloud submission occurred.

The historical reconciliation saved a `0600` forensic copy. It then atomically restored the prior published state in the same state directory. The restored state deleted `pending`, set `selectedOrdinals` to `[]`, and set `inputHash` to `59cab8a1ea1056bf11604721c55686a5ef4dbde52a5f28c555dd4cf36bda0f3`.

Before the corrected launch, verify that `readyOrdinals` is exactly 1 through 36, `selectedOrdinals` is an empty array, `pending` is absent, and the local lock is absent. The corrected script exports `PATH` and `HOME`, retains the absolute Bun path, and tests `command -v databricks >/dev/null` before it verifies state.

The runner acquires a local exclusive lock before it reads the journal. It stores aggregate state at `outputs/premium-scale/execution-state.json` and each run under `outputs/premium-scale/runs/`. Every output file uses mode `0600`. The journal retains prior batches and stores the batch IDs, deterministic input hash, statement IDs, preflight evidence, terminal state, and post-batch proof. It marks a batch ready only after all checks pass.

Before the first statement submission, the runner persists the selected bundle IDs and input hash. It may submit only that exact selection. Each submitted statement requires a persisted statement ID and a terminal status. On resume, the runner submits only missing statements for the saved selection. A lost statement ID blocks the run until an operator reconciles the target state. The runner must not select a new batch during this recovery.

On `SIGINT` or `SIGTERM`, the runner stops new submissions. It waits on active statements until a short deadline, requests cancellation after that deadline, and records the terminal or unknown state. An unknown submission or terminal state blocks retry until reconciliation proves the batch content and counts.

### Status-poll transport recovery

A submit transport failure before the client records a statement ID remains an unknown submission. The runner blocks retry until an operator reconciles the target state.

The local retry `try` block wraps only the status GET. It does not wrap submit work, event work, journal work, state work, cancellation, or reconciliation.

After the client records a statement ID, a status GET failure retries only that GET. It must not resubmit the statement. Before each retry, it checks `signal.aborted`. An abort reports an interrupted result and follows the existing cancel-and-reconcile path. The retry sleeps between GET calls and uses the existing per-statement execution deadline.

Each statement writes at most one generic `poll_retry` journal event. The event has `failure_class: "poll_transport"`. The event contains no transport error text, command output, stack, or diagnostic detail. The existing statement ID record provides the statement reference.

The deterministic configured-output-limit error does not retry. It enters cancel-and-reconcile immediately. An `onEvent` or journal failure does not retry. It also enters cancel-and-reconcile immediately.

When the execution deadline expires, the client keeps the current timeout behavior. It requests cancellation and performs bounded terminal reconciliation. Signal abort behavior remains unchanged.

This change does not alter the write set, execution timeout values, batch size, or SQL.

### Preflight and idempotency

Before the first write, the pure module validates all selected envelopes. It checks frozen metadata, allowed record types, canonical JSON hashes, source keys, natural keys, money precision, local relationships, foreign references, duplicate keys, and every hash. It checks the complete selected set before any Bronze or Silver statement.

The apply runner then verifies exact target metadata and ownership. It rejects an absent expected marker, a foreign object, changed type, changed required column, extra candidate key, changed Bronze hash, or changed Silver business value. It reads current and prior batch journal state. It reconciles an interrupted batch before it selects any next batch.

Every Bronze and Silver write uses insert-only `MERGE`. Its match key is the stable source key or natural business key plus batch identity where the foundation contract requires it. A matching identical row is a no-op. A matching changed row is a hard failure. A repeat of a ready batch writes no data.

Silver derives only from the current validated Bronze batch. It must not recompute or rewrite previous batches. The runner validates all Silver natural and referential keys before the first Silver write.

### Analytics and Genie contract

After each applied batch, the runner checks exact total Bronze and Silver counts, exact counts for the current batch, and expected Gold grains. It keeps the fixed A100 evidence checks and checks a batch-scoped Silver oracle against the deterministic generator oracle. It does not collect a full global Gold result set. Every verification query returns at most 1,000 rows. Aggregate counts and hashes run in the warehouse. Detailed result reads are limited to the current batch, which has at most 252 envelopes. The scale loader owns cumulative metric evidence for actual ready bundles plus the preserved foundation.

The verifier obtains expected global metrics from an independent fixed `regional_sales` Gold oracle at runtime. The generator supplies the expected result for the current ready-bundle count. It must never hardcode `300`, `40`, `3`, or `1`. Genie SQL examples must show query shape only. They must not contain literal expected output values.

The A100-specific tools remain intact. `find_options` first limits `upcoming_options` to event IDs in `A100` `account_event_benefits`. It then excludes exact owned products. Scale events do not appear as A100 options. The Gold views are global, so tests and documentation must state that Gold grows with loaded bundles.

Replace the unbounded `readAccountAttention` scan with a fixed one-row summary. The summary returns account count and maximum latest activity time. It does not return account rows. This keeps scale verification bounded.

### Predictive Optimization decision

Do not run manual `OPTIMIZE` or `ANALYZE` at 250-envelope batches or at the final 10,000-envelope state. Verified inherited Predictive Optimization queues `OPTIMIZE`, `VACUUM`, and `ANALYZE`, and gathers write statistics. Manual commands can add billed serverless work without a measured need. The final report records the inherited state and avoids a manual action.

## Implemented changes

### 1. Pure scale module

`src/premium-scale.ts` is complete. It contains deterministic bundle construction, canonical serialization, hash calculation, envelope validation, batch selection, cumulative oracle calculation, and fixed SQL builders. It contains no CLI, credential, shell, or cloud access.

Use a versioned seed and ordinal to make IDs disjoint from foundation IDs. Define all natural keys explicitly. Build all cross-record references within each bundle. Keep date generation explicit so every event has CA, OR, or WA venue context and the set has past and future events.

The module must produce the scale counts from the composition table. It must reject a bundle when the count differs from 36. It must produce exact expected Bronze and Silver totals from the actual count of ready scale bundles.

### 2. Bounded setup runner

`scripts/setup-premium-scale.ts` is complete. It reuses the safe foundation statement-client pattern. The command accepts dry run by default and requires `--apply` for every mutation.

Implement a batch selector that reads the local journal and target reconciliation evidence. It selects one initial batch on the first apply. The next 39 applies select at most seven ready-to-run consecutive bundles. The final selection has three bundles. It must print the selected IDs and exact envelope count before any write.

Run metadata, ownership, key-set, hash, and journal preflight before mutable SQL. Persist the exact selected IDs and input hash before the first submission. Use the foundation table allowlist. Send source JSON through a request file and typed parameter. Do not interpolate payload JSON into shell text. Record statement IDs and bounded failure text without credentials.

The foundation comparison code is complete. It scopes foundation rows, hashes, and counts to `BATCH_ID`. It does not capture unbounded global Gold rows. The foundation manifest remains historical. The scale loader owns cumulative metrics and batch proof.

### 2a. Statement-poll transport recovery

`src/databricks-statements.ts` will distinguish an unknown submit outcome from a status GET failure. Before it records a statement ID, a submit failure remains unknown and blocks retry. After it records an ID, the local retry handler wraps only the status GET. It retries that GET while the existing execution deadline remains.

The client checks the abort signal before every retry and reports interruption through the existing cancel-and-reconcile path. It sleeps before every retry. The configured-output-limit failure and `onEvent` or journal failures enter cancel-and-reconcile immediately. The deadline path will still request cancellation and use the existing bounded reconciliation poll. The journal callback will emit at most one generic `poll_retry` event with `failure_class: "poll_transport"`. It will not include an error message, stack, command output, or credentials.

`tests/databricks-statements.test.ts` will add a case where one failed status GET is followed by `SUCCEEDED`. The test will prove that the client does not cancel or resubmit the statement. It will add a case where repeated failed status GET calls reach the deadline. The test will prove that the client requests cancellation and obtains a terminal reconciliation state. It will add abort-during-GET, `onEvent` failure, and configured-output-limit cases. These tests will prove that none of those cases retries the status GET.

`scripts/setup-premium-databricks.ts` and `src/premium-tools.ts` share `DatabricksStatements`. Focused tests will include `tests/premium-setup.test.ts` and `tests/premium-tools.test.ts`. They will prove that the shared callers retain their bounded deadline and abort behavior.

### 3. Bronze, then current-batch Silver

For each selected batch, insert verified current-batch envelopes only. Query and compare Bronze hashes before each merge. Derive Silver candidates only from those envelopes. Validate all candidate natural keys and referential keys before the first Silver merge.

Do not write finance records. Do not issue schemas, table DDL, view DDL, grants, or view replacement. Do not rewrite earlier Silver batches. Stop on a changed target value, a truncated result, a server failure, or an unproven statement state.

### 4. Post-batch proof and journal publication

After all current-batch merges, query Bronze and Silver totals. Verify `28 + 36 × (prior_ready_bundle_count + selected_bundle_count)` Bronze envelopes and `27 + 36 × (prior_ready_bundle_count + selected_bundle_count)` accepted Silver rows. Verify the selected batch has exactly its selected bundle count times 36 rows in Bronze and Silver.

Verify each Gold grain and Gold finance exclusion. Retain A100 evidence checks, but do not capture all Gold rows after scale. Compare the current batch Silver oracle to the deterministic generator oracle. The scale loader owns cumulative metrics. Publish the ready journal entry only after every check succeeds. A completed but unpublished run verifies its exact saved content and proof, then publishes without a rewrite or a count increment.

### 5. Tests and guide

Focused tests cover deterministic bundles, exact composition, no finance rows, accepted local relationships, duplicate-key rejection, changed-hash rejection, batch selection, first-batch limit, seven-bundle limit, final three-bundle limit, no-autofill behavior, journal recovery, lock behavior, signal bounds, and cumulative oracle derivation. They test bundle one and all 277 bundles. They test bounded A100 brief and options, the attention summary, verifier metrics, and interruption after Bronze, during Silver, and after writes before publication. They also test one failed status GET followed by `SUCCEEDED` without cancellation, and repeated failed status GET calls that reach the execution deadline, request cancellation, and reach terminal reconciliation.

The [beginner guide](../data/premium-10k-scale.md) gives dry-run, one-batch apply, post-batch verification, stop, and reconciliation commands. Normal operation requires manual later commands. The authorized completion supervisor is the one temporary exception.

## Completion validation

1. The final proof reports 10,000 Bronze envelopes and 9,999 accepted Silver rows.
2. The final proof reports 278 total batch IDs and 277 scale batch IDs.
3. The final proof reports $45,180.00 admission revenue, $9,360.00 parking revenue, 1,899 valid admission tickets, and 273 admission buyers.
4. The A100 option remains `E200` / `premier-parking` / `box_office` / quantity 12 / $40.00.
5. The final state has an empty selection, no pending statement, and `publishedAt` `2026-10-17T02:51:44.603Z`.
6. The final dry run returns `mode: "complete"` and makes zero cloud calls.
7. The completion supervisor returned `success`, used 130.3 MiB peak memory, and used zero swap.
8. The final full local test result has 237 pass, 0 fail, 833 assertions, and 35 files.
9. Predictive Optimization remains inherited. No manual `OPTIMIZE` or `ANALYZE` command ran.

## Historical launch record

The first supervisor launch exited 127 before it ran a Databricks CLI process or submitted cloud work. Its systemd user environment omitted `/home/elijahstraight/.local/bin`.

The corrected supervisor exported the proven local `PATH` before it checked the CLI. It retained the seven-bundle child limit and a final three-bundle child. It completed successfully.

This failure is historical. It did not change the final published state.

## Decision log

| Decision | Override source | Effect |
| --- | --- | --- |
| Bounded sequential completion supervisor | User instruction, 2026-10-17: “Continue until all 10,000 records are added.” | Replaces the no-outer-loop decision for this one completion run. It preserves every individual-batch gate. |

## Local plan review

Build the standalone digest with `bun docs/plans/premium-10k-scale-view/build.ts`. Serve the live digest with `systemd-run --user --unit=codex-premium-10k-scale-plan --property=MemoryMax=256M --property=RuntimeMaxSec=4h --working-directory=/home/elijahstraight/repos/livenation-demo bun docs/plans/premium-10k-scale-view/serve.ts`. The server binds only to `127.0.0.1:4195`. Review `/`, `/full`, and `/raw` before implementation.

## Risks and open questions

- **Cost risk:** Predictive Optimization can use billed serverless capacity. The plan avoids duplicate manual maintenance and records the inherited setting.
- **Risk:** A locally interrupted apply can leave an unknown cloud statement state. The journal and reconciliation step prevent a blind retry from duplicating or changing data.
- **Risk:** Gold global queries grow as scale batches load. The cumulative generator oracle prevents a stale, foundation-only expected value from masking a wrong result.
- **Risk:** The local lock cannot prevent another host from writing. Exact batch and key reconciliation protects this runner, but it does not provide distributed coordination.
- **Risk:** A transient status GET failure can cause an unnecessary cancellation after a statement exists. The bounded retry keeps the same statement and deadline. It prevents a transport fault from changing an in-progress statement result.
- **Concern:** The CLI wrapper does not classify status errors. A permanent status GET failure waits until the existing deadline. This behavior is accepted because the deadline is bounded.
- **Risk:** Databricks retains terminal statements for at least 12 hours. Recovery evidence can expire after that period. The observed recovery completed within the retention window.

## Platform sources

- [Delta MERGE](https://docs.databricks.com/aws/en/delta/merge) describes source-key uniqueness for merge behavior.
- [Get statement API](https://docs.databricks.com/api/workspace/statementexecution/getstatement) describes terminal-statement retention and `wait_timeout: "0s"` return behavior.
- [Statement Execution API tutorial](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial) describes status GET polling and cancellation.
- [Managed tables](https://docs.databricks.com/aws/en/tables/managed) describes managed table behavior.
- [Metric views](https://docs.databricks.com/aws/en/uc-semantics/metric-views/basic-modeling) describes the semantic query target. Recheck all platform behavior at implementation time.
- [Predictive Optimization](https://docs.databricks.com/aws/en/optimizations/predictive-optimization) describes managed `OPTIMIZE`, `VACUUM`, `ANALYZE`, write statistics, and serverless cost behavior.

## Review record

The external Sonnet 5.5 context pass completed. The Opus 5.5 review exceeded its 180-second limit with exit code 124 and no result. A separate Codex GPT-6 Astra fallback review found three P2 findings. The implementation accepts them.

| Finding | Accepted implementation | Files and tests |
| --- | --- | --- |
| Consumer compatibility | A100 options use `account_event_benefits` before global options. The attention query returns one summary row. Global metrics use a runtime oracle. | `src/premium-tools.ts`, `scripts/setup-premium-scale.ts`, `tests/premium-tools.test.ts`, `tests/premium-scale-runner.test.ts` |
| Explicit resume state | The journal saves selected bundle IDs and the input hash before submission. Resume uses only that saved selection. A missing statement ID requires operator reconciliation. | `scripts/setup-premium-scale.ts`, `tests/premium-scale-runner.test.ts` |
| Completed-unpublished recovery | Recovery verifies saved content and proof, then publishes without another write or count increment. | `scripts/setup-premium-scale.ts`, `tests/premium-scale-runner.test.ts` |
