# Regional scan architecture decisions

> **Material caveat.** This is a design record for the demo target.
> The current Premium chat does not provide a regional scan.
> The current fixed account tools still support only Harbor Works account `A100`.

## Purpose

The demo explains how one seller finds useful regional work.
The seller covers Northern California, Oregon, and Washington.
The scan starts the experience.
Account chat follows the selected result.

## Status words

- **Settled design** means the team selected the product direction.
- **Proposed detail** means implementation needs review.
- **Verified current implementation** means the repository contains the behavior.

## Decision ledger

| Decision | Why | Alternative and cost | Status | Evidence |
| --- | --- | --- | --- | --- |
| Let the agent investigate adaptively. | A seller question can need several facts. | A fixed alert loop is simple. It cannot test changing hypotheses. | Settled design | User decision record in this document |
| Put stable counts, refunds, benefits, and dates in SQL. | Repeated business facts need one reviewable definition. | Model-only interpretation is flexible. It can change a definition between turns. | Settled design | [Gold views](../../../src/premium-foundation.ts) and [Microsoft guidance](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-evaluate-data) |
| Use fixed retrieval for repeated facts. | A card needs bounded evidence and clear provenance. | Generated SQL can explore more widely. It needs stronger validation. | Settled design | [Premium tools](../../../src/premium-tools.ts) |
| Use Genie-generated SQL for open investigation. | A seller can ask questions outside a card contract. | Add every question as fixed SQL. That slows new investigation. | Settled design | [Genie client](../../../src/genie-mcp-client.ts) and [AWS enterprise text-to-SQL](https://aws.amazon.com/blogs/machine-learning/dynamic-text-to-sql-for-enterprise-workloads-with-amazon-bedrock-agents/) |
| Let the agent choose hypotheses and evidence order. | The agent should seek evidence before it recommends. | Require one fixed tool sequence. That wastes calls on irrelevant facts. | Settled design | Proposed pipeline below |
| Permit `act`, `ask`, or `no-action` recommendations. | Evidence can support a next step, a question, or restraint. | Always suggest outreach. That can create unsupported work. | Settled design | Proposed recommendation contract |
| Do not expose uncontrolled raw SQL in seller scan recommendations. | The scan must retain bounded data scope and business definitions. | Let the model execute arbitrary SQL. That increases safety and quality risk. | Settled design | [Genie validation](../../../src/genie-mcp-client.ts) |
| Keep scan business data read-only. | A recommendation must not change inventory or customer records. | Make an immediate hold. That needs a separate authority model. | Settled design | [Premium tool guide](../../data/premium-gold-tools.md#permissions-and-teardown) |
| Prepare a hold and draft after seller selection. | Selection captures the chosen option without delivery or spend. | Delay preparation until approval. That slows seller review. | Settled design | [premium-sales decisions](../premium-sales/decisions-and-research.md#approval-path) |
| Require seller approval before release or spend. | Approval authorizes the specific customer-facing action. | Agent-led release. That removes the required human check. | Settled design | [premium-sales decisions](../premium-sales/decisions-and-research.md#approval-path) |
| Show citations, unknowns, query proof, and traces. | The demo must distinguish evidence from inference. | Show polished copy only. That hides uncertainty. | Settled design | [measurement record](../premium-sales/decisions-and-research.md#measurement-record) |
| Use skills as domain playbooks. | Skills guide investigation and recommendation form. | Treat skills as access control. They cannot enforce permissions. | Settled design | [premium-sales research](../premium-sales/decisions-and-research.md#reference-document-summary) |
| Let the server own roster and coverage state. | A scan needs verified coverage after a restart or budget stop. | Let the model report coverage. That makes coverage a model claim. | Proposed detail (review correction) | Review ruling, accepted |

## Proposed pipeline

```text
Server enumerates and persists the proposed demo roster
  -> server dispatches a bounded account batch
  -> agent hypothesis and adaptive investigation
  -> model returns one structured result per expected account
  -> server validates IDs and evidence
  -> server atomically commits the batch and coverage count
  -> scan card and account chat
  -> seller selects option
  -> server prepares hold and draft
  -> seller reviews and approves release or spend
```

**Proposed detail.** `list_regional_accounts` is server-only retrieval.
The agent receives a server-owned account batch.
It has three tools: account evidence, options, and analytics.
It chooses its hypotheses and evidence order inside the batch.

**Proposed detail.** The server rejects a missing account ID, an extra ID, or unsupported evidence.
It persists valid results and computes coverage itself.
It marks a batch atomic only after all expected results validate.

**Proposed budgets.** A batch has ten accounts, twelve business calls, and 180 seconds.
A whole scan has 600 seconds and 120 calls.
Full-roster success remains unmeasured.

**Proposed detail.** The agent records each claim with its source and time.
It records each missing fact as an unknown.
It does not treat an unknown fact as a negative signal.

**Settled design.** Skills guide qualitative judgment, such as which unknown blocks a recommendation.
SQL defines quantified rules, such as refund treatment, benefits, and date windows.
Skills cannot change those SQL definitions or authorize access.

**Proposed detail.** The default skill delivery injects reviewed, versioned `SKILL` text into the system prompt.
The server records its content hash with the scan.
Native runtime skill loading remains optional until verified.

**Proposed detail.** A structured recommendation contains:

- `decision`: `act`, `ask`, or `no-action`
- `reason`: a short evidence-linked explanation
- `evidence`: source, query identifier, and `data_as_of`
- `unknowns`: facts needed before a customer-facing action
- `seller_next_step`: a reviewable action or question

## Current implementation boundary

**Verified current implementation.** Premium chat offers `get_account_brief`, `find_options`, and `ask_analytics`.
The first two tools accept only `A100`.
The tool cycle limits Premium chat to three calls per turn.
See [Premium tools](../../../src/premium-tools.ts) and [chat service](../../../src/chat-service.ts).

**Verified current implementation.** `ask_analytics` uses workspace Genie One through the local CLI bridge.
It is not a direct AWS-hosted Databricks connection.
See [README](../../../README.md#premium-gold-chat-tools).

**Verified current implementation.** Request validation limits current Genie evidence to approved Gold sources.
The current demo identity can still have broad administrator rights.
The Genie space improves semantic context. It does not enforce access control.
See [Premium tool guide](../../data/premium-gold-tools.md#permissions-and-teardown).

**Verified observation on 2026-10-19.** Silver had 278 accounts, 555 activities, and 9,999 rows across 17 tables. This does not prove an approved Northern California roster or end-to-end scan performance.

**Verified current implementation.** Trace setup has proof for an AgentCore call.
It does not prove that the proposed regional scan works end to end.
See [trace guide](../../../infra/README.md#read-a-conversation-trace).

**Historical observation on 2026-10-16.** The recorded proof covered the foundation and first scale bundle. It showed two accounts, eleven tickets, and three activities.

**Repository proof at `f91ff9d`.** The loader recorded 10,000 Bronze rows. This is not a live Bronze count from 2026-10-19.
Recheck the loader state before the demo.
See [scale guide](../../data/premium-10k-scale.md#current-status).

**Verified current implementation.** The scan-first UI is a separate static mock.
It does not query Premium Gold.
See [prototype](../../prototypes/premium-sales/index.html).

**Proposed detail.** The source-consistency check records Delta table versions, Gold view-definition fingerprints, roster scope, and skill hashes.
The server checks them before it publishes each batch.
Loader state alone cannot detect remote writers.
`data_as_of` remains a business cutoff, not a dataset version.

## Harbor Works teaching example

**Verified current implementation.** Harbor Works account `A100` has three accepted ticket uses for one Meridian Lights event.
General Parking is included for `E200`.
Premier Parking is absent from the benefit.
The fixture records twelve Premier Parking units at $40.

**Verified current implementation.** The fixture does not show travel, future attendance, or customer intent.
The active contract ends on December 31.
That date is outside the 30-day window from October 16.

The seller can ask about cars before a Premier Parking quote.
The agent should not promise a hold or future attendance.
See [fixture](../../../fixtures/premium-harbor-works.json), [Gold definitions](../../../src/premium-foundation.ts), and [fixed options query](../../../src/premium-tools.ts).

## Open decisions

| Question | Recommendation | Cost | Status |
| --- | --- | --- | --- |
| Which Genie connection supports seller investigation? | Reuse Genie Agent `01f1c9a2b3421c1ca755c65e625104ad` through its conversation REST API. Verify it before runtime. | The adapter and context tests still need work. | Open |
| What ranks scan results first? | Start with the most useful action today. | It can rank below a higher revenue estimate. | Open |
| When do scan cards appear? | Show progressive cards only with clear completion state. | The seller can see a partial portfolio. | Open |
| How often does the scan run? | Match the source refresh cadence. | A slower cadence can delay a useful prompt. | Open |
| What defines the demo roster? | Use a versioned seller venue and account allowlist. Keep the settled Northern California, Oregon, and Washington scope. | The map needs maintenance. The current data only proves state-level California coverage. | Open |
| Which principal executes scan queries? | Create a restricted SELECT-only query principal. | Permission setup needs explicit approval. Alternative: retain the broad synthetic demo principal with explicit acceptance and server validation. | Open |

**Proposed detail.** The approved allowlist feeds fixed queries and Genie aggregate context.
Scoped server projections feed both paths before the agent receives evidence.
Use the label **Proposed demo roster** until the map has verification.
Do not claim that current data proves Northern California scope.

## Review drafts

The exact tool inputs, result schemas, runtime budgets, retries, and persistence rules remain review drafts.
They need implementation evidence before the demo claims them.

The seller hold, draft, approval, release, and spend path is unbuilt later work.
The current scan has no business writes.

## Review provenance

Sonnet 5.5 and Opus 5.5 reviewed the initial package.
The initial verdict required material revision.
The main review accepted and partly applied small fixes.
No second external review ran.

## Sources

- [Databricks structured retrieval tools](https://docs.databricks.com/aws/en/agents/custom-agents/structured-retrieval-tools)
- [Databricks Genie One MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp)
- [Databricks Genie quality guidance](https://docs.databricks.com/aws/en/genie-agents/tune-quality)
- [Databricks Genie concepts](https://docs.databricks.com/aws/en/genie-agents/concepts)
- [Databricks Delta history](https://docs.databricks.com/aws/en/delta/history)
- [AWS AgentCore Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)
- [AWS layered authorization](https://aws.amazon.com/blogs/security/enhancing-data-privacy-with-layered-authorization-for-amazon-bedrock-agents/)
