# Premium Genie context proposal

Status: proposal. The examples below are not executed. The current client uses workspace-wide Genie One. It does not identify a dedicated Genie Agent.

## Recommendation

Reuse the existing Premium Genie Agent space `01f1c9a2b3421c1ca755c65e625104ad` after metadata and version verification. The space improves semantic quality. It does not limit data permissions.

Use the current workspace Genie One route only after approved scoped metadata, access, and evaluation tests exist. Its current path is `/ai-gateway/mcp-services/system.ai.genie_one_mcp`. That path gives no proof that a dedicated agent configuration applies.

The proposed route uses the supported Genie Conversation API through the existing Databricks CLI and HTTP boundary. It needs no new dependency. The exact integration remains subject to a current source check before code work.

Databricks documents dedicated Genie conversations and result attachment retrieval. It also recommends at least five example SQL statements and five benchmark questions. [Conversation API](https://docs.databricks.com/aws/en/genie-agents/conversation-api), [Start conversation API](https://docs.databricks.com/api/genie/v1/genie-start-conversation.md), [Quality tuning](https://docs.databricks.com/aws/en/genie-agents/tune-quality).

## Data definitions

| Asset | Meaning | Safe claim |
| --- | --- | --- |
| `regional_sales` | Valid admission and parking sales facts. | Aggregate revenue, tickets, and account counts. |
| `account_attention` | Current contract and latest activity summary. | A contract date or activity timestamp. |
| `account_artist_evidence` | Past admission purchases and accepted uses. | Observed past tickets and uses. |
| `account_event_benefits` | Included and purchased event products. | Product ownership or inclusion. |
| `upcoming_options` | Latest inventory snapshot for future scheduled events. | A dated available quantity and price. |
| `sales_metrics` | Semantic metrics over `regional_sales`. | Aggregate measures by supported dimensions. |

These assets do not contain activity content or direction. A timestamp cannot identify customer contact direction.

## Connection and query limits

- The service selects the Genie space ID and warehouse identity.
- The model sends a natural-language question only.
- Scoped views and the query principal enforce regional scope. Natural language cannot enforce it.
- The service records conversation, message, attachment, generated SQL, query IDs, dataset references, and result state.
- The service accepts only completed, scoped results from allowed semantic assets.
- The service stops on an unknown submission result, deadline, partial result, or scope failure.
- The service does not retry an unknown submission without reconciliation.
- The seller agent receives no raw SQL execution tool.

Use SELECT-only reviewed views or an application adapter for stable facts. Do not require one tool per SQL statement.

## Proposed data access

The current identity can have broad synthetic-demo permissions. A curated Genie space does not reduce them. The recommended future principal has `USE CATALOG`, `USE SCHEMA`, and `SELECT` only on seller-scoped semantic views, plus required compute and Genie permissions. A permission change needs approval and a preflight denial test. The server must not expose arbitrary administrator SQL execution.

## Example questions and SQL

The SQL is guidance for the dedicated agent. It is not executed here. These are current unscoped Gold references. Do not deploy them as seller-scope queries. The adapter must use approved seller-scoped projections for both fixed and aggregate routes.

### Existing Gold examples

```sql
SELECT venue_state,
       MEASURE(net_admission_revenue) AS net_admission_revenue,
       MEASURE(valid_admission_tickets) AS valid_admission_tickets
FROM workspace.ln_premium_gold.sales_metrics
GROUP BY venue_state;
```

```sql
SELECT account_id, contract_end, latest_activity_at
FROM workspace.ln_premium_gold.account_attention
WHERE account_id = 'A100';
```

```sql
SELECT account_id, artist_id, purchased_admission_tickets, accepted_ticket_uses
FROM workspace.ln_premium_gold.account_artist_evidence
WHERE account_id = 'A100';
```

```sql
SELECT account_id, event_id, product_id, included_quantity, purchased_quantity
FROM workspace.ln_premium_gold.account_event_benefits
WHERE account_id = 'A100';
```

```sql
SELECT event_id, product_id, available_quantity, unit_price, snapshot_at
FROM workspace.ln_premium_gold.upcoming_options
WHERE event_id = 'E200';
```

### Known limits

The current Gold views cannot answer customer message body, message direction, confirmed future admission validity, product eligibility, or a confirmed hold. The agent must say that the data does not support those claims.

## Benchmark questions

1. What were valid admission tickets by venue state?
2. What is A100's current contract end date and latest activity time?
3. How many A100 admission tickets were used for each artist?
4. Which A100 products were included or purchased for E200?
5. What is the latest snapshot for Premier Parking at E200?

## Skill delivery proposal

For the demo, compose reviewed skill bodies into the inline system prompt and record their content hashes. Native skill loading is optional later. An alternative uses immutable S3 paths by content hash, with no overwrite and session-version proof. Coverage and scope checks remain server code.

The AgentCore Harness documents skills and tools as separate capabilities. [Harness skills](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-skills.html), [Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html).
