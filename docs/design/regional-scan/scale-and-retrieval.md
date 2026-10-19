# Scale and retrieval review

Status: review draft. No runtime work occurred.

## Verified evidence on 2026-10-19

The live Silver scope contains 278 accounts, 555 activities, 2,219 tickets, and 9,999 rows across 17 tables. The full evidence is [scale-evidence-2026-10-19.json](scale-evidence-2026-10-19.json).

Repository proof at `f91ff9d` records 10,000 Bronze rows. This is repository proof, not a live Bronze count from this check.

The single-query baseline took 17,809 ms. It returned 57,815 serialized bytes. Ten-account batches reached 2,081 bytes. The six-page keyset probe took 43,791 ms. It returned 278 unique accounts and exactly matched the baseline rows. Its page bytes total 57,820. Both values include CLI work. Cache state was unknown. They support no causal speed comparison. The probe covered CA, OR, and WA. It does not define the approved Northern California seller roster.

The probe had no model, harness, or end-to-end scan. It measured a payload projection, not a complete summary schema, evidence envelope, or judgment quality. Cache state was not measured. These results do not prove production performance or enterprise scale.

The probe read Silver directly under the demo identity. A curated Gold route with a restricted principal needs separate runtime measurement. Source-version metadata permissions also need verification.

## Proposed retrieval flow

The database creates one narrow summary row per approved account. It preaggregates activities and valid paid tickets before account joins. It keeps money separate from tickets and scans.

The recommended path runs one seller-scoped set summary query per scan. It drains one completed statement result into bounded chunks and persists a local ledger. The server pages that ledger by 50 and sends model batches of ten.

The keyset probe is a historical correctness measurement. It is not the recommended default. It did not prove filter pushdown.

The current Statements adapter rejects multi-chunk results. A proposed adapter extension must verify chunk indexes, offsets, completeness, deadline, and bounded disk spooling. It must not follow arbitrary next URLs. A missing chunk returns partial coverage. [Statement result chunks](https://docs.databricks.com/api/workspace/statementexecution/getstatementresultchunkn)

The server persists summaries and evidence once per scan. Every summary retains evidence IDs, source references, units, cutoff, retrieval time, status, and source fingerprint. The model can cite those facts without a detail call. It passes at most ten summaries and 16 KiB of summary input to one model call. The existing 64 KiB tool-response cap remains. The implementation must measure the full envelope.

The model can assess a supported summary directly. It can request bounded recent history or cursor-based older history when needed. It does not repeat evidence already present in the summary.

The server caches evidence, not recommendations, by scope hash, source fingerprint, tool arguments, and cutoff. It invalidates the cache on a source change. It coalesces safe repeated detail requests within one batch.

Fixed retrieval and Genie both use approved seller-scoped views. Genie can support adaptive hypotheses. Natural language does not enforce scope.

## Batch arithmetic

278 accounts produce six server pages of 50 and 28 model batches of ten. This avoids 278 mandatory SQL or Genie calls.

The 600-second cap includes enumeration, fingerprints, retrieval, and model work. Twenty-eight serial batches give a 21.4-second bound before overhead. Two workers give a 42.9-second bound before overhead. After the historical 43.791-second probe, the illustrative bounds are 19.9 seconds serial and 39.7 seconds with two workers. These are not runtime cost estimates, measurements, or an SLA.

The 120 business-call cap counts model-requested calls. Each batch receives `min(12, floor(remaining_calls / remaining_batches))` calls under an atomic global reservation. Zero allowance permits a summary assessment or explicit deferral. The server tracks SQL and version checks separately under the whole deadline and bounded counts.

Two workers are proposed only after isolated sessions, atomic global call reservations, and no concurrent result-store writes. A model may group similar summaries in one prompt. It must not copy a result across accounts.

No top-N early stop exists. A deadline marks every unprocessed account `deferred` and returns partial coverage.

## Growth controls

Do not send raw Silver rows to the model. Do not use per-account full-table aggregations. Do not use a global `LIMIT` that hides accounts.

Do not run manual `OPTIMIZE` or `ANALYZE`. Consider a materialized projection or physical clustering only after profiling identifies a bottleneck and a separate managed-service write approval exists.

Measure query profile, read bytes, shuffle, spill, cache state, model tokens, call count, payload bytes, and wall time. Query caching is not guaranteed. A row limit does not bound SQL bytes scanned.

## Acceptance gates

- Every approved account appears in the persisted roster.
- No account receives a forced `no-action` because of a budget.
- Initial metadata uses set queries and pages, not N+1 account queries.
- The initial path does not require 278 SQL or Genie calls.
- Local fixtures test one times and ten times summary volume.
- UTF-8 caps validate complete JSON. The server bounds whole facts and rows with provenance.
- A 16 KiB overflow splits a batch. One oversized summary becomes unavailable or deferred.
- Results report payload, call, time, and coverage limits.
- A source change starts a fresh scan.

## Sources

- [Databricks query profile](https://docs.databricks.com/aws/en/sql/user/queries/query-profile)
- [Databricks query caching](https://docs.databricks.com/aws/en/sql/user/queries/query-caching)
- [Databricks optimizations](https://docs.databricks.com/aws/en/optimizations/)
