# How the seller agent uses Databricks

<!-- chips:10k synthetic records|17 silver tables|5 seller views -->

Status: **Proposal only.** New finance tables, the seller OAuth flow, and the trace example are not implemented or verified.

### 🎓 High School

Think of this as a school records office. Bronze keeps the original envelopes. Silver checks and links the forms. Gold makes small reports for staff. The records are data. A SQL warehouse reads them. Unity Catalog is the rule book that decides who can read each record.

The locked baseline has 10,000 synthetic records. This proposal treats them as tickets. CRM records are **synthetic Salesforce-shaped CSV or JSON exports** for accounts, contacts, renewals, opportunities, and activities. No connector or real Salesforce data exists.

For Smith & Smith, the seller asks why a renewal needs attention. The agent reads allowed gold evidence from contracts and activities. It does not read finance records. A locked staff record stays locked even when the agent asks for it. A ticket scan means a ticket was used. It does not prove who attended.

<!-- fig:pipeline -->

### 🏛️ College

Databricks stores and queries data. SQL asks database questions. A table stores rows. A view is a saved SQL question. An ordinary view calculates its answer at read time. It is not a stored summary or a materialized cache. Unity Catalog groups data and controls access.

| Part | Role | Example |
| --- | --- | --- |
| Metastore | Top-level Unity Catalog registry. | The catalog registry used by this workspace. |
| Catalog | Group of schemas. | `livenation_demo` |
| Schema | Group of tables and views. | `silver` |
| Table or view | Rows of facts or a saved question. | `silver.tickets` or `gold.account_attention` |

| Layer | Proposed contents | Job and example |
| --- | --- | --- |
| Bronze | `ticketmaster_raw`, `salesforce_raw`, `inventory_raw`, `artist_catalog_raw`, `finance_raw` | Preserve original records, source ID, `ingested_at`, and `batch_id`. |
| Silver | 17 accepted, typed, linked tables: CRM 5; commerce 4; events and artists 4; benefits and inventory 2; finance 2. | `contracts`, `activities`, `tickets`, `events`, and restricted finance facts. |
| Gold | Five ordinary views: `account_attention`, `account_artist_evidence`, `upcoming_options`, `account_event_benefits`, `regional_sales`. | Give sellers small answers from permitted operational facts. |

The Salesforce flow is: simulated Salesforce export → `bronze.salesforce_raw` → `silver.accounts`, `contacts`, `contracts`, and `activities` → `gold.account_attention`. Bronze keeps source envelopes, including invalid records. A linked validation report records each source ID and rejection reason. Silver accepts only checked records. Gold is about question shape. Bronze, silver, and gold describe data quality. They do not grant access.

Each seller has one dedicated restricted Databricks user. The demo has one seller. The MCP request uses that user OAuth identity. The model does not supply a seller ID. A scheduled scan is different. It uses a least-privilege system job identity and must say that it is a system job.

<!-- fig:authorization -->

Azure Synapse Analytics is a useful broad comparison. It combines SQL, Spark data work, and pipelines. It is not a drop-in replacement for Databricks. [Synapse overview](https://learn.microsoft.com/en-us/azure/synapse-analytics/overview-what-is)

### Azure concepts that explain these parts

| Databricks part | Comparable Azure idea | Meaning |
| --- | --- | --- |
| Delta table data | [ADLS Gen2 and Blob files](https://learn.microsoft.com/en-us/azure/storage/blobs/data-lake-storage-introduction) | Files hold bytes. Delta adds a table format and change log. |
| SQL warehouse | [Synapse serverless SQL pool](https://learn.microsoft.com/en-us/azure/synapse-analytics/sql/on-demand-workspace-overview) | Compute asks SQL questions over lake data. |
| Catalog and schema | [Azure SQL database and schema](https://learn.microsoft.com/en-us/sql/relational-databases/security/authentication-access/ownership-and-user-schema-separation) | Named groups organize tables and views. |
| Medallion layers | [Data Factory pipeline](https://learn.microsoft.com/en-us/azure/data-factory/introduction) | A pipeline copies, checks, and transforms data. |
| Unity Catalog | [Purview catalog and lineage](https://learn.microsoft.com/en-us/azure/synapse-analytics/catalog-and-governance/how-to-discover-connect-analyze-azure-purview) with database permissions | Unity Catalog also enforces Databricks access. |

These comparisons have different features and authentication.

### 🔬 Pro

The proposed new `livenation_demo` catalog has `bronze`, `silver`, and `gold` schemas. It does not rename the older `workspace.livenation_demo` demo. Bronze appends and preserves original payloads, source IDs, `ingested_at`, `batch_id`, and a source-specific `synthetic` flag. Public ListenBrainz rows can be public and need not be fabricated. A linked validation report records rejected source IDs and reasons.

Silver has 15 previously proposed operational tables: `accounts`, `contacts`, `identity_links`, `contracts`, `activities`, `orders`, `order_items`, `tickets`, `scans`, `venues`, `events`, `artists`, `artist_relations`, `entitlements`, and `inventory_snapshots`. It adds two small synthetic finance tables: `event_financials(event_id, production_cost, net_margin)` and `artist_deal_terms(deal_id, event_id, artist_id, guaranteed_fee, revenue_share)`. These make 17 silver tables. They use few synthetic rows and do not change the scale target.

The proposed seller grants are `USE CATALOG livenation_demo`, `USE SCHEMA gold`, `USE SCHEMA silver`, and `SELECT` on only the five gold views. `USE SCHEMA silver` lets a finance query reach the table check. It does not grant finance `SELECT`. Before a grant, inspect all accessible or bound catalogs, default schemas, groups, ownership, and inherited privileges. A workspace can auto-grant create privileges on `workspace.default`. Finance `SELECT` must remain absent. Optional `BROWSE` can show that tables exist. It does not grant `SELECT`. No broad revoke or shared-policy change is proposed.

Finance does not feed any seller gold view. Each gold definition uses an explicit operational column list. Its owner needs only the permitted operational sources. This prevents a broad view or function from exposing finance columns. Databricks checks the view owner's underlying permissions, so the view-owner grant set also matters. Missing effective `SELECT` denies the table query. This design does not depend on a SQL `DENY` command.

The model sees approved application tools only: three planned account tools, `check_data_access(resource)`, and an optional analytics wrapper. It never sees Gateway, native `execute_sql`, or user query text. `check_data_access` is a trusted application-side Harness tool. It calls Gateway and SQL MCP with seller JWT context, then returns a sanitized result. Tokens remain outside model context. The server sets explicit Harness tools and `allowedTools`, with no `*`. Its enum permits one gold and two finance probes. Implementation verifies names.

The preferred proof uses the built-in Databricks SQL MCP at `https://<workspace>/ai-gateway/mcp-services/system.ai.dbsql`. It needs the `ai-gateway` OAuth scope, seller `EXECUTE`, parent privileges, warehouse `CAN USE`, and proposed seller grants. Native SQL MCP currently requires the Unity Gateway beta and permits writes by default. Closed fixed probes form the main SQL write control. No seller `MODIFY` or write grant is proposed. `disallow_writes=true` on `system.ai.dbsql_policy` is an optional approved demo-scope restriction. If an inherited shared policy cannot change, record that setup result. Do not mutate a broad workspace policy. Availability is unverified. A Statement Execution custom MCP adds code and is not native MCP proof.

The demonstration uses three matched probes: `SELECT session_user() AS executing_user, event_id FROM <table> LIMIT 1`. The table is only `gold.regional_sales`, `silver.event_financials`, or `silver.artist_deal_terms`. A nonempty gold fixture must return the expected restricted user. Finance probes pass through the handler, Gateway, and native MCP. Unity Catalog must reject their table `SELECT`. If Gateway blocks first, the proof fails. For each denial, verify the effective caller in audit or query evidence when available. Early denial might have no query-history row or statement ID. Without caller evidence, the proof remains incomplete. Use an opaque principal reference and no administrator fallback.

<!-- fig:trace -->

AgentCore can show the tool result as evidence in its trace. This is observability, not the Unity Catalog decision itself. Managed Harness automatically traces model and tool timing and payloads after CloudWatch Transaction Search setup. This proposed user-delegated Gateway flow needs an inbound OAuth JWT to the Harness, identity propagation through Gateway, and an outbound Databricks user OAuth three-legged credential flow. The inbound app JWT and outbound Databricks token are separate. SigV4 alone does not establish a verified seller identity for this flow. The Databricks OAuth provider and gateway token bindings need a test.

The proposed trace returns only a sanitized result: `outcome`, `resource`, `principal_ref`, `source`, `upstream_code`, `request_id`, and a statement ID when returned. It returns no protected rows, tokens, or authorization headers. It labels `source: databricks_unity_catalog` only after a verified table denial. A custom OpenTelemetry span can make a normal error payload searchable. If IDs exist, it correlates the AWS trace and tool-call IDs with Databricks request or statement IDs. Databricks audit and query history remain the evidence of the Unity Catalog decision.

The proposed success criterion is narrow: gold reads work, both finance probes are rejected under the same seller identity, and the AgentCore trace includes the sanitized denial and available IDs. The trace example is illustrative. It has not been observed.

## Technical reference

<details>
<summary>Show the relational model and current evidence</summary>

<!-- fig:erd -->

### Unchanged design

Prepared tools keep fixed account scans and briefs. Repeatable batches use the same inputs, versions, seed, and transformations. Accepted-ticket use counts each accepted ticket once. Current-contract and entitlement rules remain explicit. The seller approves release after a fresh synthetic inventory check. Query count and payload size are optimized before storage tuning. The current OAuth design supersedes the earlier shared-principal approach. Field details remain in the [original detailed schema](https://github.com/elijahstr/livenation-demo/blob/c47eb5f/docs/design/databricks-layout/proposal.md).

### Seller views

| View | Grain | Purpose |
| --- | --- | --- |
| `account_attention` | Account | Shows renewal and activity inputs. |
| `account_artist_evidence` | Account and artist | Separates direct purchase from artist relation evidence. |
| `upcoming_options` | Event, product, and source | Shows latest inventory evidence. |
| `account_event_benefits` | Account, event, and product | Separates included and purchased quantity. |
| `regional_sales` | Order item | Keeps admission and parking revenue explicit. |

`regional_sales` uses order-item net price from commerce. It does not use finance profit.

### Sources and review state

SQL MCP is asynchronous. Inspect start and poll terminal responses. Verified current behavior: [SQL MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/databricks-sql), [MCP privileges and discovery](https://docs.databricks.com/aws/en/agents/mcp-tools/mcp-services), [Unity Catalog privileges](https://docs.databricks.com/aws/en/data-governance/unity-catalog/manage-privileges/privileges), [workspace privileges](https://docs.databricks.com/aws/en/data-governance/unity-catalog/manage-privileges/), [views](https://docs.databricks.com/aws/en/views/), [`session_user`](https://docs.databricks.com/aws/en/sql/language-manual/functions/session_user), [AgentCore MCP tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html), [AgentCore security](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-security.html), [AgentCore operations](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html), [runtime OAuth](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-oauth.html), and [custom observability](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html).

AgentCore Gateway supports outbound authorization-code OAuth for MCP targets. Use user consent and session binding for the future Databricks token. Do not infer Databricks token exchange support from that AWS feature. Gateway dynamic tool lists do not work with three-legged OAuth. Use default synchronization or a static tool schema. Static administrator discovery must not supply credentials for seller data calls. [Gateway outbound auth](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-outbound-auth.html) and [MCP targets](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-MCPservers.html).

### Review record

An independent Sonnet 5 and Opus 5 review on 2026-10-16 found material revisions. This page applies the accepted handler boundary and minor clarifications. The uninspected workspace defaults remain a partial finding. On-behalf-of proof remains conditional on Databricks caller evidence. Live integration remains unverified.

</details>
