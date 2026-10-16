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

## AgentCore chat and traces

The sales UI includes chat code in the Recovery Agent area. The default server keeps live chat disabled.

Enable live chat only after a bounded AWS selector verification succeeds:

```sh
AGENTCORE_CHAT_ENABLED=1 AGENTCORE_CHAT_TOOL_SELECTOR=qualified PORT=3001 bun run dev
```

Use only the selector that passed the recorded verification. Try `qualified` first because the earlier plain-name probe failed. The browser cannot enable chat or select a tool.

Developer details show the conversation ID and its AWS runtime ID. Persistent chat reuses that runtime ID for each turn. AWS observability is active. A bounded live request produced 13 verified spans for the model call and memory operations. CloudWatch retains these logs for 30 days. See the [trace guide](infra/README.md#read-a-conversation-trace) for AWS access and the verified example.

Current behavior: the chat code exists and has local tests. AWS authentication works. The first restricted live test requested six evidence calls; the application rejected the batch at its three-call limit. The complete live chat remains unverified. The existing fixed recovery flow still uses a legacy wildcard tool setting.

Conversation memory is deployed and retains demo events for seven days, with no long-term facts or preferences. The live test verified recall after the runtime's maximum lifetime and separation between conversations. Memory applies to every invocation of the shared harness. Chat and recovery use separate actor IDs. The current UI has no saved-chat list; a server restart or thirty-minute idle expiry requires a new chat. See the [memory plan](docs/plans/2026-10-16-agentcore-conversation-memory.md).

Direct Databricks MCP is the selected next connection. It needs the approved sales Genie asset and an AWS-side Databricks credential. Neither is configured yet. The local Databricks CLI profile is authenticated.

Run the bounded live verification only after the cost check permits it:

```sh
bun run scripts/verify-agentcore-chat.ts --selector qualified
```

The command requires current observed cost below $13. It records no more than three attempts. It reads the current six fresh Databricks rows. Its shell request is supporting evidence only. It does not prove that every built-in tool is unavailable.

Use an existing runtime ID for trace lookup. This command makes no new model calls:

```sh
bun run scripts/verify-agentcore-chat.ts --trace RUNTIME_SESSION_UUID
```

The required Databricks CLI is 1.18.0. The recorded local CLI is 1.17.0. Do not install or upgrade it without approval.

## Sales workspace mock

The [sales workspace mock](docs/prototypes/premium-sales/index.html) includes a simulated scan, account conversations, renewals, new leads, and a parking upsell.
It runs locally without AWS or Databricks credentials.

```sh
bun docs/prototypes/premium-sales/serve.ts
```

Open `http://127.0.0.1:4409`.

The [decision record and research brief](docs/design/premium-sales/decisions-and-research.md) records the agreed scenarios, proposed architecture, source summaries, and checks still required.

## Premium Databricks foundation

The [operational guide](docs/data/premium-databricks-foundation.md) records the reviewed synthetic Bronze, Silver, and Gold setup and its two verified complete runs.

Run its default local dry run before any authorized workspace change:

```sh
timeout --kill-after=2s 5s bun scripts/setup-premium-databricks.ts
```

The `--apply` mode writes the reviewed Databricks workspace scope: the three `workspace.ln_premium_*` schemas.

## Interview slide deck

The static deck source is in [`slides/`](slides/).
Open the live five-slide deck at [elijahstr.github.io/livenation-demo](https://elijahstr.github.io/livenation-demo/).
GitHub Pages publishes the static runtime files and supplied brand assets from the `gh-pages` branch.
