# Regional scan retrieval contracts

Status: proposal for review. No tool exists from this document.

## Purpose

The scan reads evidence for every authorized account. The model decides which evidence can help. SQL returns stable facts. The model makes the seller recommendation.

## Shared rules

- The server creates `scan_id`, roster version, scope, and `data_as_of`.
- The server validates every account ID against the stored roster.
- `data_as_of` identifies the semantic cutoff. Typed dataset references and source fingerprints identify source versions.
- `retrieved_at` identifies the time of one tool response.
- Each response includes evidence IDs, source references, units, freshness, and status.
- A live multiquery scan is not a transaction. The server marks mixed or stale evidence.
- A missing section returns `unavailable`. It never returns an empty fact as proof.
- Pagination returns a cursor and a total only when the source knows a total.
- UTF-8 caps validate complete JSON. The server never slices raw bytes.
- Omitted facts or rows retain provenance and set `partial` or `truncated`.
- The tools never create a hold, draft, message, purchase, or contact direction.

## Evidence envelope

Every response has scan identity, typed dataset references, source fingerprint, evidence IDs, source references, units, cutoff and retrieval times, status, truncation, and error fields. The canonical schema is [response-schemas.json](response-schemas.json). The canonical illustrative input and output is [contract-examples.json](contract-examples.json). `truncated` prevents a coverage claim.

## Tool contracts

| Tool | Server-owned control | Model choice | Limit |
| --- | --- | --- | --- |
| `list_regional_accounts` | Scope, roster, page size maximum | None; server only | Lists all authorized accounts eventually. |
| `get_account_evidence` | Roster validation, sections, views, row caps | Account and needed sections | Returns activity, contract, purchase history, and benefits. |
| `find_options` | Roster validation, event scope, current inventory source | Account, event, constraints | Finds candidates only. It confirms no eligibility or hold. |
| `ask_analytics` | Scan scope, curated Genie route, deadline, result validation | Natural-language question | Returns generated SQL and completed results only. |

## Per-tool behavior

### `list_regional_accounts`

This is a server-only operation. The server uses a default and maximum page size of 50. The model cannot request it.

The server provides assigned batches, not a model roster response. A proposed `scope_label` is not a database fact until the approved allowlist exists.

The server stores roster pagination in its ledger. It reports `processing_finished` and `fully_assessed`. A changed source fingerprint stops the scan and requires a new scan.

### `get_account_evidence`

Input: `account_id` and one to four sections from `activity`, `contract`, `purchases`, and `benefits`. The server rejects a non-roster account.

An older-history cursor is a proposed unimplemented extension. It needs a schema update. It must bind to account, section, scope hash, and source fingerprint.

The response has one explicit value for every requested section: evidence, `unavailable`, or `error`. Purchase history separates paid active ticket facts from historical accepted uses. Benefits use `included_quantity` and `purchased_line_count` with their own units.

### `find_options`

Input: `account_id`, optional `event_id`, optional exact `product_id`, quantity, and maximum-price constraints. The server uses only events within the scan scope.

The response gives dated candidate snapshots. Eligibility remains `unknown` in this draft. Exact product ownership exclusion does not prove seller eligibility or reservation.

### `ask_analytics`

Input: a question of 1 to 2,000 characters. The service sends the question to the selected curated Genie space. It validates the completed result attachment, source allowlist, returned scope, generated SQL, query IDs, and deadline.

The response has the question, generated SQL, query IDs, rows, and result state. An aggregate result includes its account scope and filters. A scope mismatch, missing attachment, unknown submission, or partial result returns no analytic fact.

## Current Gold mapping limits

`account_attention` lists all scoped accounts. Absence of a contract does not establish a lead. Retain the account for assessment. It is not a renewal queue. `latest_order_id` can identify a cancelled or void order. It does not prove a successful purchase.

`account_artist_evidence` records historical distinct accepted uses. Its current purchase count does not exclude all refunds. Its accepted-use count does not exclude cancelled or refunded orders. The contract must expose these as separate history facts. It must not label them as net paid tickets. It lacks a distinct event count. Three used tickets do not prove three events.

The current `account_event_benefits.purchased_quantity` is a qualifying order-line count. The proposed contract calls this `purchased_line_count`. A value above zero proves product order-line presence only. It does not prove pass or seat quantity.

## Sources

- [Databricks structured retrieval tools](https://docs.databricks.com/aws/en/agents/custom-agents/structured-retrieval-tools)
- [Databricks Genie concepts](https://docs.databricks.com/aws/en/genie-agents/concepts)
- [Bedrock AgentCore Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)
