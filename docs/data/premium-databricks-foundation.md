# Premium Databricks foundation operational guide

## Current workspace

**Foundation verification completed.** The foundation contributes 28 Bronze envelopes and 27 accepted Silver rows. This is historical evidence. The completed scale load now brings the current workspace to 10,000 Bronze envelopes and 9,999 accepted Silver rows across all 277 scale bundles.

## Purpose and scope

This reviewed setup creates a small synthetic Premium data foundation in the `workspace` catalog.

- Bronze has five managed Delta tables and 28 raw envelopes.
- Salesforce data is synthetic source data. The setup has no Salesforce connector.
- Silver has 17 tables and 27 accepted rows. Bronze and the local validation report retain the rejected `AC-E-BAD` source with `unknown venue`.
- Gold has five ordinary views and one `sales_metrics` metric view.
- The write scope excludes `workspace.livenation_demo`. Its before-and-after metadata comparison passed for `current_sales_evidence` and `show_sales_snapshots`.
- The two Finance tables are illustrative. Gold does not read them.
- Seller grants, OAuth, Genie, and MCP are not configured.

The runner uses only these schemas:

- `workspace.ln_premium_bronze`
- `workspace.ln_premium_silver`
- `workspace.ln_premium_gold`

## Scale compatibility

The foundation is compatible with the Premium 10k scale loader. A foundation rerun compares rows, payload hashes, and counts only for the foundation `BATCH_ID`.

Do not capture unbounded global Gold rows during a foundation rerun. The foundation manifest remains historical evidence. The scale loader owns cumulative metrics and post-batch proof.

The scale loader preserves the 28 Bronze envelopes, 27 accepted Silver rows, and one `AC-E-BAD` rejection. The foundation counts remain historical. The current cumulative workspace counts are 10,000 Bronze envelopes and 9,999 accepted Silver rows. See the [Premium 10k scale guide](premium-10k-scale.md).

## Label migrations

Run each label migration as a local dry run before an apply. The dry run makes no Databricks call.

```sh
bun run migrate-premium-labels
bun run migrate-premium-venue-labels
```

Apply company and artist labels first. Apply venue labels second.

```sh
bun run migrate-premium-labels --apply
bun run migrate-premium-venue-labels --apply
```

Both migrations use matched `MERGE` updates. They do not insert rows. The venue migration verifies one foundation venue and 277 scale venues in Bronze and Silver.

If an apply stops, correct the reported count or equality mismatch. Rerun the same command after the source state is correct. The matched updates and equality checks make the rerun safe.

## Run the safe local check

Run this command first:

```sh
timeout --kill-after=2s 5s bun scripts/setup-premium-databricks.ts
```

This is the default dry run. It validates the fixture and prints the proposed scope. It makes no Databricks CLI call.

The apply path writes or verifies managed objects in the reviewed scope: the three listed schemas only.

```sh
timeout --kill-after=45s 25m bun scripts/setup-premium-databricks.ts --apply
```

## Safety behavior

The runner accepts only fixed schema, table, and view names. It rejects a statement that refers to `workspace.livenation_demo` or uses a forbidden write verb.

The CLI drains standard output and standard error at the same time. Each stream has a 2 MiB cap.

Each query submits with a zero-second wait. The runner polls for up to 120 seconds. It then requests cancellation and polls for a terminal result for 30 more seconds.

The runner records a pending statement in a local journal before polling. An unknown submission or result requires reconciliation. Do not retry. Do not delete the lock without first checking the recorded process and statement state.

The apply path uses a local exclusive lock. It writes a pending journal and a per-run failure record. The local manifest is evidence only. Live object state controls preflight.

The preview service has a four-hour limit and a 256 MiB memory limit. Use bounded host commands for local checks. Stop it with `systemctl --user stop ln-premium-foundation-preview.service`.

## First apply and rerun behavior

Before a write, the runner checks ownership markers, object type, columns, existing keys, payload hashes, and Silver business values. It stops on a foreign object, changed content, an unexpected candidate, or a second rejection.

The only expected rejection is `AC-E-BAD` with `unknown venue`. The runner derives Silver candidates from all Bronze data before it writes Silver rows.

The runner writes a local validation report and then creates Gold views. It publishes the local manifest last.

On a full rerun, matching content hashes cause zero DDL and zero data writes. Delta versions remain evidence metadata. A new version alone does not change the result.

The first completed verification wrote zero DDL and zero data rows. A prior setup had already created all objects before a metadata compatibility fix.

## Check the metric view

The verified first run returned the expected values from the fully qualified metric view and a canonical oracle query:

```sql
SELECT
  MEASURE(net_admission_revenue) AS net_admission_revenue,
  MEASURE(net_parking_revenue) AS net_parking_revenue,
  MEASURE(valid_admission_tickets) AS valid_admission_tickets,
  MEASURE(admission_buying_accounts) AS admission_buying_accounts
FROM workspace.ln_premium_gold.sales_metrics;
```

Both foundation queries returned `300.00`, `40.00`, `3`, and `1` in that order. These are foundation-only historical values. The final independent scale proof reports current Gold metrics of $45,180.00 admission revenue, $9,360.00 parking revenue, 1,899 valid admission tickets, and 273 admission buyers.

The A100 premier option remains `E200` / `premier-parking` / `box_office` / quantity 12 / $40.00. Predictive Optimization is inherited. No manual `OPTIMIZE` or `ANALYZE` command ran.

## Test status

The final full local test run has 237 passing tests, zero failures, 833 assertions, and 35 files.

## Live result record

| Check | Result |
| --- | --- |
| Apply run ID and manifest path | `2026-10-16T19-51-23.186Z`; manifest published `true`; stable hash `51bed0dea2084923df7e572ad64f154d685bfbeb3af226e597e2bdc3fc4aa404` |
| Bronze rows and content hashes | Five Bronze tables; 28 raw envelopes; every Bronze and Silver table content check passed |
| Silver rows and rejected source | Seventeen tables; 27 accepted rows; `AC-E-BAD` rejected as `unknown venue` |
| Gold dependencies and view definitions | Six Gold objects: five views and one `METRIC_VIEW`; all grain checks passed; no Finance source reference |
| Metric view result and explicit oracle result | Both returned `300.00`, `40.00`, `3`, `1` |
| Full rerun writes, DDL, and content hashes | Second run `2026-10-16T19-56-14.670Z` published `true`, wrote zero rows, and matched the first full stable object and stable hash exactly. Bronze remained 28, Silver remained 27, and all four metric values remained unchanged. |
| First scale batch | Historical: `premium-scale-v1-0001` added 36 records. Its proof reported 64 Bronze envelopes, 63 accepted Silver rows, and Gold metrics of $490, $75, 11, and 2. |
| Completed scale load | Current: all 277 scale bundles are ready. The final proof reports 10,000 Bronze, 9,999 Silver, 278 total batch IDs, 277 scale batch IDs, and Gold metrics of $45,180.00, $9,360.00, 1,899, and 273. |
| Managed maintenance | Predictive Optimization is inherited. No manual `OPTIMIZE` or `ANALYZE` command ran. |
| Warehouse auto-stop state | The warehouse is running with zero active sessions and a ten-minute auto-stop. Idle stop is not yet observed. |
| Remaining limitation | Seller permissions, OAuth, Genie, MCP, and application connection to this data are not configured. Finance rows are illustrative. |

All 22 Delta tables show version `1`: one creation and one insert. This is first-run evidence, not proof of the pending rerun comparison.

## Observed compatibility fixes

The runner accepts a successful DDL response with zero result columns. It also reads the metric YAML ownership marker from `TableInfo.comment`, where Databricks stores it.

## Sources

- [Delta MERGE](https://docs.databricks.com/aws/en/delta/merge) documents source-key uniqueness requirements for merge operations.
- [Predictive Optimization](https://docs.databricks.com/aws/en/optimizations/predictive-optimization) documents inherited managed maintenance behavior.
- [Statement Execution API](https://docs.databricks.com/api/workspace/statementexecution/executestatement) documents statement submission and status retrieval.
- [Get a table](https://docs.databricks.com/api/uc-tables/v1/get-table) documents the returned TableInfo shape, including `comment` and `METRIC_VIEW`.
- [Metric view YAML syntax](https://docs.databricks.com/aws/en/uc-semantics/metric-views/yaml-reference) documents the YAML `comment` field.
- [Statement Execution API](https://docs.databricks.com/api/workspace/statementexecution/executestatement) documents `INLINE` and `JSON_ARRAY` result format.
