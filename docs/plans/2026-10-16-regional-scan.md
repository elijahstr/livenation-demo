# Regional scan review and implementation plan

Status: review draft. This plan does not authorize runtime work, cloud calls, installation, activation, or deployment.

## Goal

Build a read-only regional scan that follows a server-supplied objective. The proposed default is useful seller actions today. The scan covers the entire authorized roster. It does not hide omitted accounts behind a complete status.

The model forms hypotheses and requests evidence. SQL returns stable facts. The model judges competing explanations and chooses act, ask, no-action, deferred, or unavailable.

<!-- fig:regional-scan-flow -->

## Verified current facts

- The current fixed account tools support A100 only and allow three calls per turn. `ask_analytics` has a different input boundary.
- The current Genie client calls workspace-wide Genie One. It has no dedicated agent ID.
- The snapshot date is `2026-10-16T12:00:00Z`.
- The 2026-10-19 Silver check had 278 accounts, 555 activities, 2,219 tickets, and 9,999 rows across 17 tables. See [scale evidence](../design/regional-scan/scale-evidence-2026-10-19.json).
- Silver contract evidence shows A100 Harbor Works has an active contract through 2026-12-31.
- A100 has a 2026-09-30 email without body or direction.
- A100 has three accepted uses at one Meridian Lights event.
- A100 includes General Parking for E200. It does not own Premier Parking.
- The observed Premier Parking snapshot has twelve units at $40.

Repository proof at `f91ff9d` records 10,000 Bronze rows. This check did not read a live Bronze count. The future admission state and seller-driving evidence need verification.

## Settled decisions

- The seller territory is Northern California, Oregon, and Washington. An explicit Northern California allowlist remains open. State alone cannot define it.
- A schedule and a manual scan use one service. The schedule cadence stays open.
- The scan is read-only. It has no hold, draft, send, or purchase tool.
- The initial list paginates the complete authorized roster.
- Each listed account ends assessed, deferred, or unavailable. No account remains unassessed before complete status.
- The server owns identity, workspace, raw SQL, seller ID, scope dates, and roster validation.
- Evidence carries `scan_id`, `data_as_of`, `retrieved_at`, dataset references, IDs, units, freshness, and status.
- The service marks mixed or stale multiquery evidence.

## Recommendation

Use a curated Premium Genie Agent connection for bounded regional analytics. It gives its own semantic context, examples, and benchmarks. The current workspace-wide Genie One route can remain an alternative only after scoped metadata, access, and tests prove the same controls.

Use stable reviewed Gold views or an adapter for account facts. Do not make a threshold the final sales recommendation. Keep broad sales definitions in Databricks semantic assets. Keep qualitative judgment in the two draft skills.

## Proposed architecture

The server creates the scan and resolves the roster. The model chooses evidence requests only for roster accounts. Fixed retrieval returns stable facts. Genie returns validated analytic results. The server persists evidence and account state, then resumes safely after interruption.

The draft has three model tools: `get_account_evidence`, `find_options`, and `ask_analytics`. The server alone runs roster enumeration, batch assignment, persistence, and coverage.

The server retains the full roster. It gives the model bounded batches and summaries. The model does not hold the full region in context.

## Scale and retrieval

The server should run one scoped summary query, consume completed result chunks once, persist a ledger, page that ledger by 50, and send at most ten accounts per model batch. Byte caps can shrink a batch.

The CA, OR, and WA single-query baseline took 17,809 ms. The six-page keyset experiment took 43,791 ms. Both include CLI work and have unknown cache state. Neither measures runtime scan performance. See [scale and retrieval review](../design/regional-scan/scale-and-retrieval.md).

The proposed Genie route uses the supported conversation API through the existing CLI and HTTP boundary. It sends natural language and receives generated SQL attachments. The seller agent has no raw SQL execution tool. [Databricks Conversation API](https://docs.databricks.com/aws/en/genie-agents/conversation-api)

## Data and security assumptions

The roster is server-owned. A model account ID receives server validation. The system rejects an account outside the roster.

The query identity needs only `USE CATALOG`, `USE SCHEMA`, and `SELECT` on curated assets. It also needs required Genie and compute permissions. Check these permissions before a ready claim. Do not expose arbitrary administrator SQL execution.

`account_attention` includes all scoped accounts. It can include a null current contract. Retain those accounts for lead review. `latest_order_id` does not prove a successful order.

`account_artist_evidence` has historical use facts. It must not be called net paid ticket demand. It lacks a distinct event count. `account_event_benefits.purchased_quantity` is a qualifying order-line count. The proposed contract names it `purchased_line_count`.

## Implementation map and order

1. Keep the review documents as the approved source before runtime work.
2. Add reviewed Gold projections and access checks. This prevents wrong units and unauthorized data use.
3. Add `src/regional-scan-service.ts` and `src/scan-tools.ts`. They own scan state, roster pages, envelopes, and result validation.
4. Add `src/genie-agent-client.ts` and a bounded Statements chunk adapter. The adapter extends this scan path only. It does not raise existing 1,000-row or 1 MiB tool limits.
5. Update the existing server entry, harness client, and tool cycle. They load only the approved skills and tools.
6. Add resumable persistence. A demo-only local JSON option needs atomic writes and serialized ownership.
7. Add the mock UI scan cards and coverage state. A partial scan cannot appear complete.
8. Add tests for service, tool, Genie adapter, and UI. Then simplify, review, and plan future deployment.

## Acceptance tests

- The roster paginates to exhaustion and no account remains unassessed.
- A timeout or cursor failure returns partial coverage, not complete coverage.
- A model cannot access an account outside the server roster.
- Missing evidence returns `unavailable`, not zero or an invented fact.
- The A100 activity does not produce a direction or message-content claim.
- A seller action never claims a hold, eligibility, or confirmed purchase.
- Mixed dataset versions produce a mixed or deferred result.
- Refunds, cancelled orders, duplicate scans, null contracts, and product units pass the listed evaluation cases.
- A Genie response without a completed validated attachment produces no analytic claim.
- Restart resumes persisted accounts without duplicate account results.
- Coverage can finish while unavailable or deferred accounts remain. Such a result reports partial success.

## Open decisions

1. Confirm the curated Premium Genie Agent connector and its actual space ID.
2. Confirm the server-supplied scan objective. The proposed default ranks useful seller action today above revenue.
3. Confirm the progressive-card reveal behavior during a partial scan.
4. Choose the schedule cadence after demo timing evidence.
5. Approve a versioned venue and account allowlist at `config/regional-scan-scope.json`. The settled territory remains Northern California, Oregon, and Washington. The current data cannot derive Northern California labels.
6. Choose a restricted query principal or explicitly accept the broad synthetic demo identity. The recommended principal has `SELECT` only on seller-scoped semantic views plus required Unity Catalog, compute, and Genie permissions.

## Server-owned coverage and consistency

The server enumerates, paginates, and persists the complete roster. `list_regional_accounts` is a server operation. It is not a model tool. The server supplies a batch of ten account summaries and evidence IDs. The model returns one structured result for each assigned account.

The server rejects missing, duplicate, or extra account IDs. It validates states and evidence references. It commits a valid batch atomically. It computes coverage from its ledger. A crash reruns only an unfinished batch. Progressive cards publish only after a valid batch commit.

`assessed` means `act`, `ask`, or `no-action`. `complete` means every account is assessed and source fingerprints stay consistent. Any deferred, unavailable, or unassessed account gives `partial`. The ledger reports `processing_finished` and `fully_assessed`. It never fabricates an unknown roster total.

The proposed defaults are ten accounts, twelve business calls, and 180 seconds per batch. The whole scan has proposed caps of 600 seconds and 120 calls. These are engineering defaults pending a full demo-roster measurement. A timeout defers remaining accounts and returns partial. Summary-only `no-action` needs supplied evidence.

`data_as_of` is a semantic cutoff. It is not a dataset version. Before scan start, each batch publish, resume, and scan end, the server records a source fingerprint. The fingerprint includes relevant Delta source-table IDs and latest versions, Gold view definitions, skill hashes, and scope-config hash. A fingerprint change marks the scan mixed, invalidates current comparisons, stops publication, and requires a fresh scan. Earlier historical evidence remains recorded. The local loader lock coordinates local work only. It does not prove no remote writer. Use read-only `DESCRIBE HISTORY ... LIMIT 1` for Delta version checks. [Delta history](https://docs.databricks.com/aws/en/delta/history)

## Review record

The October 16 review verdict was needs material revision. The October 19 scale review used Sonnet 5.5 context and Opus 5.5 judgment. Its verdict was ship with minor revisions. Main-agent assessment accepted the correctness and measurement clarifications. No second review loop ran. This draft is ready for user review. It is not implementation approval.

## Readiness

This draft is ready for user review. Implementation readiness needs the six open decisions, scoped projection tests, actual permission checks, inline prompt skill-hash proof, and a verified dedicated Genie route. This work is Tier 1 because runtime tool scope and query identity affect data access.

## Sources

- [Databricks structured retrieval tools](https://docs.databricks.com/aws/en/agents/custom-agents/structured-retrieval-tools)
- [Databricks Genie best practices](https://docs.databricks.com/aws/en/genie-agents/best-practices)
- [Databricks Genie quality tuning](https://docs.databricks.com/aws/en/genie-agents/tune-quality)
- [AgentCore Harness skills](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-skills.html)
- [AgentCore Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)
