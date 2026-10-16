# One gold definition, the right tool for each job

<!-- chips:10k synthetic records|17 silver tables|6 gold objects -->

Status: **Proposal only.** No cloud service, grant, dataset field, performance result, or identity binding in this document is deployed or verified.

The main risk is a wrong business number. This proposal reduces that risk with one canonical sales definition and separate routes for seller work, analytics, engineering, and access proof. A model does not choose an identity, write ad hoc SQL for an account brief, or gain a broad native tool catalog.

### 🎓 High School

Think of the data system as an office. Bronze keeps the original envelopes. Silver checks the forms. Gold is the approved report shelf. The seller assistant is one clerk who can use only the reports for a customer conversation. An engineer has a different workbench for exact checks. A scheduled job uses a stamped form, not a clerk or a model.

The same definition answers every sales total. A $300 admission line with three valid issued tickets stays $300 and three tickets, even with five scan attempts. A $100 refund and one void ticket gives $200 and two tickets. A full refund gives $0, zero tickets, and no buyer. Scans are attempts to use tickets. They are not attendance.

For Azure readers, Bronze is like source files in ADLS, Silver is a checked Data Factory flow, Gold is a small Synapse SQL report, and Unity Catalog is close to Purview plus SQL permissions. These comparisons explain the roles. They do not mean that the products have the same features.

<!-- fig:routes -->

### 🏛️ College

Databricks uses a medallion layout. A **view** is a saved query. Its **grain** says what one row represents. A [metric view](https://docs.databricks.com/aws/en/uc-semantics/metric-views/basic-modeling) gives named measures one calculation rule. This proposal keeps five ordinary gold evidence views and adds one metric view, `gold.sales_metrics`. It has six gold objects.

The seller uses one AgentCore assistant. It uses fixed account tools for known work and Genie One MCP for an open regional question. Genie understands curated business terms. [SQL MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/databricks-sql) runs exact SQL but supplies no curated semantic context. Therefore the engineering agent uses SQL MCP for exact validation and exploration. The seller does not receive both native MCP servers as unrestricted tools.

| Job | Route | Reason |
| --- | --- | --- |
| Scan now or scheduled scan | One parameterized Statement Execution query | The rule is known and set-based. |
| Account brief or options | A fixed application query | The server validates the account and date. |
| Open regional analytics | Narrow `ask_analytics(question)` to Genie One MCP | Genie uses the curated semantic context. |
| Engineering validation | Native SQL MCP | The engineer needs exact written SQL. |
| Permission proof | Separate diagnostic AgentCore configuration | The proof must not become a seller fallback. |

<!-- fig:gold -->

### 🔬 Pro

The route choice follows job and identity, not a chain of agents. This demo has one seller and synthetic CA, OR, and WA accounts. Gold itself limits this regional slice through account and event joins. A fixed account filter selects a task. It does not authorize rows. Future multi-user scope needs Unity Catalog row controls.

`ScanNow` and its schedule execute the same versioned parameterized SQL with [Statement Execution](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial) against `gold.account_attention`. The query is set-based. It avoids one query for each account. `get_account_brief(account_id, as_of)` reads `account_attention`, `account_artist_evidence`, and `account_event_benefits`. Each grain is aggregated before any combination. `find_options(account_id, as_of)` reads the option, evidence, and benefit views. `upcoming_options` is evidence. It never reserves inventory.

`ask_analytics(question)` calls [Genie One MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp) with seller OAuth. Genie may write SQL, but the seller route has no ad hoc SQL or SQL MCP fallback. It may discover permitted assets beyond the curated Agent. Curation improves relevance but does not enforce access. Ambiguous questions return clarification.

The existing engineering coding-agent configuration uses native SQL MCP with read-only access by default. It performs schema and exact checks. Published demo data grants no writes. An approved development sandbox is not a fourth medallion layer. `disallow_writes=true` blocks all writes.

The diagnostic `check_data_access` tool runs only in its separate configuration. It sends exactly three fixed `SELECT` probes through the native MCP route under the real seller user: one gold view, `event_financials`, and `artist_deal_terms`. It records the executing identity and audit evidence. There is no administrator fallback. If the actual user JWT binding or `session_user()` evidence cannot prove the caller, the proof is incomplete.

## Medallion and catalog layout

The proposed hierarchy is `livenation_demo.bronze`, `livenation_demo.silver`, and `livenation_demo.gold`. Bronze keeps source envelopes from `ticketmaster_raw`, `salesforce_raw`, `inventory_raw`, `artist_catalog_raw`, and `finance_raw`. `salesforce_raw` holds synthetic Salesforce-shaped CSV or JSON exports. No Salesforce connector or real CRM data exists.

Silver normalizes and checks source records. Gold exposes seller evidence. The locked baseline has 10,000 synthetic Ticketmaster records. The proposed source admission-ticket envelope is the count unit. CRM and finance rows are additional design data. Bronze retains source ID, batch ID, ingestion time, original payload, synthetic flag, and rejected records.

## The six gold objects

`account_attention` has one account per row and holds renewal and activity inputs. `account_artist_evidence` has one account and artist per row. It separates direct purchases from public artist relations. `upcoming_options` has one event, product, source, and latest record per row. `account_event_benefits` has one account, event, and product per row. The same included or purchased product blocks a duplicate offer. General Parking does not block Premier Parking. `regional_sales` has one `order_item_id` per row.

`regional_sales` holds canonical definitions once. Admission includes standard and VIP admission. Parking is separate. Add-ons are neither. Values use USD. Cancelled and void lines are excluded. Refunds are deducted. `admission_account_id` is null without a valid admission purchase. Valid ticket quantity pre-aggregates issued ticket IDs per line. It is independent of scans.

`sales_metrics` uses `regional_sales` as its source. It defines four proposed demo measures: `net_admission_revenue`, `net_parking_revenue`, `valid_admission_tickets`, and `admission_buying_accounts`. The first three use `SUM` on canonical fields. The last uses `COUNT(DISTINCT admission_account_id)`. The default date axis is `sale_date`. A question about `event_date` must say so. “Ticket revenue” means net admission revenue after refunds. “Revenue” needs clarification when admission and parking both apply.

No sell-through, venue attendance, customer probability, or full-inventory metric exists. The data lacks a safe denominator or identity. The route returns “not supported” instead of a guess. The metric view is semantic consistency, not a cache or performance shortcut.

<!-- fig:metrics -->

## One curated Genie agent

One Premium Sales curated Genie Agent contains the five evidence views and `sales_metrics`. It documents approved descriptions, fields, synonyms, dates, currency, refund definitions, validated joins and cardinality, sample approved SQL, measure names, and the unsupported-answer policy. Regional KPIs use `sales_metrics`. Fixed operational questions use the ordinary views.

Genie One [discovery](https://docs.databricks.com/aws/en/genie-one/chat) searches available Genie Agents and permitted assets. The new endpoint is `/ai-gateway/mcp-services/system.ai.genie_one_mcp`. Only root legacy `/api/2.0/mcp/genie` retires on 2026-10-31. Current documentation does not show a hard pin through `genie_ask`. Conversation API or AI Bridge is an alternative if hard pinning becomes required.

## Boundaries and proposed efficiency

Use one existing compatible SQL warehouse after its ID, access, capacity, and cost are checked. Preset its `warehouse_id` in MCP metadata and Statement Execution. Fixed routes avoid a Genie call and a second model call. SQL filters and aggregates before JSON leaves Databricks.

Proposed route caps are 50 rows for a scan and 100 rows or 32 KiB serialized JSON for a selected brief or option result. Each response records dataset version, `as_of`, source IDs, and statement IDs when returned. The initial fixed-route deadline is 30 seconds. The Genie deadline is 60 seconds. These targets are not an SLA.

Genie and SQL MCP start asynchronously. A preview is never a total. Statement Execution verifies chunk completeness separately. A 60-second proposed budget returns incomplete, cancels when supported, and offers a narrower question or manual retry. It does not restart or use fallback SQL.

There is no shared application cache at first. One answer may reuse its own evidence within its session and user boundary. Action inventory checks remain live. A validated synthetic dataset version stays frozen for the demo and benchmark run. Bronze load, Silver checks, and Gold publication finish before routes become ready. Delta layout changes, materialized aggregates, manual partitioning, and cluster tuning wait for a measured profile.

<!-- fig:measure -->

## Validation and rollout checks

Correctness comes first. Hand-calculated source fixtures are the independent oracle. Metric-view SQL checks route parity only. Fixtures include the $300 line, refund, void, scans, General versus Premier Parking, and outside-region denial. About twelve benchmarks cover revenue, date axes, benefits, denial, identity, and no fallback. The original scope remains six renewals, three leads, and one parking case.

Then measure calls, rows, JSON bytes, end-to-end time, model versus SQL time, warehouse bytes read, spills, queue time, startup time, and cache flags. A 10,000-record demo does not prove enterprise performance.

The proposed sequence is: load and validate; curate Genie; run fixed fixtures; benchmark Genie and engineering SQL; verify OAuth and the denial trace; measure; then present. Do not run cloud work from this document.

## Technical reference

<details>
<summary>Show contracts, example SQL, and evidence limits</summary>

### Metric query example

This illustrative query is not executed by this proposal:

`SELECT venue_state, MEASURE(net_admission_revenue) AS revenue FROM livenation_demo.gold.sales_metrics WHERE sale_date BETWEEN :start_date AND :end_date GROUP BY venue_state;`

The proposed `regional_sales` fields need source validation before implementation. Child tickets pre-aggregate per order item. Raw scans, artist relations, entitlements, and inventory never join the metric fact in a way that multiplies money. Ticket quantity is not `COUNT(order_items)`.

The proposed source contract has `order_timestamp`, pre-refund line amount without fees or tax, `refunded_amount`, `line_status`, `product_family`, `ticket_id`, and `ticket_status`. `sale_date` is the original venue-local order date at frozen `as_of`; `event_date` is separate. Later refunds restate that original `sale_date`; they do not use a refund date. Refunds are between zero and line amount. Invalid states reject. A valid ticket is issued and not cancelled, void, or refunded. Scans do not define validity. A full refund has zero amount, zero valid tickets, and a null buyer. An account still counts if another valid line exists. A bundle price stays on admission and has no invented benefit allocation. Timestamps are at or before the cutoff. Partial refunds do not reduce ticket quantity unless a related ticket becomes invalid.

### Access contract

Seller access is `SELECT` on the six gold objects only. The view owner has only the 15 operational silver sources. The two finance tables, `event_financials` and `artist_deal_terms`, stay outside every seller view. The seller has no finance `SELECT`. Before any grant, inspect workspace defaults, inherited privileges, ownership, bound catalogs, default schemas, and create grants. The proposed application tool allowlist has no wildcard.

The seller needs `USE CATALOG livenation_demo`, `USE SCHEMA gold` and `silver`, `SELECT` on six gold objects, warehouse `CAN USE`, and [MCP `EXECUTE` plus parent `USE` privileges](https://docs.databricks.com/aws/en/agents/mcp-tools/mcp-services). The `ai-gateway` OAuth scope and any Statement Execution API-specific scope need preflight verification. The engineering agent uses `https://<workspace>/ai-gateway/mcp-services/system.ai.dbsql` with the 15 operational silver and six gold reads only. It gets no finance or write grant. SQL MCP service access can support gold queries from another client with the same grants. The application allowlist is not an identity-wide SQL restriction. Curated-Agent run access needs a preflight with its actual name.

The native SQL MCP endpoint is [beta and can allow writes by default](https://docs.databricks.com/aws/en/agents/mcp-tools/databricks-sql). Its policy and Unity Catalog grants need live verification. Preflight Unity Gateway beta, administrator enablement, warehouse metric compatibility, and OAuth grants before load. Gateway three-legged OAuth uses [default synchronization or a static schema](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-MCPservers.html), not a dynamic tool list. The seller application uses trusted [client-side inline function handlers](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html). The seller `allowedTools` list is exactly `get_account_brief`, `find_options`, and `ask_analytics`. It has no Gateway or native MCP tool. The diagnostic list is exactly `check_data_access`. The handler binds verified seller JWT context to configured Databricks three-legged OAuth through Gateway. ScanNow is a direct deterministic server route. Tokens stay outside model context.

### Dataset manifest and proof

A server-side immutable JSON manifest maps `dataset_version` to seed and input hashes, source Delta versions, Gold SQL and metric YAML, query versions, and frozen `as_of`. It is not a seventh Gold object. Routes enable only after publication matches the manifest. They disable if the dataset changes. Wrappers stamp responses and benchmarks with the manifest. Genie does not provide this version.

The fixed seed has a linked rejection report that records each source ID and reason. Sequential MCP polls never overlap. A serialized row or byte overflow returns an explicit budget error, never a partial scan. `genie_get_query_result` can truncate. The route refines or fails; it does not treat that result as complete. Statement Execution checks its chunks separately.

The diagnostic template is `SELECT session_user() AS executing_user, event_id FROM <table> LIMIT 1`. It runs against `gold.regional_sales`, `silver.event_financials`, and `silver.artist_deal_terms` on the same warehouse and identity. Only the table name changes. A Unity Catalog table denial differs from a Gateway failure. Audit attribution is required. The trace does not invent a statement ID.

<!-- fig:authorization -->

<!-- fig:trace -->

The [AgentCore trace](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html) requires CloudWatch Transaction Search. Native traces can include model and tool calls. The sanitized diagnostic tool result contains only outcome, resource, principal reference, upstream status, request ID, and a returned statement ID. Tokens and headers never enter that tool payload. Audit must show the actual effective caller, not an application-user claim.

### Silver and action contracts

The 17 proposed silver tables are operational CRM: `accounts`, `contacts`, `identity_links`, `contracts`, and `activities`; commerce: `orders`, `order_items`, `tickets`, and `scans`; event and artist: `venues`, `events`, `artists`, and `artist_relations`; benefits and inventory: `entitlements` and `inventory_snapshots`; finance: `event_financials` and `artist_deal_terms`.

Inventory snapshots are seller evidence only. A server-side action rechecks live inventory before it holds, drafts, or releases an option. The seller approves release. The snapshot never becomes reservation authority.

### Evidence sources

Verified documentation, read on 2026-10-16: [Genie One MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp), [Databricks SQL MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/databricks-sql), [AI trust](https://docs.databricks.com/aws/en/databricks-ai/databricks-ai-trust), [Genie Agent concepts](https://docs.databricks.com/aws/en/genie-agents/concepts), [Genie benchmarks](https://docs.databricks.com/aws/en/genie-agents/monitor), [metric-view modeling](https://docs.databricks.com/aws/en/uc-semantics/metric-views/basic-modeling), [metric-view creation](https://docs.databricks.com/aws/en/uc-semantics/metric-views/create), [metric-view YAML](https://docs.databricks.com/aws/en/uc-semantics/metric-views/yaml-reference), and [views](https://docs.databricks.com/aws/en/views/).

The earlier approved detailed authentication and trace discussion remains available in [commit `2f1e510`](https://github.com/elijahstr/livenation-demo/blob/2f1e510/docs/design/databricks-layout/proposal.md). It does not verify current integration behavior.

The original schema is in [commit `c47eb5f`](https://github.com/elijahstr/livenation-demo/blob/c47eb5f/docs/design/databricks-layout/proposal.md). The [ten-fixture decision record](https://github.com/elijahstr/livenation-demo/blob/94fc927306b04aa1b56741f161953cb496d9a35c/docs/design/premium-sales/decisions-and-research.md) remains the source for that scope.

The review used Sonnet 5.5 for context and Opus 5.5 for judgment. It required revision. R1 partially retains Genie MCP and records discovery risk. R2 adds the independent oracle. R3 adds Gold regional scope. R4 adds the inline boundary. R5 adds refund rules. R6 adds grants and preflight. R7 adds the manifest. R8 restores proof figures. R9 partially updates terminology and timeout behavior. No live check or renewed approval is claimed.

<!-- fig:erd -->

</details>
