# Premium Gold tools: bounded account evidence and curated analytics

<!-- chips:Tier 1|Databricks read path|AgentCore tool boundary|one Genie agent -->

Status: **Complete. The Genie agent, data-only verification, and Premium AgentCore verification passed. Browser validation remains limited to load and session creation.**

<!-- digest:start -->
The premium chat mode will use two server-owned fixed Gold SQL tools and one curated Genie analytics tool. The implementation preserves the West chat, recovery path, and the 28 raw and 27 accepted foundation records.
<!-- digest:end -->

<!-- fig:premium-tools-flow -->

## Goal

Add an opt-in premium chat data source for a synthetic Harbor Works seller. The seller can request an account brief, available options, or broad Gold analytics. The server validates tool inputs and returns bounded evidence only.

## Scope

### Included

- Create one owned Genie agent over the existing five Gold views and `sales_metrics` metric view.
- Add fixed `get_account_brief(account_id)` and `find_options(account_id)` tools.
- Add `ask_analytics(question)` through the Genie One MCP server.
- Select the premium path only when `AGENTCORE_CHAT_DATA_SOURCE=premium`.
- Add live verification, unit tests, fake CLI tests, and browser validation of the existing premium chat mode.

### Excluded

- Seller users, grants, OAuth, Gateway, new AWS resources, and a denial demonstration.
- A new browser route, UI redesign, arbitrary SQL, direct Genie SQL execution, and live hold or artist-match claims.
- Changes to recovery, the existing West default, raw source data, or the 27 accepted Silver records.

## Risk tier and write scope

**Tier 1 applies.** The work creates a Genie agent in a live Databricks workspace and extends an AgentCore tool boundary. The risks are an unintended workspace object, a prompt-controlled query, or an unbounded data result.

The setup creates one owned Genie agent with a unique `Live Nation Premium Gold` marker. The setup script must inspect the existing `/Users/elijahstraight14@gmail.com` parent path before it writes. It must not create that folder, change a Bakehouse object, or create grants, principals, OAuth settings, warehouses, gateways, catalogs, tables, views, or other AWS resources. Analytics also creates Genie conversations, query history, and warehouse compute.

## Verified context

### Verified completion facts on 2026-10-16

- The owned Genie agent is created and verified.
- No Gold tables or grants changed.
- Data-only live verification passed at `outputs/premium-tools/1792183710644-verification.json`.
- Premium AgentCore verification passed at `outputs/premium-tools/1792183920044-verification.json`.
- Two successful qualified turns reused runtime `b8641cfd-7228-4229-9c6a-cd7a11dd4d19`. The first called `get_account_brief` and `find_options`. The second called `ask_analytics`.
- The first plain-selector attempt made zero tool calls. That attempt plus the two successful qualified turns used the three-attempt budget. The verifier makes no more paid probes automatically.
- Genie AgentCore retrieval verified an existing read-only result at `/tmp/ln-gold-tools-preflight/agentcore-genie-result.json`: `300.00`, `40.00`, `3`, and `1` under the returned metric aliases.
- The owned [Live Nation Premium Gold Genie agent](https://dbc-da714a97-83a0.cloud.databricks.com/genie/rooms/01f1c9a2b3421c1ca755c65e625104ad?o=7474650774099237) is available in the configured workspace.
- CloudWatch returned 20 matching span records in the first-page limit at `/tmp/ln-gold-tools-preflight/agentcore-trace.json`. Trace IDs include `6ad28e35001d9e150473fd781f628ad6` and `6ad28e2d09fde0a776e8569b73c5f81b`.
- The full suite passed: 200 tests, zero failures, 707 assertions, 33 files, and 19 seconds.

### Browser verification limit

- The app loaded on port 3011 and created a chat session with HTTP 201.
- The browser did not send a paid prompt. The paid checks used `ChatService`, not the browser UI.
- The trace result does not prove standalone MCP spans. The 20-record first page does not prove that exactly 20 matching records exist.

### Verified preflight facts on 2026-10-16

- The local `livenation-demo` CLI profile has `all-apis` access. AWS STS is valid.
- The system Genie MCP service is visible at `/ai-gateway/mcp-services/system.ai.genie_one_mcp`. The tool catalog contains `genie_ask`, `genie_poll_response`, `genie_get_query_result`, and `genie_cancel_response` only.
- The current CLI accepts stateless JSON-RPC `initialize` and `tools/list` requests to that service. The client does not declare MCP Apps support or send `_meta.progressToken`.
- The MCP handshake date is `2025-03-26`. The server reports `genie_chat` version `1.0.0`.
- The configured warehouse is `976766402458e7de`.
- The existing Gold foundation has five views plus `sales_metrics`. Its fixture has 28 raw records, 27 accepted records, and the expected all-time values: admission revenue 300, parking revenue 40, valid admission tickets 3, and admission buyers 1.
- The first live Genie probe treated `AS OF` as a `sale_date` filter. The configuration must state that `AS OF` means snapshot context, not a sale-date filter. The fixture sale dates are in September.

### Verified repository facts

- `src/databricks-statements.ts` already owns the bounded local CLI Statement Execution wrapper.
- `src/chat-service.ts`, `src/agentcore-harness-client.ts`, and `src/harness-tool-cycle.ts` own the current chat tool cycle, timeout, abort, session, and allowlist behavior.
- The current cycle parses all tool requests before it executes them. It caps tool requests at three per response.
- Existing chat default behavior is West evidence. Recovery uses a separate path and remains out of scope.

### Platform sources

- [Databricks Genie MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp) documents the system MCP service and Genie tools.
- [Genie conversation API](https://docs.databricks.com/aws/en/genie-agents/conversation-api) documents conversation and query-result retrieval.
- [Databricks views](https://docs.databricks.com/aws/en/views/) documents view use and ownership context.
- [Statement Execution tutorial](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial) documents statement status, result limits, and cancellation.
- [AgentCore Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html) documents application-owned inline tools.

## Locked decisions

- Use the local CLI bridge for both Statement Execution and MCP JSON-RPC. Credentials remain in the CLI process.
- Extend `src/databricks-statements.ts` with one bounded request export for JSON POST and body-free GET. It must preserve the existing GET-only wrapper, accept empty or null `notifications/initialized`, and set its own output and deadline caps.
- Use no deprecated MCP route or fallback protocol. Reject protocol, JSON-RPC, tool, status, and identifier errors.
- Use a new Genie conversation for each analytics request. Poll sequentially for 90 seconds. On timeout or abort, send `genie_cancel_response` with an independent five-second signal, then poll for a terminal state for at most five seconds. `cancellation_requested` does not prove completion. Return an unknown-outcome error with conversation and response IDs when terminal proof is absent.
- Use each tool deadline as `min(45 or 90 seconds, remaining 135-second tool budget)`. The 180-second parent turn deadline aborts every unfinished child call and reserves 45 seconds for the final model response and cleanup. These are ceilings, not an additive duration guarantee. Do not retry.
- Limit total serialized tool output to 64 KiB and returned rows to 50. Reject, rather than truncate, a result above either cap. Capture SQL, source IDs, top-level `data_as_of`, timings, and returned-row count.
- Do not forward MCP `content`, agent instructions, or reasoning. Use only structured completion data.
- Use server-owned fixed SQL for the account brief and options. Do not expose freeform SQL, endpoint, warehouse, or principal inputs.
- Map the synthetic Harbor Works account to `A100`. Accept only an allowlisted account identifier and a frozen `2026-10-16T12:00:00Z` context.
- Cache repeated fixed-tool output only for the current chat turn.
- Preserve AgentCore actor, session memory, provenance, abort, and parse-before-execute protections. Set premium `maxIterations` to four for three sequential tools plus a final answer. Cap premium tool calls at three total per turn; preserve the old West cap of three per response.
- Use the `qualified` selector allowlist for exactly `get_account_brief`, `find_options`, and `ask_analytics`. Accept each name in plain form and `@*/` qualified form. Accept no wildcard and no built-in tool. This follows the documented West selector pattern.
- Set the premium turn deadline to 180 seconds. Preserve the West deadline of 90 seconds.

## Architecture and data contract

### Tool contract

| Tool | Input | Server action | Output contract |
| --- | --- | --- | --- |
| `get_account_brief` | `{ account_id: "A100" }` | One fixed bounded Gold SQL statement | attention, artist evidence, included benefits, source IDs, query timing, rows |
| `find_options` | `{ account_id: "A100" }` | One fixed bounded Gold SQL statement | future options and benefits, excluding owned products, source IDs, query timing, rows |
| `ask_analytics` | `{ question: string }` | Genie One discovery request, poll, and bounded result fetch | structured query evidence, completion metadata, deep link, source IDs, timing, rows when proved |

Each input object permits no extra fields. `account_id` must match the known-account regular expression and server allowlist. `question` has a 2,000-character limit and becomes data for Genie only. The client adds a fixed prefix that permits only the six named Gold objects and states that `AS OF` is not a sale-date filter. No tool accepts raw MCP instructions, SQL, a MCP endpoint, a principal, a warehouse, or a date override.

The account brief uses independent bounded aggregates for `account_attention`, `account_artist_evidence`, and `account_event_benefits`. It prevents fanout before it combines the evidence. Schema and allowlist input faults return a bounded recoverable tool error. Protocol, provenance, timeout, and output-limit faults abort the turn.

The options statement joins Gold inventory to same-event benefits. It excludes a product that the account owns. General Parking does not exclude Premier Parking. The current Gold option rows have no `artist_id`; therefore the tool makes no live artist-match claim or live hold claim.

The deterministic scan reads `account_attention` from the server or CLI. It adds no model tool or HTTP route.

### Curated Genie agent

`config/premium-genie.json` declares a stable 32-hex identifier set and sorted arrays. It uses the current Genie Spaces API metadata shape. Setup normalization moves `metric_views` entries into `data_sources.tables`. It joins instruction text before it serializes the Genie definition. The server-owned MCP metadata includes warehouse `_meta` for `976766402458e7de`.

The one text instruction sets date axes and product rules. It states that `AS OF` defines snapshot context. It requires a September `sale_date` filter only when the question asks for one. The configuration includes tested SQL examples and three sample questions.

The setup script creates only the owned title `Live Nation Premium Gold` plus its unique marker and definition hash in its description. Genie creates conversations and queries during analytics use as well as the configured agent. The agent is eligible for Genie One discovery, but no request selects or pins it. Curation, the prefix, and output checks improve routing and answer quality. They do not authenticate a user, hard-prevent DML, select or pin an agent in Genie One, restrict the current administrator permissions, or pin the Genie One MCP route.

## Ordered implementation

1. Add `src/premium-tools.ts`.
   - Define exact input schemas, account allowlist, fixed SQL builders, bounded output types, per-turn cache, and provenance checks.
   - Reject obvious non-Gold sources as a quality check. This check does not authorize access.
   - Reuse the Databricks Statement Execution wrapper. Do not add dependencies.

2. Add `src/genie-mcp-client.ts`.
   - Send `initialize`, `tools/list`, `genie_ask`, `genie_poll_response`, `genie_get_query_result`, and `genie_cancel_response` through local CLI JSON-RPC.
   - Validate `isError`, JSON-RPC errors, completion status, conversation IDs, response IDs, and item IDs. Poll `in_progress`; accept only terminal `completed`, `incomplete`, and `failed`; reject `unknown` or another status.
   - Read `structuredContent` only. The verified query-result contract is `statement_state`, `ready`, typed columns, string-or-null rows, `total_row_count`, and `truncated`.
   - Retrieve all bounded query items, with a maximum of five. Retain every successful valid-Gold result under the shared 50-row and 64 KiB caps. Query-item order is unspecified.
   - Preserve failed query metadata without rows. If no valid query evidence exists, fail closed with an error. Do not forward `content` or `final_answer` as factual evidence, and do not execute Genie SQL locally.

3. Add `config/premium-genie.json` and `scripts/setup-premium-genie.ts`.
   - Validate configuration shape, stable IDs, sorted arrays, exact source scope, title ownership, and write scope before CLI creation.
   - Inspect existing objects. Refuse an equal-title object without the marker and refuse any foreign object.

4. Extend the chat integration.
   - In `src/main.ts`, add the `AGENTCORE_CHAT_DATA_SOURCE=premium` server environment selection to the existing browser chat. Keep West as the default.
   - In `src/agentcore-harness-client.ts`, construct the premium invoker with exactly the three allowed inline tools.
   - In `src/harness-tool-cycle.ts` and `src/chat-service.ts`, generalize the allowed tool selector without weakening old `get_sales_evidence` behavior.
   - Preserve session, actor, memory, prompt-injection, abort, provenance, and tool-count rules.

5. Add `scripts/verify-premium-tools.ts`.
   - Support `--data-only` and `--agentcore`. Save proof metadata only under `outputs/premium-tools/`.
   - Check the existing target 13 USD, stop 15 USD, exclusive cap 20 USD, and zero-retry ledger before any paid call. Check Cost Explorer below 13 USD and record its lag and the separate Databricks billing boundary.
   - Run fixed Gold SQL, then Genie metric checks, then at most three bounded live AgentCore turns: account brief, options, and analytics.
   - Prove actual tool calls, source IDs, and existing browser premium-mode chat behavior. Do not create a route or redesign the UI.

## Validation

- Add pure tests for schemas, known-account rejection, SQL scope, product exclusion, no fanout, output caps, and provenance rejection.
- Add fake-CLI tests for POST JSON-RPC, GET preservation, initialization notification handling, protocol order, JSON-RPC failures, `in_progress` polling, cancellation reconciliation, terminal states, and result bounds.
- Add tests for all valid Gold query items, failed-query metadata without rows, no-query evidence failure, recoverable input errors, and protocol or provenance aborts.
- Add compatibility tests for West `get_sales_evidence`, recovery, tool parsing, the premium per-turn cap, the West per-response cap, memory sessions, and abort handling.
- Run `bun test`. The baseline is 162 passing tests.
- Run the live verifier only after setup preflight. It must check fixed SQL values, correct Genie values, real AgentCore calls, and evidence source IDs.
- Use the existing browser chat surface to test premium mode. No new UI path exists.

## Deployment and operations

1. Start premium mode only through `AGENTCORE_CHAT_DATA_SOURCE=premium`; preserve the West default and recovery behavior.
2. Run read-only CLI, AWS, Cost Explorer, and cost-ledger preflight checks.
3. Validate the planned Genie JSON and print the exact owned creation scope.
4. Create or verify the marked Genie agent.
5. Run unit tests, the simplify pass, and focused tests again.
6. Run the live verifier and browser check.
7. Run one independent code review after implementation. Do not merge without the required review and authorization.

Use 512 MiB memory for routine checks and 768 MiB for live verification. The preview process uses 256 MiB and a four-hour limit. `node_modules` is an untracked symlink and remains excluded.

## Risks and open questions

- **Verified limit:** Genie One GA documentation does not guarantee read-only enforcement. The two fixed tools are read-only by their fixed SQL. The analytics tool uses the current administrator context because the user explicitly accepted this boundary and excluded permissions work.
- **Verified limit:** Curation, the fixed question prefix, and provenance checks are quality controls. They are not an authentication boundary or hard DML prevention.
- **Verified limit:** Genie One route selection cannot be pinned by this configuration. The client validates the currently visible system route at use time.
- **Verified limit:** Cost Explorer can lag and does not cover Databricks billing. The local ledger is not a live billing control.
- **Inference:** A fresh Genie conversation per analytics call reduces cross-question context carryover. It does not prove model isolation.
- **Verified completion:** The Genie setup checked the current creation payload, returned metadata, and existing parent path before it created or verified the owned agent.

## Review record

**Plan review complete.** Opus 5.5 reviewed the complete plan with Sonnet 5.5 repository context on 2026-10-16. The reviewer found eight material items. The plan accepts findings 1 through 6 and 8. It accepts finding 7 with a stricter fail-closed bound: results over 50 rows or 64 KiB are rejected, not cut. The review confirmed Genie One discovery-only curation and the current administrator boundary. Implementation is authorized. Expected live side effects are one owned agent, Genie conversations, query history, and warehouse compute.

**Code review record.** Sonnet 5.5 completed the repository-context pass. Opus 5.5 code review exceeded its 240-second limit with exit code 124 and no result. A separate Codex GPT-6 Astra fallback review found two P2 issues. The authors accepted both findings and added regression tests.

1. Fixed Gold provenance construction. The original comma join and literal CTE did not prove a Gold source. The implementation now returns fully qualified Gold object names and row identifiers from decoded Gold results.
2. Fixed the deterministic scan scope. The original default account argument reapplied `A100` when the scan passed `undefined`. Fixed account tools now pass `A100` explicitly. The scan can return multiple account rows.

No second review round is required. The independent review fixes are the Gold provenance construction and deterministic scan scope fixes above. This record proves Genie setup, data-only verification, and Premium AgentCore tool calls. It does not prove browser prompt execution or standalone MCP spans.
