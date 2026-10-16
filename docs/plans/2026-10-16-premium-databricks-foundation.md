# Premium Databricks foundation: an idempotent Harbor Works teaching batch

<!-- chips:Tier 1 schema DDL|3 new schemas|27 accepted silver rows|no 10k load -->

Status: **Implemented and two complete runs verified.** The plan remains the design record.

The first milestone builds a small, checked data foundation in a new namespace. It proves the Bronze, Silver, and Gold contracts with synthetic Harbor Works data. It does not load the 10,000-record tier or connect a seller agent.

<!-- digest:start -->
The implementation creates three managed schemas and 17 checked Silver tables under `workspace`. It uses a frozen fixture with 27 accepted source records and one rejected record. A repeat of `--apply` must preserve all row counts and money totals.
<!-- digest:end -->

<!-- fig:foundation-flow -->

## Goal

Create the smallest safe teaching batch for the approved premium sales layout. The batch must prove source capture, relationship validation, canonical regional sales, and metric-view semantics before a larger synthetic load.

The data foundation must use these new schemas:

- `workspace.ln_premium_bronze`
- `workspace.ln_premium_silver`
- `workspace.ln_premium_gold`

The implementation must leave every object in `workspace.livenation_demo` unchanged. It must not create a catalog, external storage location, principal, grant, OAuth route, AgentCore deployment, Genie object, or 10,000-record dataset.

## Scope

### Included

- Five managed Delta Bronze tables that retain raw synthetic envelopes.
- Seventeen managed Delta Silver tables with explicit types and checked source relationships.
- Five ordinary Gold views and one logical `sales_metrics` metric view.
- One frozen Harbor Works fixture, a local validator, a safe SQL builder, and a CLI setup script.
- A local and server-side validation report, an immutable batch manifest, and repeat-run checks.

### Excluded

- The 10,000-record baseline and every performance claim from that tier.
- Genie, MCP, Gateway, AgentCore, OAuth, seller routes, and product UI work.
- New catalog storage, external locations, grants, ownership changes, or broad browse access.
- A real CRM connector, real customer data, raw PII, and financial access for Gold views.

## Risk tier and write scope

**Tier 1 applies.** The implementation creates managed Delta schemas and tables in a live Databricks workspace. The risk is an unintended mutation, an incorrect sales number, or a repeat run that changes prior data.

The only permitted first-run writes are `CREATE SCHEMA IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, insert-only `MERGE` statements into owned objects, and `CREATE VIEW` for missing owned Gold view names. The setup code must never issue `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `ALTER OWNER`, `GRANT`, `REVOKE`, `CREATE CATALOG`, `CREATE EXTERNAL LOCATION`, `CREATE OR REPLACE TABLE`, or an unnecessary `CREATE OR REPLACE VIEW`.

The script must use the existing `2X-Small` serverless warehouse `976766402458e7de`. It may start the warehouse through statement execution. The configured ten-minute auto-stop ends idle use. This scope does not stop the warehouse.

## Verified context

### Verified on 2026-10-16

- The local Databricks CLI profile is `livenation-demo`. Its authentication works.
- The workspace ID is `7474650774099237`. The metastore ID is `222dd8a9-9185-4015-bbaa-59fcd36d1a5a`.
- The metastore has no storage root. The `workspace` catalog supports managed storage. Only `system` and `samples` are other visible catalogs.
- The three target schemas, five Bronze tables, 17 Silver tables, and six Gold objects exist after the verified first complete run. The older `workspace.livenation_demo` tables and views existed before the run. The before-and-after comparison preserved IDs, `updated_at`, table types, columns, and view definitions for `current_sales_evidence` and `show_sales_snapshots`.
- The existing warehouse is stopped, uses the current channel, and has a ten-minute auto-stop value.
- [Metric view creation](https://docs.databricks.com/aws/en/uc-semantics/metric-views/create) documents the YAML 1.1 prerequisite. The current-channel warehouse created and queried this YAML 1.1 metric view successfully. Its metadata does not report an exact Databricks Runtime version. `SELECT version()` returned Spark `4.2.0`.
- The current user is a workspace administrator. That fact does not prove a seller permission model.

### Verified repository context

- [src/databricks-sales-adapter.ts](../../src/databricks-sales-adapter.ts) uses the Databricks Statement Execution API through the local CLI.
- [scripts/seed-west-sales-demo.ts](../../scripts/seed-west-sales-demo.ts) has a bounded polling and cancel pattern. Its old namespace is out of scope.
- [docs/design/databricks-layout/proposal.md](../design/databricks-layout/proposal.md) defines the approved 17-table model and the six Gold objects.
- [docs/design/databricks-layout/architecture.md](../design/databricks-layout/architecture.md) gives the Harbor Works teaching rules. It is a design artifact, not proof of a deployed dataset.

### Platform sources

- [Managed tables](https://docs.databricks.com/aws/en/tables/managed) describe Databricks-managed storage for managed tables.
- [Create a catalog](https://docs.databricks.com/aws/en/catalogs/create-catalog) documents the metastore storage-root requirement. The plan avoids a new catalog because this metastore has no root.
- [Statement Execution API tutorial](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial) documents typed parameters, polling, result limits, and cancellation. The checked execute API documents no `session_timezone` field. SQL uses explicit timestamp offsets and verifies UTC date extraction.
- [Delta MERGE](https://docs.databricks.com/aws/en/delta/merge) documents the need for one source row per target match.
- [Medallion architecture](https://docs.databricks.com/aws/en/lakehouse/medallion) defines Bronze, Silver, and Gold roles.
- [Metric views: basic modeling](https://docs.databricks.com/aws/en/uc-semantics/metric-views/basic-modeling) and [metric-view creation](https://docs.databricks.com/aws/en/uc-semantics/metric-views/create) document logical metric views and `WITH METRICS` YAML. [CREATE VIEW](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-ddl-create-view) documents view creation behavior.

## Decisions

- Use `workspace.ln_premium_bronze`, `workspace.ln_premium_silver`, and `workspace.ln_premium_gold`. A new catalog would need an explicit managed location because the existing metastore has no storage root. This milestone uses the existing managed catalog.
- Use managed Delta tables only. Do not specify an internal storage path.
- Mark every owned object with `demo_project=livenation-premium` and `batch=foundation-v1` properties or comments.
- Treat existing owned objects as a verification task. Refuse a foreign object or a changed object shape before any mutable statement.
- Use raw JSON envelopes in Bronze. Derive Silver records from those envelopes through SQL casts, `get_json_object`, and `from_json`.
- Keep fixture ingestion metadata and `as_of` frozen at `2026-10-16T12:00:00Z`. Preserve the September order, scan, activity, contract, and event business dates in source payloads.
- Use strings for all IDs, `DECIMAL(18,2)` for money, `TIMESTAMP` for activity, order, scan, and inventory time, and `DATE` for contract and event date axes.
- Do not issue primary-key or foreign-key constraint DDL in this phase. The ERD keys describe the logical model. The ETL acceptance checks enforce relationships.
- Insert fixture rows only when a source ID and batch ID are absent. Fail if a matching key has a different payload.
- Compare the expected candidate key sets from all Bronze tables before the first Silver write. Reject an unexpected candidate, a missing required cast value, or a duplicate natural business key.
- Keep `AC-E-BAD` only when its rejection reason is `unknown venue`. Stop before every Silver write on any other rejected candidate.
- Publish the local manifest last. The live tables remain the authority for preflight. A partial run has no ready state.
- Create Gold views only when they are absent. On a repeat run, compare the non-null stored definition, its content hash, and the marker before it reads the view. Do not replace views because some runtimes can affect grants or table identity.
- Treat a metric-view compatibility failure as a hard stop. Do not build a fake semantic fallback.
- Use a local exclusive lock for the loader. The lock prevents concurrent local loader processes. It does not claim distributed exclusivity.

## Harbor Works fixture contract

The fixture file is `fixtures/premium-harbor-works.json`. It contains envelope metadata: `batch_id`, `source_id`, `record_type`, `source_system`, `ingested_at`, `synthetic`, and JSON `payload`.

All records have `synthetic: true`, batch ID `harbor-works-foundation-v1`, and `as_of: 2026-10-16T12:00:00Z`. Email addresses use `example.test`. The fixture must contain no name, address, payment token, or other real personal data.

| Raw table | Record types | Accepted records |
| --- | --- | ---: |
| `salesforce_raw` | accounts, contacts, identity_links, contracts, activities, entitlements | 7 |
| `ticketmaster_raw` | orders, order_items, tickets, scans | 11 |
| `artist_catalog_raw` | venues, events, artists, artist_relations | 6 |
| `inventory_raw` | inventory_snapshots | 1 |
| `finance_raw` | event_financials, artist_deal_terms | 2 |
| **Total** | 17 Silver entities | **27** |

The fixture also contains exactly one invalid source record. It is event `AC-E-BAD` with an unknown venue ID. The validator must reject this expected record before Silver acceptance. The report must record its source ID and reason. The validator must abort before writes if any other record is invalid. Finance rows remain illustrative and do not contain protected data.

The accepted fixture must yield these independent teaching values:

- `net_admission_revenue = 300.00`
- `net_parking_revenue = 40.00`
- `valid_admission_tickets = 3`
- `admission_buying_accounts = 1`

One order has two lines. The standard admission line is $300.00 and has three issued admission tickets. The General Parking line is $40.00. Five scans reference the admission tickets. Scan count cannot change valid ticket quantity. The fixture has no Premier Parking purchase. The bundled amount belongs to admission. A future `E200` event supports the option view.

## Data model

### Bronze tables

Each Bronze table has the same shape: `batch_id STRING`, `source_id STRING`, `record_type STRING`, `source_system STRING`, `ingested_at TIMESTAMP`, `synthetic BOOLEAN`, `payload_json STRING`, and `payload_sha256 STRING`. Its key is `(batch_id, source_id)`.

| Table | Accepted record types |
| --- | --- |
| `ln_premium_bronze.salesforce_raw` | accounts, contacts, identity_links, contracts, activities, entitlements |
| `ln_premium_bronze.ticketmaster_raw` | orders, order_items, tickets, scans |
| `ln_premium_bronze.artist_catalog_raw` | venues, events, artists, artist_relations |
| `ln_premium_bronze.inventory_raw` | inventory_snapshots |
| `ln_premium_bronze.finance_raw` | event_financials, artist_deal_terms |

### Silver tables

| Domain | Table | Minimum explicit columns and relationship checks |
| --- | --- | --- |
| CRM | `accounts` | `account_id`, `account_name`, `region`, `primary_venue_id`; venue is optional. |
| CRM | `contacts` | `contact_id`, `account_id`, `email`; account must exist. |
| CRM | `identity_links` | `identity_link_id`, `contact_id`, `external_identity`; contact must exist. |
| CRM | `contracts` | `contract_id`, `account_id`, `venue_id`, `status`, `start_date`, `end_date`; account and venue must exist. |
| CRM | `activities` | `activity_id`, `account_id`, `contact_id`, `contract_id`, `activity_at`, `activity_type`; account must exist. |
| CRM | `entitlements` | `entitlement_id`, `account_id`, `contract_id`, `event_id`, `product_id`, `status`; account must exist. |
| Commerce | `orders` | `order_id`, `identity_link_id`, `contract_id`, `order_timestamp`, `order_status`; optional referenced IDs must exist when present. |
| Commerce | `order_items` | `order_item_id`, `order_id`, `event_id`, `product_id`, `product_family`, `line_status`, `line_amount`, `refunded_amount`; order and event must exist. |
| Commerce | `tickets` | `ticket_id`, `order_item_id`, `ticket_status`; order item must exist. |
| Commerce | `scans` | `scan_id`, `ticket_id`, `scan_timestamp`, `scan_result`; ticket must exist. |
| Event | `venues` | `venue_id`, `venue_name`, `state`, `iana_timezone`. |
| Event | `events` | `event_id`, `venue_id`, `artist_id`, `event_date`, `event_status`; venue and artist must exist. |
| Event | `artists` | `artist_id`, `artist_name`. |
| Event | `artist_relations` | `seed_artist_id`, `related_artist_id`, `relation_source`, `batch_id`; both artists must exist. |
| Benefits | `inventory_snapshots` | `snapshot_id`, `event_id`, `product_id`, `source`, `available_quantity`, `snapshot_at`; event must exist. |
| Finance | `event_financials` | `event_id`, `production_cost`, `net_margin`; event must exist. |
| Finance | `artist_deal_terms` | `deal_id`, `event_id`, `artist_id`, `guaranteed_fee`, `revenue_share`; event and artist must exist. |

The loader must keep source IDs and batch IDs in every Silver table. These fields support traceability and idempotency. The schema may include more explicit business columns when they are needed for a Gold definition. It must not infer values from a source that does not contain them.

## Gold contract

Gold reads the 15 operational Silver tables only. `event_financials` and `artist_deal_terms` must not appear in any Gold SQL, Gold lineage, or Gold view dependency.

### `regional_sales`

`regional_sales` has one row per `order_item_id`. It includes CA, OR, and WA only. It uses a verified identity link to derive `admission_account_id`. A verified link resolves to an existing contact and that contact's existing account.

- Exclude cancelled and void order items.
- Set net line amount to `line_amount - refunded_amount`.
- Set a fully refunded line to zero money, zero valid tickets, and null buyer.
- Require `0 <= refunded_amount <= line_amount`. A fully refunded line has `refunded_amount = line_amount`.
- Count valid admission tickets with distinct issued ticket IDs. Exclude cancelled, void, and refunded tickets.
- Compute ticket quantities before joins to scans. A scan is an attempt, not ticket validity.
- Include Standard and VIP in admission. Keep Parking in its own product family. Set add-on sales to zero for admission and parking measures.
- Set `admission_account_id` to null for a parking-only purchase. Parking must not increase the admission buyer count.
- Derive `sale_date` from the order timestamp in the venue IANA timezone. Keep `event_date` separate.

### Evidence views

`account_attention` selects the current contract at frozen cutoff time. It uses stable status and date ordering. It includes the latest activity and latest order.

`account_artist_evidence` computes purchase quantity and distinct accepted ticket count in separate aggregates. It must never join money to scans. Its SQL uses a `public_related_artists` CTE or equivalent field aggregate to expose related artist IDs and relation origin. It must not create a seventh Gold object or fold public relation rows into money or ticket counts.

`upcoming_options` selects the latest `(event_id, product_id, source)` inventory snapshot. It uses `snapshot_at` and `snapshot_id` as tie breakers. It compares `event_date` with the venue-local date at the frozen UTC cutoff. `E200` remains after the 2026-10-28 local cutoff. It has no hold authority.

`account_event_benefits` combines included and purchased product evidence for an account, event, and product. The same included or purchased product blocks a duplicate offer. General Parking does not block Premier Parking.

### `sales_metrics`

`workspace.ln_premium_gold.sales_metrics` is a logical metric view over the fully qualified `workspace.ln_premium_gold.regional_sales` view. The SQL must use current `WITH METRICS LANGUAGE YAML` syntax and metric-view format version `1.1` after implementation-time documentation verification.

The YAML uses the documented simple YAML 1.1 form. It defines `sale_date`, `event_date`, and venue region as fields or backwards-compatible dimensions. It uses no display names, formats, synonyms, or other newest metadata features. The ownership marker is a YAML comment. The source uses the three-part name `workspace.ln_premium_gold.regional_sales`.

| Measure | Definition | Expected fixture result |
| --- | --- | ---: |
| `net_admission_revenue` | Sum canonical admission net amount | 300.00 |
| `net_parking_revenue` | Sum canonical parking net amount | 40.00 |
| `valid_admission_tickets` | Sum pre-grouped valid admission ticket quantity | 3 |
| `admission_buying_accounts` | Count distinct non-null admission account ID | 1 |

## Ordered implementation

### 1. Add the frozen fixture

Create `fixtures/premium-harbor-works.json`. Store the 28 raw source envelopes, their stable hashes, and the invalid `AC-E-BAD` event. Keep the expected accepted and rejected counts near the fixture metadata.

### 2. Add a pure foundation module

Create `src/premium-foundation.ts`. This module must parse and validate the fixture without a CLI call. It must build SQL only from fixed, whitelisted schema, table, and view names.

The module must reject duplicate source keys, changed payloads, invalid money precision, unknown record types, incorrect frozen metadata, invalid product families, missing local relationship keys, and duplicate natural business keys. The natural key is each entity's own `*_id`, except `artist_relations`, which uses `(seed_artist_id, related_artist_id, relation_source)`. It must accept only `AC-E-BAD` with an unknown venue. It must abort before writes on every other invalid source. It must provide an independent numeric oracle for the four metric values, including a parking-only buyer case. It must not contain credentials or shell command code.

Add `src/databricks-statements.ts` only if the existing adapter cannot expose bounded statement execution without a risky change. Submit every statement with `wait_timeout: "0s"`. Drain stdout and stderr concurrently with byte caps. Record the statement ID before polling. Poll on a deadline. On timeout, cancel, then poll to a terminal state on a separate deadline. Record the statement ID in failure evidence. An unknown submit or terminal outcome blocks retry until reconciliation. Reject truncated result sets before a write result is trusted. Expose bounded failure text without credentials.

### 3. Add the setup runner

Create `scripts/setup-premium-databricks.ts`. The default mode must be a dry run that validates the fixture and prints the proposed write scope. It must make no Databricks CLI call in dry-run mode.

`--apply` must require the configured profile and existing warehouse. It must write SQL through a JSON request file with `--json @file`. It must pass one JSON STRING parameter per raw table and expand records with `from_json` and `inline`. It must not interpolate raw fixture JSON into shell text. It must canonicalize each `payload_json` and verify `sha2(payload_json, 256) = payload_sha256` on the server. It must not print credential values.

Before a mutable statement, the runner must:

1. Confirm the three target schemas have the expected ownership marker or are absent.
2. Confirm each existing target object has the expected type, marker, required columns, and expected candidate-key set.
3. Capture target row counts, Delta versions as evidence metadata, and non-null stored view definitions.
4. Refuse a foreign object, missing marker, changed shape, extra key, different Bronze hash, different Silver business value, null view definition, result truncation, or server error.

The runner then creates the three schemas and five Bronze tables. It runs a conflict query before each insert-only `MERGE`, then uses `(batch_id, source_id)` as the match key. It compares payload hashes and fails on a changed payload. It derives all Silver candidates from the complete Bronze batch, validates all foreign keys and non-null required cast columns server-side, and compares each candidate set before the first Silver `MERGE`. It writes only the exact accepted candidate set with insert-only `MERGE` operations. If all expected keys and content hashes already match, a full rerun performs no data `MERGE`.

The runner must write rejected records to a local `outputs/premium-databricks/<run-id>/validation-report.json`. The report must include each rejected source ID and reason. It must not put the report in Gold.

After the Silver checks pass, the runner creates missing owned ordinary views with plain `CREATE VIEW`, then creates the metric view. On a repeat run, it fetches the definition from the tables API `view_definition`, or `SHOW CREATE` where needed, and stops if the stored definition is null. It compares content hashes and markers before it reads a Gold object. It evaluates the explicit metric query and the expected Gold view grain. It publishes local `manifest.json` last with fixture hash, expected source counts, source Delta versions as evidence metadata, content hashes, metric YAML hash, frozen `as_of`, and validation values.

On any partial failure, the runner must stop and record an unpublished failure state. It must not claim multi-table atomicity.

### 4. Add focused tests

Create `tests/premium-foundation.test.ts`. The tests must cover the fixture contract, pure validator, SQL builder, and statement-response handling. The test file must run with `bun test tests/premium-foundation.test.ts` and add no dependency.

The tests must prove:

- 28 raw records exist, 27 records are accepted, and one unknown-venue event is rejected.
- All 17 Silver entity types exist and their accepted fixture relationships resolve.
- Money uses decimal-safe values. Refund, cancellation, and duplicate-scan oracle fixtures cannot multiply revenue or valid tickets.
- The fixture produces 300.00 admission revenue, 40.00 parking revenue, 3 valid admission tickets, and 1 buying account.
- A repeated local application produces identical manifest input hashes and no extra Silver keys. A no-op full rerun issues no `MERGE`.
- Fixed object-name allowlists reject injected identifiers and quotes in raw JSON remain data.
- Dry-run mode makes no CLI call.
- Statement parsing rejects failed or truncated responses. A deadline cancels then observes a terminal state, and an unknown outcome blocks retry.
- Local and server candidate sets reject duplicate natural business keys, extra existing keys, non-null cast failures, different Bronze hashes, and different Silver business values.
- A parking-only buyer does not increase `admission_buying_accounts`.

### 5. Guard generated SQL

Create a runtime guard for every generated statement. The leading verb must be one of the approved verbs. Every object reference must use an allowlisted name in a target schema. The guard must reject `workspace.livenation_demo` and every forbidden write verb. Add focused tests for both classes of rejection.

### 6. Add the operational report template

Create `docs/data/premium-databricks-foundation.md`. The setup runner must write a machine-readable report. The parent agent will add the final verified live result after cloud execution.

The final report must separate verified results from inference. It must state the schema and object names, source and Silver row counts, rejected source, expected metric query result, manifest location, view dependency check, rerun result, warehouse auto-stop state, and any remaining limitation.

## Live validation sequence

The implementing agent must execute this sequence only after the plan review finishes.

1. Run the pure fixture tests and dry-run command.
2. Verify target schemas remain absent or match the ownership and shape contract.
3. Run `--apply` through the configured CLI profile and existing warehouse.
4. Inspect live object types, managed-table status, required columns, and marker properties.
5. Verify 28 Bronze records, 27 accepted Silver records, and one rejection report record.
6. Query every Silver table count and verify the 17-table total is 27.
7. Verify each Gold view has its required grain and finance tables are absent from all Gold dependencies.
8. Query the metric view and an explicit oracle query. Both must return 300.00, 40.00, 3, and 1.
9. Run `--apply` a second time. Verify unchanged row counts, numeric results, and content hashes. Treat Delta versions as evidence metadata only.
10. Report the warehouse state. The existing ten-minute auto-stop ends idle use.

## Failure policy

Stop before any mutation when preflight fails. Stop Gold publication when a Silver relationship check fails. Stop ready-state publication when metric-view creation or metric validation fails.

The runner must surface a bounded sanitized error. It must include object name, statement state, and next operator action when safe. It must never expose a token, a profile credential, or raw protected data.

## Risks and open questions

There are no material design decisions open for this foundation milestone. The main agent selected the previously documented `workspace` schema fallback from the verified preflight. The milestone uses the small Harbor Works batch.

The implementation must verify effective catalog/schema grants before writes. Current effective catalog grants return an empty set. This does not prove write access. The current administrator session cannot prove seller access. This scope deliberately does not add seller principals or grants.

The teaching fixture has limited edge-case coverage in the live workspace. Local pure tests must cover refunds, cancellations, and duplicate scans. The first cloud batch must not load extra edge cases unless a concrete validation need requires them.

## Review record

Plan status: reviewed. Opus 5.5 returned **ship with minor revisions**. This revision accepts all 12 findings. The review checked managed-storage safety, schema idempotency, SQL injection boundaries, metric-view syntax, timeout recovery, and first-run versus rerun behavior.

Implementation used no new dependency. Sonnet 5.5 provided code context. An external Opus code review timed out without a result. A separate native Codex gpt-6-astra review approved the change with no issues. The main agent verified the two live compatibility fixes with regression tests.

First complete live run: published manifest `outputs/premium-databricks/2026-10-16T19-51-23.186Z/manifest.json`; 28 Bronze envelopes; 27 Silver rows; one expected `AC-E-BAD` rejection; six Gold objects; all Gold grain checks; no Finance source reference; and metric plus oracle values of 300.00, 40.00, 3, and 1. The run wrote zero rows because a prior setup had already created the objects before the metadata fix. The second complete run published `outputs/premium-databricks/2026-10-16T19-56-14.670Z/manifest.json`, wrote zero rows, and matched the first stable object and hash exactly.
