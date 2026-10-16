# A concrete Bronze, Silver, Gold walkthrough

<!-- chips:synthetic only|5 Bronze tables|17 Silver tables|6 Gold objects -->

Status: **Illustrative architecture.** This page explains the reviewed proposal. It does not create a cloud service, execute a query, or describe a live Live Nation system.

### 🎓 High School

Bronze is the mail room. Silver checks and links facts. Gold is the approved report shelf. Delta saves data with transaction logs. A warehouse computes queries. Unity Catalog controls access and records lineage.

This fictional Harbor Works fixture does not replace the locked 10,000-record Ticketmaster baseline. The small rows teach the rules. They are not a load or a Live Nation policy.

<!-- fig:system -->

<!-- fig:fixture -->

### 🏛️ College

A table grain says what one row means. Bronze has one source envelope. Silver has checked business facts. Gold has answer-ready evidence. `sales_metrics` returns a logical measure query result. It does not store metric rows.

MCP is a tool protocol. Genie One is a natural-language query service. Native SQL MCP runs exact SQL. AgentCore Gateway is an AWS bridge. Unity Gateway publishes Databricks native MCP endpoints. These gateways have separate jobs.

<!-- fig:routes -->

### 🔬 Pro

The seller UI calls one AgentCore managed harness. The model requests one approved tool. Trusted client-side application inline handlers validate input, bind verified seller context to Databricks OAuth, and execute it. The seller tool list is `get_account_brief`, `find_options`, and `ask_analytics`.

Known work uses parameterized Statement Execution. Open regional analysis uses `ask_analytics` through AgentCore Gateway to Genie One MCP. Genie can discover other permitted assets. Curation improves relevance but does not enforce access. The seller has no SQL MCP fallback.

The engineering coding agent uses native SQL MCP at `https://<workspace>/ai-gateway/mcp-services/system.ai.dbsql`. It can read 15 operational Silver tables and six Gold objects. It cannot read finance or write. Genie One uses `/ai-gateway/mcp-services/system.ai.genie_one_mcp`.

## Bronze: original synthetic envelopes

Bronze has five Delta tables: `ticketmaster_raw`, `salesforce_raw`, `inventory_raw`, `artist_catalog_raw`, and `finance_raw`. Each saves `payload`, `source_id`, `ingested_at`, `batch_id`, and `synthetic`. These source and field excerpts show representative records. They are not complete source exports. The other Bronze envelopes produce the remaining Silver rows.

<!-- digest:show-table -->
| Table | Example source ID | Example ingested time | Example batch | Example synthetic flag | Example payload |
| --- | --- | --- | --- | --- | --- |
| `ticketmaster_raw` | TM-T1 | 2026-10-16T09:00Z | B-20261016 | true | {"ticket_id":"T1","order_item_id":"L100","order_id":"O100","event_id":"E100","status":"issued"} |
| `salesforce_raw` | SF-A100 | 2026-10-16T09:01Z | B-20261016 | true | {"account_id":"A100","name":"Harbor Works","contact_id":"C100"} |
| `inventory_raw` | INV-E200-PP | 2026-10-16T09:02Z | B-20261016 | true | {"event_id":"E200","product":"Premier Parking","units":12,"price_usd":40} |
| `artist_catalog_raw` | AC-AR100 | 2026-10-16T09:03Z | B-20261016 | true | {"artist_id":"AR100","name":"The Meridian Lights"} |
| `finance_raw` | FIN-E100-COST | 2026-10-16T09:04Z | B-20261016 | true | {"event_id":"E100","production_cost_usd":90000} |

The Salesforce-shaped input is mimicked JSON or CSV. No connector exists. `TM-BAD-01` with unknown venue V999 remains in Bronze with a rejection reason. It never enters Silver seller data.

## Silver: checked business facts

Silver has 15 operational tables and two restricted finance tables. L100 occurs once as a $300 admission line. Raw scans never join the money fact. A separate ticket-use aggregate can support `account_artist_evidence`.

::: details CRM rows: 5 tables

| Table | Example columns | Example row |
| --- | --- | --- |
| `accounts` | `account_id`, `name`, `primary_venue_id` | A100, Harbor Works, V100 |
| `contacts` | `contact_id`, `account_id`, `name` | C100, A100, Dana Reed |
| `identity_links` | `identity_link_id`, `contact_id`, `source_user_id` | IL100, C100, TM-U100 |
| `contracts` | `contract_id`, `account_id`, `venue_id`, `end_date` | CT100, A100, V100, 2026-12-31 |
| `activities` | `activity_id`, `account_id`, `activity_date`, `outcome` | ACT100, A100, 2026-09-30, no_reply |

:::

::: details Commerce rows: 4 tables

| Table | Example columns | Example row or rows |
| --- | --- | --- |
| `orders` | `order_id`, `identity_link_id`, `contract_id`, `order_timestamp` | O100, IL100, CT100, 2026-09-01T10:00-07:00 |
| `order_items` | `order_item_id`, `order_id`, `event_id`, `product_family`, `pre_refund_usd`, `refunded_amount`, `line_status` | L100, O100, E100, admission, 300, 0, completed; L101, O100, E100, parking, 40, 0, completed |
| `tickets` | `ticket_id`, `order_item_id`, `ticket_status` | T1/L100/issued; T2/L100/issued; T3/L100/issued |
| `scans` | `scan_id`, `ticket_id`, `scan_status` | S1/T1/accepted; S2/T2/accepted; S3/T3/accepted; S4/T1/duplicate; S5/T2/duplicate |

:::

::: details Event and artist rows: 4 tables

| Table | Example columns | Example row or rows |
| --- | --- | --- |
| `venues` | `venue_id`, `name`, `venue_state` | V100, Bay Amphitheatre, CA |
| `events` | `event_id`, `venue_id`, `artist_id`, `event_date` | E100/V100/AR100/2026-09-20; E200/V100/AR100/2026-10-28 |
| `artists` | `artist_id`, `name` | AR100, The Meridian Lights; AR200, Fictional Neighbor Artist |
| `artist_relations` | `seed_artist_id`, `related_artist_id`, `source` | AR100, AR200, catalog |

:::

::: details Benefits and inventory rows: 2 tables

| Table | Example columns | Example row or rows |
| --- | --- | --- |
| `entitlements` | `entitlement_id`, `account_id`, `event_id`, `product`, `included_qty`, `purchased_qty` | EN100/A100/E200/General Parking/1/0; EN101/A100/E200/Premier Parking/0/0 |
| `inventory_snapshots` | `snapshot_id`, `event_id`, `product`, `units`, `price_usd`, `as_of` | IS100, E200, Premier Parking, 12, 40, 2026-10-16 |

:::

::: details Finance rows: 2 restricted tables

| Table | Example columns | Example row |
| --- | --- | --- |
| `event_financials` | `event_id`, `production_cost` | E100, 90000 |
| `artist_deal_terms` | `deal_id`, `event_id`, `artist_id`, `guaranteed_fee` | D100, E100, AR100, 50000 |

:::

The five scan rows show three accepted ticket uses and two duplicate attempts. They do not show attendance or attendee identity. One order holds one admission line with three purchased admission tickets and one parking line.

::: details Open the 17-table Silver relationship map

<!-- fig:erd -->

:::

## Gold: answer-ready evidence

Gold has five ordinary views and one logical metric view. The seller reads Gold only. Gold views can read permitted operational Silver sources internally. The two finance tables remain outside every seller view.

<!-- digest:show-table -->
| Gold object | Example columns | Example row |
| --- | --- | --- |
| `account_attention` | `account_id`, `contract_id`, `contract_end`, `last_activity_date` | A100, CT100, 2026-12-31, 2026-09-30 |
| `account_artist_evidence` | `account_id`, `artist_id`, `purchased_admission_tickets`, `accepted_ticket_uses` | A100, AR100, 3, 3 |
| `upcoming_options` | `event_id`, `product`, `units`, `price_usd`, `as_of` | E200, Premier Parking, 12, 40, 2026-10-16 |
| `account_event_benefits` | `account_id`, `event_id`, `product`, `included_qty`, `purchased_qty` | A100, E200, General Parking, 1, 0; A100, E200, Premier Parking, 0, 0 |
| `regional_sales` | `order_item_id`, `event_id`, `venue_state`, `sale_date`, `admission_net_amount`, `parking_net_amount`, `valid_admission_quantity`, `admission_account_id` | L100, E100, CA, 2026-09-01, 300, 0, 3, A100; L101, E100, CA, 2026-09-01, 0, 40, 0, null |

<!-- digest:show-table -->
| `sales_metrics` result columns | CA, September 2026 result at `as_of` 2026-10-16 |
| --- | --- |
| `venue_state` | CA |
| `net_admission_revenue` | 300 |
| `net_parking_revenue` | 40 |
| `valid_admission_tickets` | 3, from issued and valid tickets, independent of scan acceptance |
| `admission_buying_accounts` | 1 |

`regional_sales` has one order item. `sale_date` is the original venue-local order date. `event_date` is separate. A later refund restates that original sale date at the frozen cutoff. A full refund gives $0, zero valid tickets, and a null buyer. A partial $100 refund plus one void ticket gives $200 and two tickets. A bundle price stays admission.

The four measures use `SUM(admission_net_amount)`, `SUM(parking_net_amount)`, `SUM(valid_admission_quantity)`, and `COUNT(DISTINCT admission_account_id)`. Metric definitions give one meaning. They are not a cache. Do not add materialization or manual partitioning before measured profiling.

## Permissions, actions, and limits

One demo seller may read the whole CA, OR, and WA Gold slice. Gold definitions enforce that slice. Unity Catalog grants limit accessible objects. The scope does not follow the seller location. Unity Catalog blocks `SELECT` on `event_financials` and `artist_deal_terms`. The separate diagnostic configuration sends three fixed SQL MCP probes under the seller identity: `gold.regional_sales`, `silver.event_financials`, and `silver.artist_deal_terms`. The latter two should show a Unity Catalog denial. The sanitized AgentCore trace reports outcome, resource, principal reference, upstream status, request ID, and returned statement ID when present. This is illustrative, not an actual trace.

The seller can ask, “Show my renewal accounts,” “What should I offer Harbor Works?”, or “What was net ticket revenue by state for September?” Genie One returns illustrative CA $300 through `sales_metrics`. An engineer can compare this not-executed exact SQL MCP query: `SELECT venue_state, MEASURE(net_admission_revenue) AS revenue FROM livenation_demo.gold.sales_metrics WHERE sale_date >= DATE '2026-09-01' AND sale_date < DATE '2026-10-01' GROUP BY venue_state`. A scheduled ScanNow task queries `gold.account_attention` through Statement Execution. It uses the same fixed query as manual ScanNow. It does not use the metric SQL.

Inventory snapshots are evidence. They never reserve inventory. A server action must recheck live inventory before it holds, drafts, or releases an option. The seller approves release.

## Efficiency and evidence boundary

The warehouse filters and aggregates before JSON leaves Databricks. Fixed queries avoid Genie overhead. Bounded responses protect the application. A frozen manifest makes synthetic runs repeatable. Independent hand-calculated fixtures test the sales rules.

Live OAuth binding, MCP beta behavior, Unity Gateway capability, warehouse compatibility, and service configuration remain unverified. This page is a teaching walkthrough. It is not a deployment plan or evidence of a live query.

## Sources and terminology

The reviewed [proposal](https://github.com/elijahstr/livenation-demo/blob/9c809f8/docs/design/databricks-layout/proposal.md) is the detailed design. It links [medallion architecture](https://docs.databricks.com/aws/en/lakehouse/medallion), [managed tables](https://docs.databricks.com/aws/en/tables/managed), [SQL warehouses](https://docs.databricks.com/aws/en/compute/sql-warehouse/), [Genie One MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp), [Databricks SQL MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/databricks-sql), [metric views](https://docs.databricks.com/aws/en/uc-semantics/metric-views/basic-modeling), and [AgentCore inline handlers](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html).
