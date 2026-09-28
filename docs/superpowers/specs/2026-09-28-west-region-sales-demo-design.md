# The West-region demo turns real venue context into one safe sales-recovery decision

> **Important constraint:** The current Harness override exposes built-in `shell` and `file_operations` tools during each trusted model call.
> The UI therefore accepts no free-form prompt and uses synthetic aggregates only.

## Goal

Build a local interview demo that detects one weak West-region show and uses Kimi to explain a safe response.
The demo proves a real Databricks-to-AWS path while every business fact and action stays synthetic.

## Scope

- Run one local Bun server with no new third-party dependencies.
- Read synthetic aggregates from `workspace.livenation_demo` through the Databricks Statement Execution API.
- Use the Databricks profile `livenation-demo` and one fixed parameterized SQL statement.
- Detect alerts with deterministic code before any model call.
- Send one selected aggregate alert to Kimi through the deployed AgentCore Harness.
- Show evidence, Kimi rationale, and action controls in one command-center interface.
- Require human approval before any local simulated action.
- Store action and audit state in local JSON.
- Use prototype Variant C as the visual direction without changing the prototype.

## Non-goals

- Do not send email.
- Do not create or change an advertisement.
- Do not use production or personal data.
- Do not accept an arbitrary user prompt.
- Do not infer venue ownership from a ticket page.
- Do not add a database, framework, queue, or third-party package.

## Truth boundary

The interface uses the label **Live Nation portfolio venue** for the six selected venues.
It also displays **Real venue with synthetic demonstration data** beside each sales record.

The venue names, cities, states, and public capacities come from Live Nation Special Events pages.
The public capacity is a maximum guest count, not guaranteed sellable concert inventory.

All show names, show dates, sales, targets, market signals, recommendations, audiences, and actions are synthetic.
The Live Nation purchase policy says the marketplace generally sells tickets for other event organizers.
Therefore, a ticket listing alone does not prove that Live Nation owns the venue.

| Venue | Market | Public capacity | Source |
| --- | --- | ---: | --- |
| The Wiltern | Los Angeles, CA | 2,300 | [Live Nation Special Events](https://specialevents.livenation.com/venues/the-wiltern) |
| Hollywood Palladium | Los Angeles, CA | 3,700 | [Live Nation Special Events](https://specialevents.livenation.com/venues/hollywood-palladium) |
| The Masonic | San Francisco, CA | 3,000 | [Live Nation Special Events](https://specialevents.livenation.com/venues/the-masonic) |
| Hayden Homes Amphitheater | Bend, OR | 8,000 | [Live Nation Special Events](https://specialevents.livenation.com/venues/hayden-homes-amphitheater) |
| White River Amphitheatre | Auburn, WA | 16,000 | [Live Nation Special Events](https://specialevents.livenation.com/venues/white-river-amphitheatre) |
| The Gorge Amphitheatre | George, WA | 27,000 | [Live Nation Special Events](https://specialevents.livenation.com/venues/the-gorge-amphitheatre) |

The [Live Nation purchase policy](https://help.livenation.com/hc/en-us/articles/10466444311569-Purchase-Policy) supports the ownership caveat.

## Architecture

The deterministic gate selects one alert before Kimi reasons.
The human gate stays between every draft and every simulated action.

<!-- fig:west-sales-flow -->

The execution order is:

1. Fixed Databricks query.
2. Deterministic detector.
3. One selected aggregate alert.
4. Kimi diagnosis through the managed Harness.
5. Command-center UI.
6. Email, Social, or Dismiss choice.
7. Human approval.
8. Local simulated action and audit record.

The diagram uses deterministic code, the Kimi model call, the human gate, and the simulation boundary as separate roles.

## Locked decisions

- The authorized region is `west`.
- The six named California, Oregon, and Washington venues define the demo portfolio.
- Hayden Homes Amphitheater is the initial synthetic underperformer.
- A show alerts only when cumulative sales are below 75 percent of its cumulative target.
- Data is valid through seven days of age, inclusive.
- One fixed parameterized query reads `workspace.livenation_demo`.
- The Bun server calls the Statement Execution API through the local Databricks CLI profile.
- Deterministic code selects one alert before Kimi receives evidence.
- The existing Kimi AgentCore Harness and tool-cycle logic remain in use.
- The UI follows prototype Variant C without changing the prototype files.
- Email and Social produce local simulations only.
- Dismiss produces a local audit record only.
- Every action requires explicit human approval.
- Edits invalidate approval.
- An idempotency key prevents duplicate execution.
- Local JSON stores action and audit state.
- No new third-party dependency is required.

## Databricks read contract

The Bun server calls `/api/2.0/sql/statements` through `databricks api post`.
This approach reuses the installed CLI and the `livenation-demo` profile.

The request supplies `region` and `fresh_after` as typed parameters.
The SQL text stays constant and does not include UI text.
The query requests inline JSON and a bounded row count.

The query reads one curated view named `workspace.livenation_demo.current_sales_evidence`.
The implementation can recreate that view and its seed tables only inside `workspace.livenation_demo`.
It must not change any other catalog or schema.

Each row has these fields:

| Field | Meaning | Truth class |
| --- | --- | --- |
| `event_id` | Stable demo event key | Synthetic |
| `region` | Fixed value `west` | Demo configuration |
| `venue_name` | Selected venue name | Verified venue fact |
| `city` | Venue city | Verified venue fact |
| `state` | Venue state | Verified venue fact |
| `public_capacity` | Published maximum guest count | Verified venue fact |
| `event_name` | Fictional show name | Synthetic |
| `show_date` | Fictional show date | Synthetic |
| `tickets_sold_cumulative` | Demonstration sales | Synthetic |
| `tickets_target_cumulative` | Demonstration target | Synthetic |
| `data_as_of` | Demonstration snapshot time | Synthetic |
| `market_signals` | Demonstration context | Synthetic |
| `origin` | Fixed value `synthetic` | Disclosure control |

Databricks recommends parameters because they keep input values separate from SQL text.
The [Statement Execution API guide](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial) documents typed parameters and inline JSON results.

## Deterministic detector

The server rejects rows with a missing field, an invalid type, or an origin other than `synthetic`.
It rejects rows outside `west` and rows older than seven days.

For each valid row, the server calculates this ratio:

```text
tickets_sold_cumulative / tickets_target_cumulative
```

A ratio below `0.75` creates an alert candidate.
A ratio equal to `0.75` does not create an alert.

The server selects the lowest ratio first.
It breaks ties by the earliest show date and then by `event_id`.
The synthetic seed makes Hayden Homes Amphitheater the first selected alert.

The detector owns alert truth.
Kimi cannot create an alert, change the threshold, or replace the selected evidence.

## Kimi diagnosis contract

The server passes one selected aggregate alert to the existing `get_sales_evidence` tool cycle.
The prompt is fixed and contains no operator text.

Kimi explains the shortfall, cites the supplied evidence, and proposes one recovery action.
The interface labels that text as model rationale.
The interface never displays it as measured fact.

The model call uses the deployed managed Harness and the existing three-iteration cap.
The client accepts only the `get_sales_evidence` tool name.
It rejects malformed tool input, unexpected tools, missing stop reasons, and stream errors.

## Command-center UI

The interface follows the hierarchy and visual direction of prototype Variant C.
The implementation is new functional code and does not change the prototype.

The main view contains:

- A West-region portfolio rail with all six venues.
- One selected Hayden Homes Amphitheater alert on initial load.
- A measured-evidence panel with the sales ratio and snapshot time.
- A separate Kimi rationale panel.
- A visible synthetic-data disclosure.
- Email, Social, and Dismiss choices.
- An editable draft with approval status.
- A local action log with the final state.

The user starts the flow with **Run sales check**.
The server does not call Kimi when no valid alert exists.

## Action and audit state

The server stores records in `outputs/demo-actions.json`.
The file contains synthetic content only and remains outside version control.

Each action record contains:

- `action_id`.
- `idempotency_key`.
- `alert_snapshot_hash`.
- `action_type`.
- `content`.
- `status`.
- `created_at` and `updated_at`.
- An optional failure message.

The allowed states are `pending`, `approved`, `executing`, `completed`, `failed`, and `unknown`.

The normal transition is `pending` to `approved` to `executing` to `completed`.
An execution error changes `executing` to `failed`.
An uncertain write changes `executing` to `unknown`.

Any edit creates a new snapshot hash and changes the action to `pending`.
The server never executes a `pending` action.

The idempotency key combines the alert snapshot, action type, and approved content hash.
A repeated execution request returns the existing record instead of creating another action.

Email and Social write a simulation result to the local record.
Dismiss writes the approved dismissal to the local record.
No route sends a message or changes an advertisement.

## Failure behavior

- A Databricks failure stops the check before the Kimi call.
- A stale dataset produces a freshness warning and no alert.
- An empty result produces a clear no-data state.
- No qualifying row produces a healthy state and no Kimi call.
- A Kimi failure preserves the measured evidence and hides the action recommendation.
- An invalid model response produces an error state and no action draft.
- A local write failure produces `failed` when the outcome is known.
- An uncertain local write produces `unknown` and blocks automatic retry.
- A duplicate idempotency key returns the existing record.

## Security and cost posture

The demo uses synthetic aggregate data and fixed controls.
The interface has no free-form prompt input.
The query text remains constant and uses typed parameters.

The Harness invocation override requires `allowedTools: ["*"]` for Kimi inline-tool use.
This override also exposes built-in `shell` and `file_operations` tools to the model.
The local tool-name check does not remove those built-ins from the model tool list.

This risk is accepted only for the controlled interview demo.
Do not reuse this configuration with untrusted prompts or production data.

The demo uses on-demand Databricks, AgentCore, and model calls.
It adds no always-on cloud service and no new infrastructure resource.

## Alternatives not selected

- Let Kimi detect the alert. This choice makes measured truth probabilistic.
- Generate SQL from UI selections. This choice adds injection risk and makes the query harder to audit.
- Add a Databricks SDK. This choice adds a dependency without improving this small fixed query.
- Send a real email or advertisement. This choice adds external side effects that the interview does not need.
- Store actions in a cloud database. This choice adds setup and teardown without improving the demonstration.

## Acceptance checks

### Unit checks

- Reject invalid venue, region, origin, capacity, sales, target, and freshness values.
- Prove that `0.7499` alerts and `0.75` does not alert.
- Prove the ratio, date, and `event_id` tie-break order.
- Prove that Hayden Homes is the initial selected alert.
- Prove that edits invalidate approval.
- Prove that one idempotency key cannot execute twice.
- Prove every allowed and rejected state transition.

### Integration checks

- Verify the Bun route sends the fixed statement and typed parameters to a fake Databricks adapter.
- Verify the detector sends only one selected aggregate to a fake Harness adapter.
- Verify a Harness failure does not create an action draft.
- Verify approval, edit, execution, duplicate execution, failure, and unknown outcomes.
- Verify the server writes and reloads the local JSON audit file.
- Verify the HTML displays both disclosure labels.

### Live smoke checks

- Query `workspace.livenation_demo` through the `livenation-demo` Databricks profile.
- Confirm all six West-region venues and no other region.
- Confirm every business field reports `origin` as `synthetic`.
- Confirm Hayden Homes becomes the selected alert.
- Run one Kimi diagnosis through the deployed AgentCore Harness.
- Approve one simulated action and confirm one completed audit record.
- Repeat the execution request and confirm that no duplicate record appears.
- Confirm no email was sent and no advertisement changed.

## Delivery sequence

1. Recreate the six-venue synthetic view inside `workspace.livenation_demo`.
2. Add the fixed Databricks adapter and row validation.
3. Add the deterministic detector and selection rule.
4. Adapt the existing Harness tool cycle for the selected West-region evidence.
5. Build the Variant C command-center interface.
6. Add the approval state machine and local audit file.
7. Run unit and integration checks.
8. Run the bounded Databricks and AgentCore live smoke checks.

## Open questions

None. The user approved the venue set, West region, synthetic truth boundary, and recommended application design.

## Source record

- [Databricks Statement Execution API](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial).
- [Live Nation Standard Purchase Policy](https://help.livenation.com/hc/en-us/articles/10466444311569-Purchase-Policy).
- [The Wiltern](https://specialevents.livenation.com/venues/the-wiltern).
- [Hollywood Palladium](https://specialevents.livenation.com/venues/hollywood-palladium).
- [The Masonic](https://specialevents.livenation.com/venues/the-masonic).
- [Hayden Homes Amphitheater](https://specialevents.livenation.com/venues/hayden-homes-amphitheater).
- [White River Amphitheatre](https://specialevents.livenation.com/venues/white-river-amphitheatre).
- [The Gorge Amphitheatre](https://specialevents.livenation.com/venues/the-gorge-amphitheatre).

The HTML digest links to the full document and the raw Markdown source.
