# Databricks layout proposal: enough evidence for a useful seller agent

Status: **Proposed architecture.** The 10,000-record baseline is a locked product decision. The admission-ticket interpretation, counts, limits, and clocks below are proposed defaults until implementation measures them. Research date: **2026-10-15**.

## Goal

Build a small, repeatable analytics layout for the premium-sales demo. It gives an agent evidence for ten seller cases without pretending to model an enterprise warehouse. This proposal proposes 10,000 synthetic admission tickets as the first interpretation of the locked 10,000 Ticketmaster records. The important optimization is fewer tool calls and smaller evidence results. A 10,000-ticket dataset can improve agent retrieval even if warehouse latency changes little.

The committed premium-sales mock is browser-only. Older repository work covers West-region show-sales snapshots. This proposal does not claim a live Databricks workspace inspection or an existing premium-sales schema.

<!-- digest:start -->
Use one `livenation_demo` catalog with bronze, silver, and gold schemas. Preserve raw source envelopes, normalize fifteen facts and dimensions, then expose small read-only views to a bounded agent adapter.
<!-- digest:end -->

## Decisions

| Area | Recommendation | Cost and reason |
| --- | --- | --- |
| Baseline | Generate exactly 10,000 synthetic admission tickets. | It is a decision-record limit, not a scale claim. Larger tiers stay separate. |
| Storage | Use managed Delta tables in one `livenation_demo` catalog. | It avoids bespoke S3 work. Workspace catalog fallback needs verification. |
| Loading | Use batch synthetic imports and a public ListenBrainz catalog refresh. | Replay is simple. This is not a live Ticketmaster integration. |
| Agent access | Use prepared, parameterized SQL through a server adapter. | It limits query shape. It does not support arbitrary SQL. |
| Analytics | Add curated Genie One only for broad regional questions. | It is less deterministic than the scan. UC permissions remain the boundary. |
| Layout | Start with unpartitioned managed Delta tables and no manual clustering. | A small demo may gain nothing from layout work. |
| Actions | Keep drafts, holds, approvals, and delivery state in the server. | Delta inventory is evidence, not reservation authority. |

## 1. The layout separates replay, facts, and seller answers

<!-- fig:pipeline -->

`livenation_demo` is the proposed Unity Catalog catalog. A metastore is the top-level Unity Catalog registry. A catalog groups schemas. A schema groups tables and views. Managed Delta tables store data. A SQL warehouse supplies query compute. Unity Catalog supplies permissions and lineage. These are separate jobs. [Medallion architecture](https://docs.databricks.com/aws/en/lakehouse/medallion), [Unity Catalog](https://docs.databricks.com/aws/en/data-governance/unity-catalog/), and [managed tables](https://docs.databricks.com/aws/en/tables/managed)

Delta is data files plus a transaction log that records valid table changes. If catalog creation is unavailable, use the existing workspace catalog with prefixed schemas: `workspace.ln_premium_bronze`, `workspace.ln_premium_silver`, and `workspace.ln_premium_gold`. This fallback is unverified.

Bronze stores source replay envelopes: `ticketmaster_raw`, `crm_raw`, `inventory_raw`, and `artist_catalog_raw`. Each row contains a payload, source identifier, `ingested_at`, `batch_id`, and `synthetic` flag. Silver holds accepted, normalized facts. Rejected source rows remain in bronze. A batch validation report records rejection reasons and source IDs. Gold holds read-only virtual business views.

Batch rebuilds use the same inputs and fixed seed. No load runs as part of this proposal. A 100k or 1m opt-in stress tier can exist later. It must not replace the locked 10k baseline.

## 2. A relational core prevents false customer evidence

<!-- fig:erd -->

The schema has fifteen silver tables. PK means primary key. FK means foreign key. In Databricks, PK and FK relationships are informational. They do not enforce row validity. Ingestion must reject duplicate keys, orphan references, ambiguous identity links, and invalid status values. Use `NOT NULL` and `CHECK` where they fit. Do not use `RELY` until guarantees exist. [Constraints](https://docs.databricks.com/aws/en/tables/constraints) and [CONSTRAINT clause](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-ddl-create-table-constraint)

| Table and grain | Minimum fields | Rule that prevents a false claim |
| --- | --- | --- |
| `accounts` one account | `account_id` PK, name, seller_id, region, state, `primary_venue_id` FK, account_kind | Demo account affiliation is fixed. |
| `contacts` one contact | `contact_id` PK, `account_id` FK, name, current_role, status | A contact changes role without changing history. |
| `identity_links` one source identity | `identity_link_id` PK, source_system, source_customer_id, `contact_id` FK, verification_status, verified_at | Accept one verified link. Reject conflicting or unverified links. Never join names. |
| `contracts` one contract | `contract_id` PK, `account_id` FK, `venue_id` FK, start/end, renewal_due_date, signed_at, status, currency, contract_value, quote_value, quote_accepted_at, allotted_quantity, is_current | At most one verified current contract exists per account. A lead can have none. A draft quote is a pre-signature contract row simplification. |
| `activities` one CRM signal | `activity_id` PK, `account_id` FK, optional `contact_id` FK, optional `contract_id` FK, purpose, occurred_at, direction, activity_type, signal_code | Renewal activity uses `contract_id` and purpose. Unrelated activity does not reset renewal outreach. |
| `orders` one order | `order_id` PK, optional `identity_link_id` and `contract_id` FKs, ordered_at, currency, status | An order has no ticket-count meaning. |
| `order_items` one product line | `order_item_id` PK, `order_id` FK, `event_id` FK, product_code, quantity, item_status, refunded_amount, net_amount | Admission, VIP, and parking stay separate. `net_amount` is after refunds. Void or cancelled lines exclude sales and purchase eligibility. |
| `tickets` one admission ticket | `ticket_id` PK, `order_item_id` FK, ticket_status | Exactly 10,000 admission rows. |
| `scans` one scan attempt | `scan_id` PK, `ticket_id` FK, scanned_at, outcome | Count at most one successful use per ticket. A purchaser did not necessarily attend. |
| `venues` one venue | `venue_id` PK, name, state, timezone, portfolio_flag | Seller portfolio differs from gift-event geography. |
| `artists` one artist | `artist_id` PK, musicbrainz_id, name | Public artist identity stays separate from customers. |
| `events` one event | `event_id` PK, `venue_id` FK, `artist_id` FK, event_at, status | One featured artist per event. Lineups are deferred. |
| `artist_relations` one directed catalog relation | seed_artist_id FK, related_artist_id FK, source, retrieved_at, relation_type, batch_id | Logical PK is seed, related, source, batch. It is qualitative evidence, not taste probability. |
| `entitlements` one benefit rule | `entitlement_id` PK, `account_id` FK, optional `contract_id` and `event_id` FKs, product_code, valid dates, quantity | An event rule applies only to that event. A contract-wide rule requires active status, contract dates, matching venue, and relevant product. Parking excludes already included or purchased benefits. |
| `inventory_snapshots` one observed event/product/source state | `snapshot_id` PK, `event_id` FK, product_code, source_type, available_qty, unit_price, currency, observed_at | Latest snapshot is evidence, not a hold. |

Proposed generator targets are about 240 accounts, 500 contacts, 5,000 orders, 8,000 scan attempts, 150 events, 50 artists, 2,000 activities, 200 contracts, 200 entitlements, 600 inventory snapshots, 100 artist relations, and 6,500 order items. These are not measurements. Ten fixtures contain six renewals, three leads, and one upsell. Background rows must not trigger fixture attention rules. Artist evidence connects an account's verified purchaser identities to `order_items`, then to an event's featured `artist_id`. It never connects a catalog relation directly to a customer preference.

Use 24 months of history and 90 days of upcoming events. The proposed frozen `:as_of` timestamp is `2026-10-15T16:00:00Z`. Activity timestamps use UTC. The 14-day test uses elapsed UTC hours. Contract due dates compare with `:as_of` in the contract venue timezone. Source `refreshed_at` remains separate from the demo clock.

## 3. Gold answers a seller question without exposing raw rows

<!-- fig:gold -->

Gold contains ordinary views, not stored results. A normal view stores SQL and computes at read time. A materialized view stores refreshed output. Do not add materialization now. [Views](https://docs.databricks.com/aws/en/views/)

| Gold view | One row means | Important rule |
| --- | --- | --- |
| `account_attention` | one account and observable inputs | It exposes due date, signed state, renewal outreach and reply facts, structured signals, and allotted, issued, and used counts. A prepared query applies the `:as_of` rule. |
| `account_artist_evidence` | account and artist | Direct purchase count and distinct used-ticket count retain source IDs. Related artists remain separate. |
| `upcoming_options` | event, product, and inventory source | Latest inventory includes public catalog provenance. Artist candidates remain separate evidence arrays, so relations never multiply option rows. |
| `account_event_benefits` | account, event, and product | Included and purchased quantities stay separate before joins. |
| `regional_sales` | one order item with safe dimensions | Admission revenue and parking revenue stay explicit. Refunded and void policy stays explicit. |

The server exposes only `scan_attention(as_of)`, `get_account_brief(account_id, as_of)`, and `find_options(account_id, as_of)`. Ordinary views have no runtime parameters. Prepared queries bind `:as_of` everywhere, instead of using `current_date()`. **Recommended interpretation, open for product confirmation:** a stalled renewal is due 0 to 30 days inclusive, unsigned, has a latest renewal-specific outbound outreach at least 14 times 24 hours before `:as_of`, and has no inbound reply after that outreach in the same conversation. If outreach is absent or only `last_reply_at` exists, the result is missing evidence, not a stall. A recent reply or contact-change reason has priority over this generic rule. Each account gets one deterministic card and reason list. A scan is one set-based query, then selected-account briefs. Ten cards do not need ten warehouse queries.

The server derives `seller_id` from the authenticated session. It validates that a requested account belongs to that seller. It scopes every gold query to the CA, OR, and WA portfolio. The model cannot send seller identity as a parameter. A gift destination can be outside that venue portfolio, such as Levi's, without expanding customer scope. Gold grants alone do not filter rows, so the views and prepared queries apply the single-seller scope. Multi-seller policy is out of scope.

The account brief calculates utilization as distinct valid accepted contract-linked admission tickets divided by the same contract's `allotted_quantity`. A missing or zero denominator gives unknown, not zero utilization. Active, nonvoid issued tickets remain a separate count. Whole-account purchases outside the contract do not enter this metric. Historical use counts distinct accepted valid admissions.

Proposed budgets are 50 scan rows and 100 brief rows or 32 KiB serialized JSON. Statement Execution byte limits measure an internal representation, so the adapter separately measures actual JSON. It must fail, refine, or paginate when a budget is exceeded. It must never silently remove counts. It aggregates first and limits only sampled evidence. Each result includes source IDs, `data_as_of`, and statement ID.

The adapter has a proposed 30-second deadline. It cancels work and checks terminal state and truncation. Each server correlation record stores trace ID, tool-call ID, and statement ID. Query tags are optional after platform validation and contain no customer identifier. These values are design choices, not Databricks limits. Statement Execution supports parameters, row and byte limits, and a failed state inside an HTTP 200 response. [Statement Execution API](https://docs.databricks.com/api/statement-execution/v1/execute-statement)

## 4. Fan-out is the main correctness risk

<!-- fig:fanout -->

Two tickets with one successful scan and one retry scan each create four rows after a ticket-to-scan join. That does not mean four attendees. `SUM` across the four joined rows produces an incorrect $4,000 instead of the one $1,000 order-item amount. Count distinct accepted valid ticket IDs. Aggregate scan facts before a wider join. Compute admission revenue once per order item. Latest inventory orders by `observed_at DESC, snapshot_id DESC`. Current-contract loading enforces at most one `is_current` row per account. Admission ticket count must equal order-item quantity. Physical issue counts retain void rows; current issued and purchase metrics exclude void or cancelled tickets and lines.

The seller agent receives selected evidence, not the warehouse. This reduces model context and makes proof inspectable. It does not require a vector database, streaming, Kafka, or an ML model.

## 5. Permission boundaries stop the model from acting

<!-- fig:boundary -->

Use logical roles, not necessarily four new principals. The loader writes bronze and silver and refreshes ListenBrainz. A stable view owner reads silver and owns gold. The agent and Genie read principal has `USE CATALOG`, `USE SCHEMA`, `SELECT` on gold, and warehouse `CAN USE`. The demonstrator owns shown queries or has `CAN MONITOR`. Do not grant the read principal raw, silver, or write access. SQL warehouses use the view owner's source permissions. [View permissions](https://docs.databricks.com/aws/en/views/)

Genie One is optional for broad regional analytics. Use the dedicated gold-only read principal, never an operator or administrator OAuth identity. It can share the adapter read principal. A curated Genie Agent is optional, not a new required service. Test that silver, raw, and legacy-workspace questions are denied. Genie access and spend are unverified and not deployed. Its configuration narrows relevance. Unity Catalog privileges enforce the real boundary. Its current route is `https://<workspace-hostname>/ai-gateway/mcp-services/system.ai.genie_one_mcp`; the older Genie endpoint sunsets on 2026-10-31. Workspace capability needs verification. [Genie One MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp)

The server owns drafts, holds, approvals, idempotency, and delivery. Seller selection makes a hold and draft. Seller approval releases once after a new live synthetic-inventory check. Only public artist IDs go to ListenBrainz. Customer data does not go to the public artist catalog.

## 6. Measure retrieval before physical optimization

<!-- fig:measure -->

Compare a naive per-account query and full-row dump against a set-based scan and selected brief. First prove both answers match on the same dataset. Then record tool calls, JSON bytes, returned rows, statement ID, warehouse read rows, read bytes, shuffle, execution milliseconds, waiting-for-compute time, and end-to-end time.

Run repeats and report median and range. Separate result cache from disk or IO cache. A cached result can lack a query profile. Do not call a first run cold without proof. `system.query.history` records are typically available within one hour, though new workspaces can take longer, and table access usually needs administrator rights. The Query History UI and query profile are separate live-interview surfaces. Use saved actual runs as fallback. [Query history](https://docs.databricks.com/aws/en/admin/system-tables/query-history) and [query profile](https://docs.databricks.com/aws/en/sql/user/queries/query-profile)

| Measure | Before | After |
| --- | ---: | ---: |
| Tool calls | not measured | not measured |
| JSON bytes | not measured | not measured |
| Warehouse execution | not measured | not measured |
| End-to-end time | not measured | not measured |

Databricks recommends liquid clustering for new tables. This small baseline should remain unpartitioned, with no manual clustering keys. Do not partition below 1 TB. Do not combine ZORDER with liquid clustering. Predictive optimization is inherited and can be enabled by default. Inspect the catalog, schema, and table state before load. Decide an explicit cost-approved state before loading. Without cost authorization, disable it only on newly created demo schemas, never a shared workspace catalog. `CLUSTER BY AUTO` needs managed tables and predictive optimization. If an eligible existing serverless warehouse exists, use a proposed five-minute UI idle stop. Pro and classic warehouses have a ten-minute minimum. Idle warehouses incur charges. Any stress test uses the same snapshot, workload, warehouse, and cache regime. [Liquid clustering](https://docs.databricks.com/aws/en/tables/clustering), [partitioning](https://docs.databricks.com/aws/en/tables/partitions), [predictive optimization](https://docs.databricks.com/aws/en/optimizations/predictive-optimization), and [warehouse cost controls](https://docs.databricks.com/aws/en/compute/sql-warehouse/create)

Metric views are a future option if repeated metric definitions grow. Ordinary views are enough now.

## Acceptance examples

- All ten mock cases return the expected evidence path.
- A wrong identity link returns no history.
- Duplicate scans do not double attendance.
- An absent outreach or reply history does not invent a stall.
- Exactly 14 elapsed days and exactly 30 local due-date days have deterministic tests.
- A contact change or recent reply takes priority over a generic stale rule.
- Artist relations state no probability.
- Included or purchased parking produces no upsell.
- A stale snapshot causes a server recheck.
- Approval denial blocks delivery.
- A repeated delivery request releases once.
- An out-of-scope account returns not found.
- Silver, raw, and legacy-workspace questions are denied to the agent and Genie read principal.

## Why this is not Postgres

Postgres is suitable for transactional state such as holds and approvals. This design needs analytical joins over synthetic history, evidence views, and query proof. Delta and a SQL warehouse fit that read path. The server retains the transactional action path.

## Glossary

- **Delta:** data files plus a transaction log that records valid table changes.
- **Catalog, schema, table:** the metastore registry contains catalogs; catalogs contain schemas; schemas contain tables and views.
- **Warehouse:** managed compute that runs SQL. It does not store the Delta table.
- **View and materialization:** a view stores query text and calculates on read. A materialized view stores refreshed results.

## Fixture map and seller walkthrough

| Fixture | Observable source | Path and limit |
| --- | --- | --- |
| Smith & Smith | Contract due in 18 days, unsigned, renewal outreach 17 days ago, no later inbound reply, verified U2 purchase and accepted scans | A prepared scan returns the stalled reason. The brief separates direct U2 evidence from ListenBrainz related-artist evidence. |
| Cedar & Co. | Inbound reply two days ago requests calendar and guest packages | Return a response task, not a stall. |
| Northline Partners | Recent budget concern | Ask for budget and guest needs. |
| Meridian Advisory | Quote acceptance with unsigned contract | Ask for signer and date. Acceptance is not signature. |
| Summit Design Group | Contact replacement signal | Ask for authority and timeline. |
| Cascade Health Group | Recent underuse signal | Review use. Do not default to a gift. |
| Evergreen Ventures | Inbound inquiry | Start discovery. Do not qualify the lead. |
| Columbia Ridge Capital | Outbound prospect without verified history | Request permission-based outreach. |
| Alder & Stone | Site-visit request | Check options and goals. Do not confirm a time. |
| Redwood Creative | Four direct VIP purchases, event in 12 days, general parking included, no Premier purchase | Check Premier inventory only after the entitlement and purchase tests exclude it. |

Smith uses `:as_of = 2026-10-15T16:00:00Z`. The scan returns a contract reason and source IDs. The brief follows a verified identity link to order items and distinct accepted tickets. It presents a U2-to-Depeche Mode catalog relation separately from customer evidence. `find_options` returns allocated Levi's inventory. Selection creates a draft and synthetic hold. Approval rechecks inventory and releases once.

The fan-out figure uses an example order item with $1,000 admission revenue. It has two tickets. Each ticket has an accepted scan and one retry. The join has four scan rows, but only two distinct accepted ticket IDs and one $1,000 order-item amount.

## Open questions

1. **Recommended:** Confirm the outreach-anchored stall policy. It needs renewal `contract_id` and purpose metadata. It prevents stale unrelated replies from creating a stall.
2. Verify workspace catalog creation, Unity Catalog tier, selected SQL warehouse, and view-owner behavior.
3. Select refresh cadence after the demo path and cost are known.
4. Approve or reject predictive optimization only after its cost is visible.
5. Decide whether an opt-in 100k or 1m stress tier is useful after the 10k baseline works.

## Review disposition

An independent Sonnet 5 context review and Opus 5 judgment review completed on 2026-10-15. The reviewer approved with changes. This section records one triage pass.

1. **Accepted.** The proposed outreach anchor replaces stale inbound-reply time. Product confirmation remains open.
2. **Accepted.** Genie uses a dedicated gold-only read identity. Its spend and access remain unverified.
3. **Partially accepted.** Predictive optimization state is inherited and inspected before load. Disable only a new demo schema without cost approval.
4. **Accepted.** Contracts, orders, and account brief facts now cover values, quotes, allotment, issue, and use.
5. **Accepted.** The authenticated session supplies seller scope. Out-of-scope accounts return not found.
6. **Accepted.** Loader, stable view owner, read principal, and demonstrator are logical roles.
7. **Partially accepted.** A server record requires trace, tool-call, and statement IDs. Query tags are optional after validation and contain no customer data.
8. **Accepted.** `:as_of` is a UTC timestamp with explicit local due-date handling and boundary tests.
9. **Accepted.** Inventory tie-breaks, current-contract uniqueness, and ticket quantity checks are explicit.
10. **Accepted.** The RELY citation now uses the [CONSTRAINT clause reference](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-ddl-create-table-constraint). The fan-out result states $4,000 versus $1,000. A later approved deployment must remove only its created demo schemas and warehouse. It must never remove a legacy workspace schema.

The prototype basis is the [mock commit](https://github.com/elijahstr/livenation-demo/commit/8cac19b) and the [decision-record commit](https://github.com/elijahstr/livenation-demo/commit/94fc927). This proposal makes no deployment or delete action.

## Sources and evidence labels

**Verified facts** link to Databricks documentation near the related claim. **Proposed defaults** include table targets, the frozen clock, tool budgets, deadlines, permissions, and physical layout. **Unverified workspace facts** include catalog availability, tier, cost, and compute behavior. No benchmark or speedup is claimed.
