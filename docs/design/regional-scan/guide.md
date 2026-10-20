# Regional scan guide

## Start here

The Premium workspace connects a regional scan, account details, and separate account conversations. Open `/premium` on the local demo server.

This independent demo uses synthetic business data. It does not send customer messages, hold inventory, or make purchases.

**Verification status:** The live browser flow passed at desktop and mobile sizes on October 20, 2026. The suite passed 268 tests. Sonnet and Opus completed both review stages. The material findings are resolved.

The scan assessed 12 accounts and deferred 266 in 448.989 seconds. All 278 accounts remained available. Two accounts completed live evidence retrieval and follow-up analytics through separate conversations. This result proves the complete seller flow, with partial regional assessment.

The roster contains 278 explicit account and venue pairs. The user assigned all 94 California accounts to Northern California on October 20, 2026. Oregon has 92 accounts. Washington has 92 accounts. The application does not infer Northern California from state codes.

The [implementation plan](../../plans/2026-10-20-regional-account-flow.md) records the resolved decisions, source checks, and review rulings. This guide remains the documentation entry point.

<!-- fig:rolesflow -->

## How it works

1. Select **Scan now**.
2. Read the actual source-check and assessment progress.
3. Use the account search, status filter, or 50-account pages.
4. Open an account to inspect its identity, relationship, activities, benefits, and assessment.
5. Send a question to that account's agent after the scan finishes.
6. Select **Back to scan** to return to the saved results.

Every approved account remains visible. An account without an assessment has a deferred or unavailable state and an explanation.

A scan can finish with partial coverage. The interface never converts deferred accounts into successful assessments. Source changes invalidate the comparison and mark the scan mixed.

Each account has its own conversation. The server binds its session, runtime session, actor, tools, and account scope. The interface stores each conversation separately and rejects late display updates for another account.

The browser retains conversations within the current page. A page reload, server restart, or session expiry requires a new conversation. Saved scan results survive a page reload and server restart.

The activity source has dates and types. It does not supply message bodies or contact direction. The interface states these limits.

## Evidence and investigation

SQL supplies repeated facts. The real AgentCore agent chooses useful investigations and proposes a seller action or question.

The agent has three tools: account evidence, option snapshots, and account analytics. The server controls account IDs, venue scope, SQL templates, parameters, and result limits.

Analytics supports activity counts, latest activity, net purchase amounts, qualifying issued tickets, benefit quantities, order-line counts, and historical accepted ticket uses. It supports only the documented dataset and group combinations.

The new flow does not use Genie. The user approved this change because Genie can execute generated SQL before the application receives it. The separate legacy Genie chat remains available. [Genie conversation API](https://docs.databricks.com/api/genie/v1/genie-start-conversation)

The source cutoff is October 16, 2026. It differs from retrieval time. Historical inventory does not prove current availability. Three accepted ticket uses do not prove three separate events.

Evidence includes source records, query IDs, units, and dates. Failed or incomplete retrieval remains distinct from absent records. The server never accepts a citation from another account.

## Reliability

| Control | Behavior |
| --- | --- |
| Scope | Explicit, versioned 278-account allowlist; query identity remains the approved synthetic demo identity. |
| Concurrency | One shared cloud-operation lock covers scan, account chat, detail reads, and legacy agent requests. |
| Scan time | At most 600 seconds, including source checks and cleanup. |
| Account batch | Three accounts; at most 180 seconds. |
| Business calls | At most 120 per scan; cache hits count. Each batch receives its fair remaining share, capped at 12. |
| Model invocation | Existing Kimi route, 40-second timeout, 2,048 output-token ceiling, no retries. |
| Account chat | At most three evidence calls per turn; twenty turns and thirty-minute idle expiry per session. |
| Query result | At most 1,000 rows and 1 MiB. Completed result chunks require index, offset, and count validation. |
| Tool evidence | At most 50 records and 64 KiB. Omitted evidence has a partial marker. |
| Cost admission | Accrued AWS cost plus conservative local charges and the next reservation must remain below $13. |

A source fingerprint records relevant Delta table IDs and versions, Gold view definitions, scope, skills, and implementation hashes. The service checks it at scan start, before each batch commit, and at scan end.

These checks consume scan time. The service reserves time for the final check and defers work that cannot fit. A later scan prioritizes previously deferred accounts when scope and source match. It does not reuse the previous judgments.

An interrupted scan retains its ledger. Resume requires the original deadline and the same source fingerprint. An expired scan requires a new scan. A remote operation with an unknown outcome can block further cloud work until reconciliation.

The application cache holds only complete fixed evidence inside one scan. Every reuse checks account authorization and the last verified source fingerprint. A live source check still precedes batch publication. The cache retains original retrieval time and adds service time. It does not cache natural-language analytics or share inventory across scans.

## Decisions

- Use the explicitly approved 278-account roster and territory assignment.
- Retain the existing demo identity with server-enforced scope.
- Use server-controlled analytics instead of Genie in this flow.
- Rank useful seller actions today.
- Reveal results after a validated batch commit.
- Run manual scans while the business snapshot remains frozen.

## Measurements

The October 20 source check returned 278 account envelopes in **29.133 seconds**. This measures one SQL summary, not the complete agent flow.

The existing test baseline had 237 passing tests. After review corrections, the integrated suite passed 268 tests with zero failures and 903 expectations.

The real scan returned 12 assessed accounts, 266 deferred accounts, and no unavailable accounts. It completed in 448.989 seconds with stable source versions. It made five model invocations and one agent-selected evidence call.

Four scan invocations reported 37,664 input tokens and 2,884 output tokens. One invocation omitted token usage. These totals exclude the missing usage.

Source checks took 56.527 to 87.697 seconds each. They consumed most of the scan time and limited assessment coverage. The scan executed 176 SQL statements, including metadata checks. A later scan prioritizes the deferred accounts.

Browser checks opened A100, SC0001-A, SC0004-A, SC0034-A, and SC0276-A. Pagination exposed all 278 unique accounts. A100 and SC0001-A each completed an evidence turn and an analytics follow-up. Account switches preserved separate messages, including late responses. The scan results remained available.

The interface passed visual checks at 1440 × 1000 and 390 × 844. Neither width had document overflow. The partial notice remained visible in account views. The application console had no errors or warnings.

The browser could not retain the second SC0001-A network response body. Its completed reply and citations remained visible. A separate CLI read confirmed the cited query succeeded with one email and one call.

The complete scan and chat proof used 13 model invocations. Eight reported 48,824 input tokens and 3,606 output tokens. Five omitted usage. All omitted provider cache metrics.

The local ledger retained $8.306688 in model reservations and estimated $0.15 in Cost Explorer request fees. The $8.456688 total is conservative reserved exposure, not a measured bill. The last Cost Explorer result was approximately zero, with possible reporting delay. Actual complete AWS and Databricks costs remain unavailable.

The [live verification record](live-verification-2026-10-20.json) contains coverage, source-check times, citations, session IDs, usage totals, and review provenance.

A metadata probe measured one table identity command at 2.007 seconds, one history command at 2.275 seconds, and one view definition command at 2.046 seconds. These examples do not guarantee the duration of every source check.

The scan records elapsed time, coverage, tool calls, query traces, and raw model usage. Missing usage and cache metrics remain unknown. Databricks billing is unavailable through the AWS cost check.

AWS lists the selected Kimi route at $0.60 per million input tokens and $3.00 per million output tokens. The price check date is October 20, 2026. Estimates are not bills. [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)

Cost Explorer can lag. The persistent local ledger reserves conservative cost before each invocation and retains the reservation when usage is incomplete. It does not claim a real-time cloud billing guarantee. [Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-exploring-data.html)

## Reference

- [Current implementation plan and review rulings](../../plans/2026-10-20-regional-account-flow.md)
- [Live browser and cloud verification](live-verification-2026-10-20.json)
- [Approved interface reference](../../prototypes/premium-sales/index.html)
- [Versioned roster](../../../config/regional-scan-scope.json)
- [Earlier architecture record](architecture-decisions.md)
- [Earlier retrieval contracts](retrieval-contracts.md)
- [Earlier scale evidence](scale-evidence-2026-10-19.json)
- [Evidence judgment skill](skills/sales-evidence-judgment/SKILL.md)
- [Regional review skill](skills/regional-sales-review/SKILL.md)
- [AgentCore trace guide](../../../infra/README.md#read-a-conversation-trace)

Earlier design documents describe the prior Genie proposal. The current plan and this guide supersede that route and the unresolved roster choices.

## Recover a blocked local session

Confirm that every affected cloud request has ended before you clear a remote block.

1. Stop the local server.
2. Read the affected scan trace under `outputs/regional-scans`.
3. For each recorded statement ID, read its status through the configured CLI.
4. Cancel an active statement only when the trace identifies it as this demo's request.
5. Confirm a terminal status: `SUCCEEDED`, `FAILED`, `CANCELED`, or `CLOSED`.
6. Wait until the recorded model quarantine time has passed.

```sh
databricks api get /api/2.0/sql/statements/STATEMENT_ID --profile livenation-demo
databricks api post /api/2.0/sql/statements/STATEMENT_ID/cancel --profile livenation-demo --json '{}'
```

A submission can fail before it returns an ID. In that case, inspect warehouse query history for the attempt's time and SQL template. Keep the block if you cannot identify the attempt.

After these checks, preserve a copy of `outputs/regional-runtime/runtime.json`. The following command clears only the reconciled remote state. It preserves all cost records.

```sh
bun -e 'import {rename} from "node:fs/promises"; const path="outputs/regional-runtime/runtime.json"; const state=await Bun.file(path).json(); delete state.unknown_block; delete state.remote_until; delete state.statement_until; await Bun.write(path+".reconciled",JSON.stringify(state,null,2)); await rename(path+".reconciled",path);'
```

Do not delete the cost ledger to permit more calls. Reconcile a cost reservation only against measured usage and the dated rates. Unknown usage keeps its reservation. A larger budget requires a separate decision.

The cost ledger also counts Cost Explorer requests at the published $0.01 rate per primary-view request. This remains a charge estimate, not a current bill. [Cost Explorer pricing](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/)
