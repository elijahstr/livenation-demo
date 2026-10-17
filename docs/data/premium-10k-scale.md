# Premium 10k scale guide

## Current status

**Completed:** all 277 scale bundles are ready. The published state has an empty selection, no pending statement, and `publishedAt` `2026-10-17T02:51:44.603Z`. The final local dry run returns `mode: "complete"` with zero cloud calls.

The independent final proof reports 10,000 Bronze envelopes, 9,999 accepted Silver rows, 278 batch IDs, and 277 scale batch IDs. It reports $45,180.00 admission revenue, $9,360.00 parking revenue, 1,899 valid admission tickets, and 273 admission buyers.

The final proof statement IDs are `01f1c9d5-e7a2-1588-a3c8-d2df8f0dec78`, `01f1c9d5-e8bd-1388-a759-6c75979326de`, `01f1c9d5-e9e1-1a9e-94e2-e9fd0f7153f2`, and `01f1c9d5-eb00-150b-bb08-78196b001020`.

The completion supervisor returned `success`. Its peak memory was 130.3 MiB and it used zero swap. It retained seven-bundle children and one final three-bundle child.

The A100 option remains `E200` / `premier-parking` / `box_office` / quantity 12 / $40.00. Predictive Optimization remains inherited. No manual `OPTIMIZE` or `ANALYZE` command ran.

Historical note: the first supervisor launch exited 127 before a Databricks CLI process or cloud submission. Its systemd user environment omitted `/home/elijahstraight/.local/bin`. The corrected launch exported the proven local `PATH` before it checked the CLI.

## What the loader does

The loader adds 9,972 valid envelopes in 277 deterministic bundles. Each bundle has 36 envelopes.

The first apply loads one bundle. Each later child apply loads at most seven bundles, or 252 envelopes. The final child apply loads three bundles.

Normal operation uses manual commands. The temporary completion supervisor is historical. It kept the seven-bundle child limit and used one final three-bundle child.

Predictive Optimization is inherited and enabled. No manual `OPTIMIZE` or `ANALYZE` command ran. Do not run either command.

## Run the dry run

Run this command first. It makes no Databricks call.

```sh
systemd-run --user --wait --collect --property=MemoryMax=768M --property=MemorySwapMax=0 --working-directory=/home/elijahstraight/repos/livenation-demo timeout --kill-after=2s 10s bun scripts/setup-premium-scale.ts
```

The final dry run reports `mode: "complete"`. It selects no bundles and makes zero cloud calls.

## Run one apply

Run this command for one manual apply. The authorized supervisor uses the same child command. It does not combine child applies.

```sh
systemd-run --user --wait --collect --property=MemoryMax=768M --property=MemorySwapMax=0 --working-directory=/home/elijahstraight/repos/livenation-demo timeout --kill-after=45s 25m bun scripts/setup-premium-scale.ts --apply
```

The command records state in `outputs/premium-scale/execution-state.json`. It stores each run under `outputs/premium-scale/runs/`.

The command creates a local lock before it reads state. The journal records the selected bundles, input hash, preflight evidence, statement IDs, terminal states, and post-batch proof.

## Check a completed batch

Read the newest run proof after each apply.

```sh
find outputs/premium-scale/runs -name proof.json -print | sort | tail -n 1
```

The proof must show exact Bronze and Silver totals. It must show the current-batch count and the cumulative metric oracle.

The loader also checks A100 safely. It confirms one A100 attention summary row. It confirms the `E200` `premier-parking` option with quantity 12 and price $40.

## Stop and recover

Use `Ctrl-C` to stop a local command. The runner stops new statement submissions and records statement state.

Do not delete the local lock. First review the recorded process and statement state.

```sh
cat outputs/premium-scale/execution-state.json
find outputs/premium-scale/runs -name '*.json' -print | sort
```

If a statement ID is missing or its state is unknown, reconcile the Databricks statement and target batch before another apply. Resume only the saved bundle selection. Do not select a new batch during recovery.

## Foundation behavior

The foundation rerun checks only its `BATCH_ID` rows, hashes, and counts. It does not capture unbounded global Gold rows.

The foundation manifest is historical evidence. The scale loader owns cumulative metrics and batch proof.

## References

- [Delta MERGE](https://docs.databricks.com/aws/en/delta/merge)
- [Predictive Optimization](https://docs.databricks.com/aws/en/optimizations/predictive-optimization)
- [Statement Execution API](https://docs.databricks.com/api/workspace/statementexecution/executestatement)
