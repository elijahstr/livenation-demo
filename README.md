# Live Nation AI sales demo

This public repository is an independent interview demo. It is not an official Live Nation product.

## Start the UI and server

The hosted flow requires these local prerequisites:

- Bun
- AWS CLI `2.36.49`
- Terraform CLI `1.16.3`
- Databricks CLI `1.18.0`
- Configured `livenation-demo` profiles for AWS and Databricks

From the repository root, install the locked dependencies and start this worktree on port 3001:

```sh
bun install --frozen-lockfile
export AWS_PROFILE=livenation-demo
export DATABRICKS_PROFILE=livenation-demo
export PORT=3001
bun run dev
```

Open `http://127.0.0.1:3001`.

Startup needs a valid AWS session unless you set `HARNESS_ARN` explicitly. An explicit ARN allows the UI to start without discovery; live calls still need valid credentials. The server uses `HARNESS_ARN` when you set it. Otherwise, it uses the AWS CLI to find the exact ready `livenation_demo` harness. Do not copy Terraform state into a worktree.

The Recovery Case File flow identifies a verified sales risk, shows recovery recommendations, and prepares a local draft for owner approval.
The email, campaign, and dismissal actions are simulated; the demo does not send email or create campaigns.

## Regional scan and account chat

Open `http://127.0.0.1:3001/premium` on the same server.
The Premium workspace connects the regional scan, account details, and separate account conversations.
It uses the approved list of 278 synthetic accounts across Northern California, Oregon, and Washington.
The user explicitly assigned every California account to Northern California.

The account list retains deferred and unavailable accounts.
Partial scans remain marked partial.
During a scan, the page updates about every two seconds with source-check progress, available evidence, and each verified assessment group.
You can inspect account evidence before the scan finishes. Account chat becomes available after the scan finishes.
Account conversations use the real agent and server-controlled, read-only evidence tools.
Each reply retains its tool-call history, with the exact tool names and requested, returned, or incomplete states.
This flow does not use Genie or permit customer messages, holds, or purchases.

Historical verification on October 20: the live scan assessed 12 accounts and deferred 266 in 449 seconds.
All 278 accounts remained available. Desktop and mobile checks passed.
Two accounts completed live evidence retrieval and follow-up analytics through separate conversations.
The repository test baseline passed 288 tests before the source-check update. The final suite passed 306 tests with zero failures.

A source-check update now replaces 31 metadata SQL statements with two catalog reads and one version query. It keeps source checks at scan start, each batch, and scan end. It reuses complete account summaries only after a later matching source check. It has no remote change notification and does not change the cost limits.

Read-only verification covered 278 unchanged accounts. It recorded one summary query, six catalog reads, three version queries, and 278 summary-cache hits.

Browser verification ran **Scan now** through the local server, Databricks, and AgentCore. It ended partial after 131 seconds: six assessed accounts and 272 deferred accounts. A model maximum-token error caused the existing runtime quarantine to block the final source check. This did not change the 2,048-token limit, error rules, or cost limits.

See the [regional scan guide](docs/design/regional-scan/guide.md) for technical behavior and verification records.

## AgentCore chat and traces

The sales UI includes chat code in the Recovery Agent area. The default server keeps live chat disabled.

Enable live chat only after a bounded AWS selector verification succeeds:

```sh
AGENTCORE_CHAT_ENABLED=1 AGENTCORE_CHAT_TOOL_SELECTOR=qualified PORT=3001 bun run dev
```

Use only the selector that passed the recorded verification. Try `qualified` first because the earlier plain-name probe failed. The browser cannot enable chat or select a tool.

Developer details show the conversation ID and its AWS runtime ID. Persistent chat reuses that runtime ID for each turn. AWS observability is active. A bounded live request produced 13 verified spans for the model call and memory operations. CloudWatch retains these logs for 30 days. See the [trace guide](infra/README.md#read-a-conversation-trace) for AWS access and the verified example.

Current behavior: the West chat code exists and has local tests. The earlier West live test requested six evidence calls and exceeded its three-call limit. West live chat remains unverified. Premium Gold verification is a separate completed path below. The existing fixed recovery flow still uses a legacy wildcard tool setting.

Conversation memory is deployed and retains demo events for seven days, with no long-term facts or preferences. The live test verified recall after the runtime's maximum lifetime and separation between conversations. Memory applies to every invocation of the shared harness. Chat and recovery use separate actor IDs. The current UI has no saved-chat list; a server restart or thirty-minute idle expiry requires a new chat. See the [memory plan](docs/plans/2026-10-16-agentcore-conversation-memory.md).

The separate legacy Premium Gold chat uses Genie One MCP through the local CLI bridge. A direct AWS-hosted Databricks credential or MCP connection is not configured. The application does not impersonate users.

Run the bounded live verification only after the cost check permits it:

```sh
bun run scripts/verify-agentcore-chat.ts --selector qualified
```

The command requires current observed cost below $13. It records no more than three attempts. It reads the current six fresh Databricks rows. Its shell request is supporting evidence only. It does not prove that every built-in tool is unavailable.

Use an existing runtime ID for trace lookup. This command makes no new model calls:

```sh
bun run scripts/verify-agentcore-chat.ts --trace RUNTIME_SESSION_UUID
```

The required and recorded local Databricks CLI version is 1.18.0. Do not install or upgrade it without approval.

## Sales workspace mock

The [sales workspace mock](docs/prototypes/premium-sales/index.html) includes a simulated scan, account conversations, renewals, new leads, and a parking upsell.
It runs locally without AWS or Databricks credentials.

```sh
bun docs/prototypes/premium-sales/serve.ts
```

Open `http://127.0.0.1:4409`.

The [decision record and research brief](docs/design/premium-sales/decisions-and-research.md) records the agreed scenarios, proposed architecture, source summaries, and checks still required.

## Premium Databricks foundation

The [foundation guide](docs/data/premium-databricks-foundation.md) records the reviewed synthetic Bronze, Silver, and Gold setup. The foundation contributes 28 Bronze envelopes and 27 accepted Silver rows. The current workspace has 10,000 Bronze envelopes and 9,999 accepted Silver rows after the completed scale load.

Run its default local dry run before any authorized workspace change:

```sh
timeout --kill-after=2s 5s bun scripts/setup-premium-databricks.ts
```

The `--apply` mode writes the reviewed Databricks workspace scope: the three `workspace.ln_premium_*` schemas.

## Premium 10k scale loader

**Completed:** all 277 scale bundles are ready. The current workspace has 10,000 Bronze envelopes and 9,999 accepted Silver rows. The final published state has an empty selection, no pending statement, and `publishedAt` `2026-10-17T02:51:44.603Z`.

The independent final proof reports 278 batch IDs, 277 scale batch IDs, $45,180.00 admission revenue, $9,360.00 parking revenue, 1,899 valid admission tickets, and 273 admission buyers. The A100 premier option remains `E200` / `premier-parking` / `box_office` / quantity 12 / $40.00. Predictive Optimization is inherited. No manual `OPTIMIZE` or `ANALYZE` command ran.

The final dry run returns `mode: "complete"` and makes zero cloud calls. The completion supervisor finished with `success`, used 130.3 MiB peak memory, and used zero swap. It retained seven-bundle children and one final three-bundle child.

The first supervisor launch failed before a cloud submission because its systemd environment lacked the local Databricks CLI path. The corrected launch exported the proven local `PATH` and completed. Read the [beginner scale guide](docs/data/premium-10k-scale.md) for the current result and historical batch process.

## Premium Gold chat tools

The Premium path is opt-in. West sales evidence remains the default. The Premium path reads synthetic Harbor Works account `A100` from Gold views.

Start Premium chat only after the setup and verification checks succeed:

```sh
AGENTCORE_CHAT_ENABLED=1 AGENTCORE_CHAT_DATA_SOURCE=premium PORT=3001 bun run dev
```

The current code provides two fixed Statement Execution API tools: `get_account_brief` and `find_options`. It also provides `ask_analytics`, which uses Genie One MCP for broad Gold questions. It does not use native SQL MCP.

The owned Genie agent is created and verified. No Gold tables or grants changed. Its default mode validates local configuration:

```sh
timeout --kill-after=2s 10s bun scripts/setup-premium-genie.ts
```

The apply mode can create one owned Genie agent. It checks the existing parent and title first:

```sh
timeout --kill-after=5s 60s bun scripts/setup-premium-genie.ts --apply
```

Run the data-only verifier before any AgentCore verification:

```sh
timeout --kill-after=5s 180s bun scripts/verify-premium-tools.ts --data-only
```

The optional AgentCore verifier can make up to three paid turns. It records attempts and requires the existing cost checks:

```sh
timeout --kill-after=5s 600s bun scripts/verify-premium-tools.ts --agentcore
```

The data-only verification passed at `outputs/premium-tools/1792183710644-verification.json`. Premium AgentCore verification passed at `outputs/premium-tools/1792183920044-verification.json`. Two qualified turns reused runtime `b8641cfd-7228-4229-9c6a-cd7a11dd4d19`: the first called `get_account_brief` and `find_options`, and the second called `ask_analytics`.

The first plain-selector attempt made zero tool calls. Together with the two successful qualified turns, it used the three-attempt budget. The verifier makes no more paid probes automatically. The qualified allowlist accepts each premium tool name in plain and `@*/` form. It accepts no wildcard or built-in tool.

The verified Genie retrieval returned `300.00`, `40.00`, `3`, and `1` from an existing read-only query result. The Genie room is [Live Nation Premium Gold](https://dbc-da714a97-83a0.cloud.databricks.com/genie/rooms/01f1c9a2b3421c1ca755c65e625104ad?o=7474650774099237). CloudWatch returned 20 matching span records in the first-page limit. This does not prove that exactly 20 records exist or that standalone MCP spans exist.

Browser verification proved only that the app loaded on port 3011 and created a chat session with HTTP 201. The paid checks used `ChatService`, not the browser UI. The current CLI identity can have administrator permissions. This work does not add seller identities, grants, OAuth, or user impersonation. The synthetic foundation remains 28 raw records and 27 accepted records. The completed scale load adds 9,972 accepted envelopes and reaches 10,000 Bronze and 9,999 Silver rows.

Read the [Premium Gold tools guide](docs/data/premium-gold-tools.md) before an apply or live verifier run.

## Interview slide deck

The static deck source is in [`slides/`](slides/).
Open the live five-slide deck at [elijahstr.github.io/livenation-demo](https://elijahstr.github.io/livenation-demo/).
GitHub Pages publishes the static runtime files and supplied brand assets from the `gh-pages` branch.
