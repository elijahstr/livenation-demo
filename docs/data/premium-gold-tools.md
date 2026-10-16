# Premium Gold tools operator guide

## Status

The owned Genie agent is created and verified. No Gold tables or grants changed. The data-only live verification passed at `outputs/premium-tools/1792183710644-verification.json`. Premium AgentCore verification passed at `outputs/premium-tools/1792183920044-verification.json`.

The two successful qualified turns reused runtime `b8641cfd-7228-4229-9c6a-cd7a11dd4d19`. The first called `get_account_brief` and `find_options`. The second called `ask_analytics`.

Premium chat is opt-in. The default data source remains West sales evidence.

```sh
AGENTCORE_CHAT_ENABLED=1 AGENTCORE_CHAT_DATA_SOURCE=premium PORT=3001 bun run dev
```

## What the tools read

All data is synthetic. Salesforce-style records are fixture data, not a Salesforce connection.

The two fixed tools use the Databricks Statement Execution API through the local CLI bridge:

| Tool | Input | Gold sources |
| --- | --- | --- |
| `get_account_brief` | `account_id: "A100"` | `account_attention`, `account_artist_evidence`, `account_event_benefits` |
| `find_options` | `account_id: "A100"` | `upcoming_options`, `account_event_benefits` |
| `ask_analytics` | A question up to 2,000 characters | Genie One MCP over five Gold views and `sales_metrics` |

The fixed tools use server-owned SQL. They accept no SQL, warehouse, endpoint, date, or identity input. They reject more than 50 returned rows or 64 KiB of serialized output.

`ask_analytics` uses Genie One MCP. It does not use native SQL MCP and it does not execute Genie SQL locally.

The frozen evidence context is `2026-10-16T12:00:00Z`. In Genie instructions, “AS OF” means snapshot context. It does not mean a `sale_date` filter. The fixture sale dates are in September.

The `qualified` selector allowlist accepts the three premium tool names in plain form and in `@*/` qualified form. It accepts no wildcard and no built-in tool. This follows the documented West selector pattern.

## Setup and verification

The dry run reads only local configuration:

```sh
timeout --kill-after=2s 10s bun scripts/setup-premium-genie.ts
```

The apply command creates or verifies one Genie agent titled `Live Nation Premium Gold`. It checks the existing parent path and matching title:

```sh
timeout --kill-after=5s 60s bun scripts/setup-premium-genie.ts --apply
```

The setup is idempotent only when the existing title, marker, warehouse, parent path, and serialized definition match. It stops for a foreign or changed object. It does not change Gold tables, views, or grants.

Setup normalization moves `metric_views` entries into `data_sources.tables`. It joins instruction text before it serializes the Genie definition.

Run the data verifier before the AgentCore verifier:

```sh
timeout --kill-after=5s 180s bun scripts/verify-premium-tools.ts --data-only
timeout --kill-after=5s 600s bun scripts/verify-premium-tools.ts --agentcore
```

The AgentCore verifier can create Genie conversations, Databricks query history, and warehouse compute. It records attempts under `outputs/premium-tools/`. The cost check can lag and does not cover Databricks billing.

The first plain-selector attempt made zero tool calls. That attempt plus the two successful qualified turns used the three-attempt budget. The verifier makes no more paid probes automatically.

The verified Genie retrieval returned `300.00`, `40.00`, `3`, and `1` from an existing read-only query result. Open [Live Nation Premium Gold](https://dbc-da714a97-83a0.cloud.databricks.com/genie/rooms/01f1c9a2b3421c1ca755c65e625104ad?o=7474650774099237) for the owned Genie agent. CloudWatch returned 20 matching span records in its first-page limit. This does not prove that exactly 20 records exist or that standalone MCP spans exist.

## Permissions and teardown

This work does not add seller grants, seller identities, OAuth, Gateway configuration, user impersonation, or a permission-denial test. The current local CLI identity can have administrator permissions. Genie curation and tool validation improve answer quality. They do not enforce read-only access for that identity.

Browser validation loaded the app on port 3011 and created a chat session with HTTP 201. It did not send a paid browser prompt. The paid checks used `ChatService`, not the browser UI.

To remove the setup object, manually delete only the Genie agent titled `Live Nation Premium Gold` after you confirm its unique marker. Do not delete or change Gold tables, views, schemas, or the parent folder.

## References

- [Databricks Statement Execution API](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial)
- [Databricks Genie One MCP](https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp)
- [Databricks views](https://docs.databricks.com/aws/en/views/)
- [Amazon Bedrock AgentCore Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)
