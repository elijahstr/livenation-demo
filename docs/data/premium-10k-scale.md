# Premium 10k scale guide

## Current status

The implementation is complete. The live apply for `premium-scale-v1-0001` completed. It added 36 records. The current workspace has 64 Bronze envelopes and 63 accepted Silver rows. One of 277 scale bundles is complete. No later bundle was applied.

The scale loader preserves the foundation. It targets exactly 10,000 Bronze envelopes and 9,999 accepted Silver rows.

The completed batch proof recorded Gold metrics of $490 admission revenue, $75 parking revenue, 11 valid admission tickets, and two admission buyers. The A100 premier option remains `E200` / `premier-parking` / quantity 12 / price $40.

## What the loader does

The loader adds 9,972 valid envelopes in 277 deterministic bundles. Each bundle has 36 envelopes.

The first apply loads one bundle. Each later apply loads at most seven bundles, or 252 envelopes. The final apply loads three bundles.

You run 41 commands in total. Run each command manually. Do not use a loop.

Predictive Optimization is inherited and enabled. No manual `OPTIMIZE` or `ANALYZE` command ran. Do not run either command.

## Run the dry run

Run this command first. It makes no Databricks call.

```sh
systemd-run --user --wait --collect --property=MemoryMax=768M --property=MemorySwapMax=0 --working-directory=/home/elijahstraight/repos/livenation-demo timeout --kill-after=2s 10s bun scripts/setup-premium-scale.ts
```

The dry run prints the selected bundle IDs, record count, and allowed write scope. The next default selection is `premium-scale-v1-0002` through `premium-scale-v1-0008` with 252 envelopes.

## Run one apply

Run this command for the next manual apply. Use the same command for each later manual apply.

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
