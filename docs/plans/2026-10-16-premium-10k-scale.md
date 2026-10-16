# Premium scale: safe, resumable Harbor Works expansion

<!-- chips:Tier 1 data mutation|1 of 277 bundles complete|64 Bronze / 63 Silver|10,000 Bronze target -->

**Status: the first live apply completed.** Bundle `premium-scale-v1-0001` added 36 records. The current workspace has 64 Bronze envelopes and 63 accepted Silver rows. One of 277 scale bundles is complete. No later bundle was applied. The foundation has a verified, owned data contract. The loader adds bounded synthetic batches only. It does not change the contract.

The completed proof reports $490 admission revenue, $75 parking revenue, 11 valid admission tickets, and two admission buyers. The A100 premier option remains `E200` / `premier-parking` / quantity 12 / price $40. The next default dry run selects `premium-scale-v1-0002` through `premium-scale-v1-0008`, or 252 records. Predictive Optimization is inherited. No manual `OPTIMIZE` or `ANALYZE` command ran.

<!-- digest:start -->
The loader grows the verified foundation from 28 Bronze and 27 Silver rows to exactly 10,000 Bronze and 9,999 Silver rows. The first verified batch reached 64 Bronze and 63 Silver rows. It applies one deterministic batch at a time, and it stops after every batch for proof.
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
- A 10,000-record single write, autofill loop, background worker, or `OPTIMIZE` after each batch.
- A new source system, real customer data, and cloud changes outside the stated five Bronze and 15 Silver tables.

## Risk tier and write boundary

**Tier 1 applies.** This work mutates a live managed dataset. A bad batch can change reports and analytics. The loader must preserve prior accepted rows and must stop before a foreign object, changed row, or incomplete proof can cause a later write.

The write set is limited to the five owned Bronze tables: `salesforce_raw`, `ticketmaster_raw`, `artist_catalog_raw`, `inventory_raw`, and `finance_raw`. The scale generator writes no finance envelope, so `finance_raw` remains unchanged. The accepted scale rows write only to these 15 non-finance Silver tables: `accounts`, `contacts`, `identity_links`, `contracts`, `activities`, `entitlements`, `orders`, `order_items`, `tickets`, `scans`, `venues`, `events`, `artists`, `artist_relations`, and `inventory_snapshots`.

The runner must allow only prepared read queries and insert-only `MERGE` statements into these owned tables. It must reject `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, DDL, `CREATE OR REPLACE`, ownership actions, permissions actions, and `OPTIMIZE`.

## Verified context

### Verified facts

- The foundation plan records two verified complete runs. It records 28 Bronze envelopes, 27 accepted Silver rows, one expected `AC-E-BAD` rejection, 17 Silver entities, and six Gold objects.
- The foundation uses five Bronze tables and 17 Silver tables. Gold reads the 15 operational Silver tables and excludes `event_financials` and `artist_deal_terms`.
- The foundation preserves `A100` tools. Gold objects use global source data. A scale load therefore increases Gold result sets without a Gold definition change.
- The foundation contract stores source and batch IDs, payload hashes, and natural keys. It uses insert-only `MERGE` and fails a changed matching payload.
- The existing plan names `src/premium-foundation.ts` and `scripts/setup-premium-databricks.ts` as the pure validation and bounded CLI patterns.
- `DESCRIBE SCHEMA EXTENDED ln_premium_silver` shows inherited Predictive Optimization is enabled from the metastore.
- Bundle `premium-scale-v1-0001` completed with 36 new records. Its proof reports 64 Bronze envelopes, 63 accepted Silver rows, and Gold metrics of $490 admission revenue, $75 parking revenue, 11 valid admission tickets, and two admission buyers.
- The A100 premier option remains `E200` / `premier-parking` / quantity 12 / price $40.
- No manual `OPTIMIZE` or `ANALYZE` command ran.

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

`--apply` selects only the next unapplied batch. The first apply selects one bundle. The next 39 applies select at most seven consecutive bundles, or 252 envelopes. The final, forty-first apply selects three bundles, or 108 envelopes. A command must never loop until the 10,000 target or fill missing batches automatically.

The runner acquires a local exclusive lock before it reads the journal. It stores aggregate state at `outputs/premium-scale/execution-state.json` and each run under `outputs/premium-scale/runs/`. Every output file uses mode `0600`. The journal retains prior batches and stores the batch IDs, deterministic input hash, statement IDs, preflight evidence, terminal state, and post-batch proof. It marks a batch ready only after all checks pass.

Before the first statement submission, the runner persists the selected bundle IDs and input hash. It may submit only that exact selection. Each submitted statement requires a persisted statement ID and a terminal status. On resume, the runner submits only missing statements for the saved selection. A lost statement ID blocks the run until an operator reconciles the target state. The runner must not select a new batch during this recovery.

On `SIGINT` or `SIGTERM`, the runner stops new submissions. It waits on active statements until a short deadline, requests cancellation after that deadline, and records the terminal or unknown state. An unknown submission or terminal state blocks retry until reconciliation proves the batch content and counts.

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

### 3. Bronze, then current-batch Silver

For each selected batch, insert verified current-batch envelopes only. Query and compare Bronze hashes before each merge. Derive Silver candidates only from those envelopes. Validate all candidate natural keys and referential keys before the first Silver merge.

Do not write finance records. Do not issue schemas, table DDL, view DDL, grants, or view replacement. Do not rewrite earlier Silver batches. Stop on a changed target value, a truncated result, a server failure, or an unproven statement state.

### 4. Post-batch proof and journal publication

After all current-batch merges, query Bronze and Silver totals. Verify `28 + 36 × (prior_ready_bundle_count + selected_bundle_count)` Bronze envelopes and `27 + 36 × (prior_ready_bundle_count + selected_bundle_count)` accepted Silver rows. Verify the selected batch has exactly its selected bundle count times 36 rows in Bronze and Silver.

Verify each Gold grain and Gold finance exclusion. Retain A100 evidence checks, but do not capture all Gold rows after scale. Compare the current batch Silver oracle to the deterministic generator oracle. The scale loader owns cumulative metrics. Publish the ready journal entry only after every check succeeds. A completed but unpublished run verifies its exact saved content and proof, then publishes without a rewrite or a count increment.

### 5. Tests and guide

Focused tests cover deterministic bundles, exact composition, no finance rows, accepted local relationships, duplicate-key rejection, changed-hash rejection, batch selection, first-batch limit, seven-bundle limit, final three-bundle limit, no-autofill behavior, journal recovery, lock behavior, signal bounds, and cumulative oracle derivation. They test bundle one and all 277 bundles. They test bounded A100 brief and options, the attention summary, verifier metrics, and interruption after Bronze, during Silver, and after writes before publication.

The [beginner guide](../data/premium-10k-scale.md) gives dry-run, one-batch apply, post-batch verification, stop, and reconciliation commands. It states that an operator runs each later command manually. It documents no loop to reach 10,000 automatically.

## Validation and first live apply

1. The complete local test suite passed 231 tests, zero failures, 813 assertions, and 35 files in 19.39 seconds.
2. The live apply for `premium-scale-v1-0001` completed. It added 36 records. Its proof reports 64 Bronze envelopes, 63 accepted Silver rows, and Gold metrics of $490, $75, 11, and 2.
3. The A100 premier option remains `E200` / `premier-parking` / quantity 12 / price $40.
4. The next default dry run selects `premium-scale-v1-0002` through `premium-scale-v1-0008`. It selects 252 records.
5. No later bundle was applied. One of 277 scale bundles is complete.
6. Predictive Optimization remains inherited. No manual `OPTIMIZE` or `ANALYZE` command ran.
7. Apply selected later bundles manually. Confirm each selection contains no more than seven bundles.
8. At the final selection, confirm it contains three bundles and reaches exactly 10,000 Bronze and 9,999 Silver rows.
9. Recheck the 15 operational Silver tables only in Gold lineage. Confirm finance remains excluded.

## Local plan review

Build the standalone digest with `bun docs/plans/premium-10k-scale-view/build.ts`. Serve the live digest with `systemd-run --user --unit=codex-premium-10k-scale-plan --property=MemoryMax=256M --property=RuntimeMaxSec=4h --working-directory=/home/elijahstraight/repos/livenation-demo bun docs/plans/premium-10k-scale-view/serve.ts`. The server binds only to `127.0.0.1:4195`. Review `/`, `/full`, and `/raw` before implementation.

## Risks and open questions

- **Cost risk:** Predictive Optimization can use billed serverless capacity. The plan avoids duplicate manual maintenance and records the inherited setting.
- **Risk:** A locally interrupted apply can leave an unknown cloud statement state. The journal and reconciliation step prevent a blind retry from duplicating or changing data.
- **Risk:** Gold global queries grow as scale batches load. The cumulative generator oracle prevents a stale, foundation-only expected value from masking a wrong result.
- **Risk:** The local lock cannot prevent another host from writing. Exact batch and key reconciliation protects this runner, but it does not provide distributed coordination.

## Platform sources

- [Delta MERGE](https://docs.databricks.com/aws/en/delta/merge) describes source-key uniqueness for merge behavior.
- [Statement Execution API tutorial](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial) describes statement submission, polling, and cancellation.
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
