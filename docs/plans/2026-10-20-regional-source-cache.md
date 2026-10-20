# Regional source-state cache

Status: implemented Tier 2 change. Read-only source-cache verification passed. Browser verification reached all services and ended partial. The final review reported approve with minor fixes; focused checks address the accepted rulings.

## Goal

Replace 31 sequential SQL metadata statements with one version query and two catalog reads. Reuse account summaries only when the source remains unchanged.

Before this change, one source fingerprint needed 31 sequential SQL metadata statements. The historical 448.989-second scan spent 373.762 seconds in source checks, or 83.245 percent of its elapsed time. This is a measured baseline, not a predicted future result.

<!-- fig:source-state-flow -->

## Scope

The implementation reads Unity Catalog metadata through the configured local Databricks CLI profile. It does not write cloud resources, tables, triggers, Change Data Feed configuration, or source data.

It does not add Databricks push notifications, a remote event subscriber, a model-assessment cache, a TTL freshness rule, budget changes, model changes, deadline changes, lock changes, or cloud writes.

It retains checks at scan start, before each batch publication, and scan end. A check can discover a concurrent writer only at these boundaries. These checks detect inconsistency after reads; they do not pin a multi-table source snapshot.

## Verified facts

- Before this change, the fingerprint watched 14 tables and three Gold view definitions. It emitted 17 progress traces and used 31 sequential SQL metadata statements.
- A live probe showed that `DESCRIBE DETAIL` cannot be used as a SQL subquery. The parser failed.
- A live probe showed that `DESCRIBE HISTORY` works as a subquery. The accounts version was 44. Databricks documents the form `FROM (DESCRIBE HISTORY table_name)` in its table-history guidance, under the `OPTIMIZE` identification example.
- The Unity Catalog list-tables API returns table identity and type fields. The API can paginate, can return empty pages, and does not promise order.
- A read-only live probe returned all 14 numeric Delta versions from one `UNION ALL` query. Gold metadata returned all three `view_definition` fields. The query plus Gold metadata read took 22.340 seconds. Its statement ID was `01f1ccc2-f174-10ce-acf9-1498e4f10285`. This was the first full probe, not a performance promise.
- Databricks documents the [list-tables API](https://docs.databricks.com/api/uc-tables/v1/list-tables.md) and [table history](https://docs.databricks.com/aws/en/tables/history). The latter includes the exact phrase `FROM (DESCRIBE HISTORY table_name)`.
- `wait_timeout: "0s"` starts an immediate poll path. `10s` can return a completed statement without a poll. Databricks documents this behavior in its [SQL execution tutorial](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial).

## Locked decisions

- Use two paginated Unity Catalog list-tables reads: one Silver schema read and one Gold schema read.
- Call each schema list with `max_results=0`, `omit_columns=true`, `omit_properties=true`, and `omit_username=true`. Follow every encoded `next_page_token`, including after an empty result page. Limit each schema to ten pages and metadata to 1 MiB per response and per full traversal.
- Ignore catalog objects outside the fixed manifest before semantic validation or hashing. Require the 14 watched Silver sources to be managed Delta tables. Reject only a repeated manifest identity, malformed manifest object, missing required source, unexpected manifest type, repeated token, or truncated traversal.
- Use one SQL statement with `UNION ALL` across the 14 Delta tables. Each branch is `SELECT '<name>' source_name, CAST(max(version) AS STRING) version FROM (DESCRIBE HISTORY workspace.ln_premium_silver.<name>)`.
- Form a canonical source state from sorted fully-qualified identity, table ID, Delta version, and the hash of each Gold view definition. Include the existing scope hash and local implementation and skill hashes.
- Cache one latest complete validated business-summary array, bounded at 2 MiB. A historical pre-change array used 1,757,570 bytes. One verified post-change array used 1,916,371 bytes. Keep the SQL result limit at 1 MiB and the evidence limit at 64 KiB.
- Key the in-memory cache by exact canonical fingerprint and per-`RegionalData` scope: configured profile and warehouse ID. Clone the array on store and return. Do not cache evidence, options, analytics, or model assessment output.
- Preserve original `retrieved_at` and evidence query IDs in a cache hit. Bind the current `scan_id` and `served_at` before return.
- Keep a summary tentative after its initial read. Promote it only after a later authoritative check in the same scan returns the same fingerprint. Clear the cache after any detected version change or metadata-check failure. Never reuse partial, unavailable, malformed, or truncated summaries.
- Compare an in-scan state with `context.fingerprint`. Emit `source_changed` only for that actual in-scan mismatch. Compare a start state with the last verified state separately and emit `source_cache_invalidated`; this does not make the new scan mixed.
- Expose source notifications through trace data and the existing mixed/deferred flow. Do not restore a generic user-interface notice.
- Derive every `RegionalStatements` submit wait from its request timeout: `min(10, floor((timeoutMs - 4,000) / 1,000))` seconds. Send `0s` when the result is below five seconds. After a terminal submit response, check abort and deadline state before return. Preserve total deadlines, unknown-submission quarantine, cancellation, and reconciliation.

## Architecture

`RegionalData` owns a new source-state helper. The helper calls Unity Catalog through the existing local CLI request seam, then calls `RegionalStatements` once for all required Delta versions.

The helper validates metadata before it hashes it. It sorts identities before it hashes them. This prevents pagination order from causing a false change.

The helper returns one complete state or an error. It never turns missing metadata into a zero version. `RegionalData.fingerprint` converts a complete state into the existing `SourceFingerprint` contract and records query IDs and timings for trace evidence.

Each source-check boundary always performs two live metadata lists and one live history SQL query. The cache stores only a complete validated business-summary array after this authoritative state check. A cache hit avoids a repeated business-summary SQL read. It never skips metadata or version validation.

`regional-app.ts` adds a typed `metadataRequest` dependency through the guarded reader factory. Before every metadata GET, its wrapper calls `authorize()` and `runtime.assertAvailable()`. It permits only `api get /api/2.1/unity-catalog/tables` with `catalog_name=workspace` and the fixed Silver or Gold schema name through `URLSearchParams`.

The metadata GET is idempotent. The wrapper does not create a warehouse remote-until record or an unknown-outcome quarantine for it. Production wiring uses the configured profile only. Tests inject deterministic paginated replies and statement results.

## Files and implementation tasks

1. Add `src/regional-source-state.ts`.
   - Define the expected Silver and Gold object manifest, canonical record types, validation errors, list-page parser, ten-page traversal, metadata byte limits, and view-definition hash.
   - Keep the manifest near the summary SQL sources. Make the table list explicit and stable.
   - Filter extra catalog objects before validation. Require one managed Delta table record for each history branch and three expected Gold views with definitions.
   - Include the local source-state implementation hash and relevant skills hashes in canonical input. Use existing hash utilities where possible.

2. Change `src/regional-data.ts`.
   - Replace per-object `DESCRIBE DETAIL`, `DESCRIBE HISTORY`, and `SHOW CREATE TABLE` fingerprint reads with the helper.
   - Build one fixed `UNION ALL` history query for the 14 Silver Delta sources.
   - Store a cloned 2 MiB summary array only after a later same-scan check confirms the initial fingerprint. Rebind cached output for the current `ReadContext`. Keep `scan_id`, `served_at`, `retrieved_at`, query IDs, and trace provenance distinct.
   - Emit one completion progress event with `completed: 17` and `total: 17` after validation. Emit two metadata-call traces separately. Compare in-scan state with `context.fingerprint` and emit `source_changed` only after an actual mismatch.
   - Clear cache after a changed version or check failure.

3. Change `src/regional-types.ts` only as required.
   - Add typed metadata request and source-state traces, including `source_cache_invalidated`. Preserve existing public scan envelopes unless a new trace field needs exposure.

4. Change `src/regional-app.ts` only as required.
   - Add the typed authenticated local metadata request. Call `authorize()` and `runtime.assertAvailable()` before every fixed, query-string-validated catalog GET.
   - Do not create a warehouse remote-until record or unknown outcome quarantine for the idempotent metadata GET.
   - Do not add a route, credential surface, or client notification.

5. Change `src/regional-statements.ts`.
   - Derive the submit `wait_timeout` from the actual request timeout for every regional statement. Use `0s` when fewer than five safe wait seconds remain.
   - Check abort and deadline state after a terminal submit response. Keep all current deadline reserve, cancellation, and unknown-outcome handling unchanged.

6. Update focused tests.
   - Replace tests that assert the retired per-object statements.
   - Add metadata pagination tests for query-string encoding, an empty page, a next token, extra objects, duplicate manifest objects, a missing object, malformed fields, permission failure, blocked runtime, abort, deadline reserve, byte limits, ten-page limit, and repeated token.
   - Add cache tests for tentative admission, later same-scan promotion, equal state reuse, table recreation with a changed table ID, Delta version change, Gold definition change, local-rule hash change, scope/profile/warehouse separation, cache clearing, cloned values, and no reuse of partial results.
   - Add statement tests for adaptive wait values, the tight-budget `0s` path, terminal-submit abort handling, and unchanged cancellation or unknown submission behavior.

## Failure behavior

Metadata permission failure, malformed metadata, a required-object mismatch, history query failure, abort, deadline exhaustion, or pagination uncertainty makes the fingerprint unknown. The scan keeps its current fail-closed behavior and does not publish a combined claim.

A changed canonical state during a scan clears source summaries and makes that scan mixed. A start-state difference invalidates the old cache but does not make the new scan mixed. A stable state can reuse only a promoted complete cached summary. A source state does not cache model output or model assessment evidence.

## Verification plan

Focused tests and the final full suite passed: 306 tests, zero failures, 2,422 expectations, 44 files, and 21.07 seconds. `git diff --check` also passed.

Run the existing independent code review after implementation. The implementation needs no additional plan decision.

The configured Databricks CLI profile completed a read-only source-cache probe. It recorded six metadata GETs, three history queries, one business-summary query, 278 cache hits, preserved retrieval dates and query IDs, and rebound scan IDs. It made no cloud writes. The structured record is [live verification](../design/regional-source-cache/live-verification-2026-10-20.json).

The first source check took 34.794 seconds. The confirmation and later check took 10.945 and 10.298 seconds. The summary cache miss took 12.377 seconds. The cache hit took 9 milliseconds. These measurements occurred before the progress-write reduction. They do not prove an equivalent complete scan, coverage, or cost.

After the review fixes, a second read-only probe recorded six metadata traces, three completion progress events, 278 cache hits, preserved retrieval dates and evidence, and rebound scan IDs. Its source checks took 33.285, 10.481, and 9.876 seconds. Its one summary query took 2.923 seconds and its cache hit took 9 milliseconds. Its array used 1,914,703 bytes. Array size varies by probe scan IDs, so it is a measurement, not a permanent value. The [post-review record](../design/regional-source-cache/post-review-verification-2026-10-20.json) contains the structured proof.

The browser initiated scan `4b5c5c99-76ac-4b19-96ad-667041285fd6` through the local server, Databricks, and AgentCore. It ran for 131.433 seconds and ended partial with six assessed and 272 deferred accounts. Three source checks completed in 13.123, 10.716, and 10.253 seconds. The final check remained unavailable because an existing runtime quarantine followed a model maximum-token error.

The scan completed four SQL statements and four model invocations. Three accounts deferred after incomplete JSON, three after the maximum-token error, and 266 after quarantine. The local reservation ledger recorded $11.062592. This is not an actual bill, and the $13 admission limit did not stop the scan. The source-cache change did not alter the 2,048-token limit, model errors, or quarantine rules. Full coverage and actual costs remain unknown. The [browser record](../design/regional-source-cache/browser-verification-2026-10-20.json) contains the full evidence.

Prove cache invalidation with deterministic unit tests and read-only probes. Do not create, alter, update, or drop a Databricks table.

Run one bounded browser scan. Compare source-check count and duration with the verified baseline. Report only measured results. Do not promise a full scan: the current scan cap remains 13 dollars and the existing deadline remains authoritative.

Verify that the browser uses the existing partial or mixed flow if a test source change occurs. Do not add a generic notice.

## Risks and limits

The three live source calls produce the main reduction. The in-memory cache helps only a later unchanged scan. It cannot make the source immutable between checks. A writer can change a table after a check and before the next check.

The live probe supplied all required Gold `view_definition` fields. Future malformed or incomplete list responses still fail closed.

No permanent remote event subscriber exists. The application discovers changes only when it performs its existing check.

## Review record

The independent factual review used `claude-sonnet-5-5`. The independent judgment review used `claude-opus-5-5`. Auxiliary CLI metadata used `claude-haiku-5-5`.

The review first returned needs-material-revision. This revision accepts findings 1 through 9. It accepts the documented `DESCRIBE HISTORY` subquery correction in finding 10. The implementation remains fail closed if a future parser rejects the live-probed form.

The final code review used the same Sonnet, Opus, and auxiliary Haiku provenance. It returned approve with minor fixes. The owner accepted its empty-page parser rule, metadata traces, one completion progress event, and focused test additions. The focused checks and final local suite passed after those fixes. This does not claim a second Opus review after the fixes. The managed-only source contract matches the setup script and the fresh live probe: all 14 watched sources are managed. It does not support external sources without a new decision. Unity Catalog table IDs remain distinct from Delta IDs. [Databricks `SET LOCATION` documentation](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-ddl-alter-table) records the managed and external table distinction.

## Review handoff

The independent plan review must inspect canonicalization, pagination completion, cache scope, cache invalidation, and fail-closed behavior. The code review must inspect the final diff, live evidence, trace provenance, and unchanged cancellation behavior.
