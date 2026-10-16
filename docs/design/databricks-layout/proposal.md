# How the seller agent uses Databricks

<!-- chips:10k synthetic records|15 linked tables|5 seller views -->

Status: **Proposed demo architecture.** This page explains the current design. It does not describe a deployed workspace or a live data load.

### 🎓 High School

Think of the system as a school records office. Bronze keeps the original forms, silver checks the forms, and gold makes small reports for staff. The saved records are the data. A SQL warehouse is the computer that reads those records. Unity Catalog is the access rule book. The demo starts with 10,000 fake admission tickets and related records. The agent does not receive every row in its prompt.

For Smith & Smith, the agent finds an unanswered renewal. It then looks up linked purchase and ticket-use facts. It presents the evidence and a next action to the seller. A seller must approve any delivery action. A ticket scan shows that a ticket was used. It does not prove who attended.

The team can correct a bad import without losing the original source evidence.

<!-- fig:pipeline -->

### 🏛️ College

Databricks is an analytics platform for data, queries, and governed access. SQL is the language used to ask database questions. Delta is a table format with data and a log of valid changes. A SQL warehouse provides query compute that stays separate from storage. Unity Catalog organizes data, controls access, and records lineage, or the source and transformations of data.

| Term | Job | Example |
| --- | --- | --- |
| Metastore | Top-level catalog registry. | The Unity Catalog registry. |
| Catalog | Group of schemas. | `livenation_demo` |
| Schema | Group of tables and views. | `silver` |
| Table or view | Rows of facts or a saved query. | `livenation_demo.silver.tickets` |

The layout moves source envelopes, or original records with origin metadata, from bronze to checked, linked silver facts. Silver holds 15 tables across customer, commerce and ticket use, events and artists, and benefits and inventory. Gold exposes five question-oriented virtual views. An ordinary view stores SQL and calculates when queried. It does not store precomputed or cached output. Fixed queries serve the known account scan and account brief paths. Genie remains optional for broad regional questions.

The locked baseline is 10,000 synthetic source records. This proposal interprets them as admission tickets. Related rows can grow without changing that proposed interpretation. A fixed seed is the same starting value for a synthetic generator. Reproducible snapshots also need the same inputs, versions, and transformations.

Azure Synapse Analytics is a useful broad comparison. It combines SQL, Spark data work, and pipelines. It is not a drop-in replacement. [Synapse overview](https://learn.microsoft.com/en-us/azure/synapse-analytics/overview-what-is)

### Azure concepts that explain these parts

| Databricks part | Comparable Azure idea | What the comparison means |
| --- | --- | --- |
| Table data and Delta | [ADLS Gen2 and Blob files](https://learn.microsoft.com/en-us/azure/storage/blobs/data-lake-storage-introduction) | Files hold bytes. Delta adds a table format and transaction log. Delta is not a storage account. |
| SQL warehouse | [Synapse serverless SQL pool](https://learn.microsoft.com/en-us/azure/synapse-analytics/sql/on-demand-workspace-overview) | Compute asks SQL questions over lake files. SQL features, performance, and authentication can differ. |
| Catalog and schema organization | [Azure SQL database and schema](https://learn.microsoft.com/en-us/sql/relational-databases/security/authentication-access/ownership-and-user-schema-separation) | Named groups organize tables and views. This is conceptual; a Unity Catalog catalog is not an Azure SQL database engine. |
| Bronze, silver, and gold transformations | [Data Factory pipeline](https://learn.microsoft.com/en-us/azure/data-factory/introduction) | A pipeline copies, validates, and transforms data. Medallion names quality layers; Data Factory runs steps. |
| Unity Catalog | [Purview catalog and lineage](https://learn.microsoft.com/en-us/azure/synapse-analytics/catalog-and-governance/how-to-discover-connect-analyze-azure-purview) with database permissions | Purview helps discovery and origin tracing. Unity Catalog also enforces Databricks access. |

These are role comparisons, not interchangeable services.

### 🔬 Pro

The proposed catalog is `livenation_demo`, with bronze, silver, and gold schemas. The medallion layout is a recommended data design pattern. It does not require three compute clusters. Delta consists of data files and a transaction log. A SQL warehouse supplies compute and does not store Delta data. Unity Catalog supplies the access and lineage boundary. [Medallion architecture](https://docs.databricks.com/aws/en/lakehouse/medallion), [Unity Catalog](https://docs.databricks.com/aws/en/data-governance/unity-catalog/), and [managed tables](https://docs.databricks.com/aws/en/tables/managed)

Bronze preserves `ticketmaster_raw`, `crm_raw`, `inventory_raw`, and `artist_catalog_raw`. Each source row retains `payload`, source identifier, `ingested_at`, `batch_id`, and `synthetic`. Silver validation rejects bad identifiers and preserves rejected rows in bronze. A batch validation report records the source ID and rejection reason. If catalog creation is unavailable, the proposed fallback uses `workspace.ln_premium_bronze`, `workspace.ln_premium_silver`, and `workspace.ln_premium_gold`. This fallback is unverified.

A repeatable batch requires the same input files, versions, seed, and transformations. The proposed design runs batches only. No live Ticketmaster import runs. An optional 100k or 1m stress tier follows baseline measurement. It does not prove that scale is required.

Databricks primary and foreign keys are informational and do not enforce rows. Ingestion must enforce duplicate, orphan, ambiguous identity, and invalid status checks. Grain means what one row represents. A fact grain prevents fan-out errors. Two tickets with two scan attempts each create four joined rows. Revenue remains one $1,000 order item, not $4,000. Canonical use logic counts accepted tickets once. Raw `scans` facts preserve every attempt. Artist relations are catalog evidence, not a calibrated customer preference. [Constraints](https://docs.databricks.com/aws/en/tables/constraints)

<!-- fig:fanout -->

Gold contains ordinary read-only views, not materialized or cached results. The server exposes `scan_attention(as_of)`, `get_account_brief(account_id, as_of)`, and `find_options(account_id, as_of)`. The authenticated session supplies seller identity. The adapter and optional Genie use a gold-only restricted read principal. Missing or ambiguous identity links cannot expose personal history. Proposed limits are 50 scan rows, 100 brief rows, 32 KiB serialized JSON, and a 30-second deadline. Each result retains source IDs, `data_as_of`, and a statement ID. The server creates selection holds and drafts. Seller approval releases once after a fresh synthetic inventory check. Idempotency means a repeated request has one effect. Inventory snapshots remain evidence and never reserve inventory. [Views](https://docs.databricks.com/aws/en/views/) and [Statement Execution API](https://docs.databricks.com/api/statement-execution/v1/execute-statement)

Gold keeps source identifiers so a reviewer can trace each claim to accepted facts.

The baseline optimizes query count and result size before physical layout. Compare equal answers with the same dataset and cache regime. Record tool calls, result bytes, read bytes, rows, statement IDs, and latency. Start with unpartitioned managed tables and no manual clustering. Predictive optimization can be inherited. Inspect its state and cost before any load. The proposed outreach rule remains open: the renewal is due in 0 to 30 calendar days, unsigned, has renewal outreach at least 14 elapsed days old, and has no later renewal reply. Missing outreach evidence gives an unknown result, not a stall. [Liquid clustering](https://docs.databricks.com/aws/en/tables/clustering), [predictive optimization](https://docs.databricks.com/aws/en/optimizations/predictive-optimization), and [query history](https://docs.databricks.com/aws/en/admin/system-tables/query-history)

The design gives the seller small, traceable evidence while the server retains every action that changes state.

## Technical reference

<details>
<summary>Show the table, view, case, and source reference</summary>

<!-- fig:erd -->

### Data dictionary

| Family | Tables and grain | Key relations and purpose |
| --- | --- | --- |
| Customer | `accounts`, `contacts`, `identity_links`, `contracts`, `activities` | Verified identity links connect people to accounts. Contracts retain value, quote, allotment, signature, and renewal facts. |
| Commerce and use | `orders`, `order_items`, `tickets`, `scans` | One order item can create many tickets. Scans are attempts. Use counts distinct accepted ticket IDs. |
| Events and artists | `venues`, `events`, `artists`, `artist_relations` | Events join a venue and featured artist. Relations retain source and batch provenance. |
| Benefits and stock | `entitlements`, `inventory_snapshots` | Benefits and purchased quantities stay separate. Latest inventory orders by `observed_at`, then `snapshot_id`. |

### Seller views

| View | Grain | Purpose |
| --- | --- | --- |
| `account_attention` | Account | Shows observable renewal and activity inputs. |
| `account_artist_evidence` | Account and artist | Separates direct purchases from related-artist evidence. |
| `upcoming_options` | Event, product, and source | Shows the latest inventory evidence. |
| `account_event_benefits` | Account, event, and product | Separates included and purchased quantities. |
| `regional_sales` | Order item | Keeps admission and parking revenue explicit. |

### Seller cases and limits

The ten cases cover renewals, leads, a reply, a budget concern, a contact change, underuse, a visit, and an upsell. A wrong identity link returns no history. Missing renewal-outreach evidence produces an unknown result. Included or purchased parking prevents an upsell. A seller scope failure returns not found. Public artist IDs can go to ListenBrainz. Customer data cannot go there.

### Open choices

1. Confirm the outreach-anchored stall rule.
2. Verify workspace catalog availability, warehouse choice, and optimization cost.
3. Measure the baseline before an optional 100k or 1m stress tier.

### Sourcebook and review state

The deleted field detail remains in the [original detailed schema](https://github.com/elijahstr/livenation-demo/blob/c47eb5f/docs/design/databricks-layout/proposal.md). Azure sources appear in the concept comparison. The prior architecture completed an independent Sonnet 5 context review and Opus 5 judgment review on 2026-10-15. This educational rewrite received no new external review. No deployment, live load, or delete action is proposed.

</details>
