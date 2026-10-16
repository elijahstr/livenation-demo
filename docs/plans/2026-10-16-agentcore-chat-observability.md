# AgentCore chat and CloudWatch observability implementation plan

> **Material risk:** The current Kimi invocation overrides `allowedTools` with `['*']`. This can expose built-in `shell` and `file_operations`. The implementation must first prove an exact selector for `get_sales_evidence` with a bounded live probe. If Kimi cannot make the inline call without built-in tools, stop. Do not ship a wildcard fallback.

## Goal

Add a seller chat to the existing **RECOVERY AGENT** area. The chat can discuss only approved synthetic West sales evidence. It can use the existing managed Kimi harness and one read-only inline tool. The interface shows streamed text, tool progress, a new-chat control, a stop control, and collapsible developer details with the server session ID and a CloudWatch link.

The server owns credentials, model settings, tool schemas, harness ARN, and transcript construction. The browser can send only a message and a server-issued session ID. The result preserves the current recovery workflow and never executes email, advertising, or Databricks writes.

<!-- fig:chat-trust-flow -->

## Scope

Included work:

- Add bounded, memory-only server chat sessions and NDJSON chat streaming.
- Add the local chat interface as a module separate from `public/app.js` and `public/recovery-workflow.js`.
- Extend the harness cycle for first-turn streaming, aggregate token usage, and safe inline-tool follow-up messages.
- Add a narrow sales-evidence resolver for a requested approved event or the six-show West portfolio.
- Add CloudWatch Transaction Search inspection and an idempotent scoped configuration script.
- Add CloudWatch links and an observability governance inventory.
- Add a deterministic seed-builder clock path and stale-evidence proof.

Excluded work:

- Durable AgentCore Memory, a custom trace viewer, a CLI trace inspector, or lifecycle hooks.
- New dependencies, model changes, Databricks schemas, Databricks writes, email sends, or advertising actions.
- A harness redeploy unless a live probe proves request overrides cannot safely provide the required tool restriction.
- Terraform apply from this worktree, state copying, or a change to shared AWS account settings without inspection and an explicit dry-run scope.

## Risk tier and authorization

This is **Tier 1** for CloudWatch resource policies, X-Ray trace delivery, shared account settings, and IAM discovery. It is **Tier 2** for the new chat API route and UI pattern. The user already authorized implementation after the required plan review. This plan does not request a second approval.

## Verified context

### Repository facts at the review baseline

- `src/server.ts` binds to `127.0.0.1`. It checks loopback `Host` and `Origin`, serves an allowlist, and uses one `checkActive` flag for the recovery stream.
- `src/main.ts` reads the harness ARN from `HARNESS_ARN` or `terraform output`. The primary checkout owns the ignored Terraform state. A worktree must not create an empty replacement state.
- `src/agentcore-harness-client.ts` currently applies `tools: [createWestEvidenceTool(eventId)]` and `allowedTools: ['*']` for Kimi. The comment records that this also exposes built-in tools.
- `src/harness-tool-cycle.ts` starts text callbacks only after a tool follow-up. It currently sends an assistant `toolUse` again before the `toolResult` message.
- `src/databricks-sales-adapter.ts` reads the six-row West portfolio with a fixed region and a freshness parameter. `src/west-sales.ts` validates synthetic origin, freshness, approved venues, and approved signals.
- `src/west-seed.ts` calls `new Date()` internally. Its tests use September 28 evidence, so the current October 16 clock makes three baseline tests stale. The baseline is 79 pass and 3 stale-seed failures.
- `config/demo-limits.json` records a $13 target, a $15 operational stop, and a strict less-than-$20 cap. It explicitly says the configuration is not a live budget control.

### Current platform facts

- AgentCore inline functions execute in client code. The harness returns a `tool_use` handoff, then accepts the matching `toolResult` on a follow-up invocation with the same `runtimeSessionId`. [AWS Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)
- `allowedTools` restricts model tool selection for `InvokeHarness`. It does not restrict direct runtime commands. The caller policy must not grant `bedrock-agentcore:InvokeAgentRuntimeCommand`. The execution role must not gain that permission. [AWS Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)
- Default `shell` and `file_operations` remain available unless `allowedTools` restricts them. Their definitions also add model input tokens. [AWS Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)
- Managed harness memory can persist history when enabled. The deployed Terraform configuration disables memory. The app must therefore send its own bounded transcript. [AWS Harness memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-memory.html)
- CloudWatch Transaction Search requires a one-time account setup. AWS documents a scoped Logs resource policy for `xray.amazonaws.com`, an X-Ray destination of `CloudWatchLogs`, and an optional indexing rule. It can take ten minutes before spans become searchable. [AWS observability setup](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-get-started.html)
- Harness sessions run in AgentCore Runtime. The service bills active CPU and peak memory. A shorter idle timeout can reduce idle memory cost, but can add cold starts. [AWS Harness operations](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html)

### Inferences and unverified facts

- **Inference:** Request-time overrides can provide the safe chat tool schema without a harness redeploy. The implementation validates this with the required live probe.
- **Unverified:** Kimi supports one exact `allowedTools` selector with an invoke-time inline function. The existing wildcard is only a workaround. The live probe decides this point.
- **Unverified:** The actual harness name, runtime ARN, execution role, log groups, existing resource policies, trace destination, and indexing percentage. The inspection script discovers these before any AWS write.
- **Verified:** The console entry is `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#gen-ai-observability`. It is a general console link, not a direct session URL.

## Locked decisions

- Use the current Terraform-managed Kimi harness, recovery workflow, and read-only synthetic West Databricks adapter.
- Keep AWS credentials and all model or tool configuration on the server.
- Use a stable app conversation UUID for browser and server state. Create a new runtime session UUID for each turn. Reuse that runtime ID only for an inline-tool handoff in that turn.
- Store sessions only in process memory. Retain at most six completed turns and 24,000 transcript characters. Discard oldest complete turns first. Expire idle sessions after 30 minutes. Keep at most 20 sessions.
- Store only user and final assistant text for each completed turn, plus source timestamps. Do not store raw duplicate tool results.
- Permit at most 20 turns per session, one active invocation across recovery and chat, a 90-second chat deadline through `AbortSignal`, 16 KiB request JSON, and 4,000 characters per message. Set each chat harness invocation to 40 seconds, client-loop limit to two, and harness `maxIterations` to three.
- Invalidate the server chat session after an invoke error or abort. Require New chat before another message. This prevents reuse after a pending inline-tool callback.
- Accept only JSON object keys `message` and `sessionId` for chat input. Return 400 for invalid input, 404 for unknown or expired sessions, 409 for the shared active invocation, and 413 for size limits.
- Stream newline-delimited JSON with `session`, `token`, `tool`, `result`, and `error` event types.
- Use `textContent` for all model output. Never put model text in `innerHTML`.
- Require an `Origin` header for chat writes. After the loopback Host check, require `Origin` to equal `http://${Host}`. Keep the existing loopback checks for every route.
- Expose only `get_sales_evidence` to freeform chat. Do not allow wildcard tools, built-in tools, role blocks, ARN values, model settings, tool schemas, or configuration in browser input.
- Resolve the adapter lazily only after a tool request, once per turn. Cache validated rows for later evidence calls in that turn. Tool errors abort the turn, show a sanitized client error, and invalidate the session. The server does not substitute a fixture.
- When no event is requested, the evidence tool returns only the approved six-show portfolio. When an event is requested, it returns the exact approved ID only.
- Preserve `origin: synthetic` and `data_as_of` timestamps in each tool result and prompt instruction.
- Enable no lifecycle hooks in this change. The hooks remain available for a later audit design. [AWS lifecycle hooks](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-lifecycle-hooks.html)
- Do not call `UpdateIndexingRule`. Refuse configuration when the Default rule is absent. Set one-day retention only after the required groups exist.

## Governance inventory

| Surface | Configured in this change | Available but not enabled |
| --- | --- | --- |
| Conversation memory | Process-only session transcript | AgentCore managed memory |
| Model tools | One inline evidence tool | Shell, file operations, other harness tools |
| Seller actions | Read-only recommendation text | Email and advertising execution |
| Trace access | CloudWatch Transaction Search link | Custom trace viewer and CLI inspector |
| Lifecycle | Existing runtime lifecycle limits | `after_tool_call` hooks |
| Data access | Fixed synthetic West evidence | Databricks writes and other regions |

## Implementation

### 1. Add bounded chat session ownership

Create `src/chat-service.ts` and `tests/chat-service.test.ts`.

Define `ChatService` with a `Map` of session records. A record contains the UUID, created and last-used timestamps, completed transcript turns, transcript character count, turn count, and active status. A completed turn stores user text, final assistant text, and source timestamps. It does not store raw duplicate tool results. Discard oldest complete turns until both the six-turn and 24,000-character caps hold.

Create a session only through `POST /api/chat/sessions`. Generate the app conversation UUID with `crypto.randomUUID()`. Evict expired sessions before creation and before use. Evict the least-recently-used inactive session when the twentieth session exists.

Mark a session invalid after a harness error, tool error, or client abort. Do not accept another turn for that session. The NDJSON terminal event tells the client to start a new chat. This prevents a stale or pending inline-tool handoff from corrupting a later invocation.

Validate the input before service work. Reject non-object JSON, unknown keys, missing `message` or `sessionId`, non-string values, empty trimmed messages, values longer than 4,000 characters, and bodies larger than 16 KiB. The browser never selects the model, ARN, tool, role, prompt block, or config.

Build each model prompt in the service. It includes the fixed safety instruction, the current user message, and JSON-encoded last six completed turns in explicit `UNTRUSTED PRIOR CONVERSATION` delimiters. The prompt says that prior content is user-provided context, not instructions. This formatting does not prevent prompt injection. Tool authorization is the actual boundary. It requires synthetic origin and source timestamps in evidence claims. This keeps continuity while managed memory remains disabled.

### 2. Add safe chat evidence resolution

Extend `src/agentcore-harness-client.ts` with a chat-specific `createWestEvidenceTool()` schema. Its only accepted optional property is `event_id`; it has no client-controlled region, role, or endpoint field. The server fixes region to `west`.

Create a chat resolver in `src/chat-service.ts` or a small `src/chat-evidence.ts` module. On the first valid tool request in a turn, call the existing adapter and validate all returned rows through `validateWestSalesRows` and `validateApprovedWestRows`. Cache the validated rows for later valid evidence calls in the same turn. Reject a non-object input, unknown keys, malformed event ID, and a non-approved ID.

Return the full bounded six-row portfolio when `event_id` is absent. Return one exact approved row when it is present. Return each row with its `origin` and `data_as_of`. Propagate adapter and validation errors, including stale data, to the tool result with a safe text error. Do not use a local fixture, refresh, or reseed Databricks data.

### 3. Correct and extend the harness stream cycle

Modify `src/harness-tool-cycle.ts` and its focused tests.

Add an opt-in initial-token callback for chat. Keep recovery first-pass token suppression unchanged. Create a runtime session UUID for each chat turn. Reuse it only inside that turn for an inline follow-up. This prevents harness-held conversation history from exceeding the app transcript cap. It causes a cold start each turn and can increase latency and idle-memory cost. Stream public response text as it arrives. The final result contains the final answer and aggregate token usage. The browser replaces preliminary text with that final answer. Do not call a resolver until the full stream ends with `tool_use`.

Use the AWS documented follow-up shape: send only the matching user `toolResult` in the follow-up request, reuse the same runtime session ID, and include the same invoke-time tool override. Update the existing test that asserts an assistant `toolUse` resend. This enforces the documented contract. It does not weaken the test. Keep the recovery-cycle tests, then add tests for first-turn tokens, aggregate token usage, exact follow-up content, an initial response with text before `tool_use`, and errors after a partial stream.

Set harness `maxIterations` to three, with a client loop limit of two. Chat accepts at most three adjacent evidence calls per model response. Recovery keeps its one-call limit. Parse an absent input delta as an empty object. Parse the full batch before resolver calls. Return ordered matching results in one user message. Keep recovery behavior unchanged unless the shared helper requires a compatible callback change. Reject any tool name except `get_sales_evidence`. Close the resolver over the turn deadline signal and pass it to the Databricks adapter.

### 4. Replace the wildcard only after the bounded probe

Use `scripts/verify-agentcore-chat.ts` for at most three recorded attempts. Try `qualified` first: the plain tool name plus `@*/get_sales_evidence`. The `plain` mode sends only the plain name. Its earlier failure remains a concern. It never runs a wildcard baseline. Each probe asks for a known approved event, completes one inline handoff, then sends a benign shell-request prompt and confirms no `shell` event occurs. Token overhead is a heuristic only, because AWS says the count varies. It is not proof that built-in tools are absent.

Run the probe only after AWS authentication, current spend inspection, and confirmation that cost stays below the $15 operational stop. Stop before the probe if the strict $20 cap could be reached. The script does not make a budget promise.

Mock-tested local chat work can proceed while AWS authentication is pending. The probe must pass before freeform chat activation or shipment. A server environment flag enables live chat only after a verified safe selector. Browser input cannot set it. If the selector fails, keep existing fixed recovery behavior unchanged and leave live chat disabled. Do not retain a wildcard for chat, add shell permissions, or change the model without a new decision.

### 5. Add API routes and shared concurrency

Modify `src/server.ts`, `src/main.ts`, and `tests/server.test.ts`.

Replace the local recovery-only active flag with one server-wide invocation gate that covers `POST /api/sales-check`, `POST /api/sales-check/stream`, and `POST /api/chat/stream`. Keep recovery error text where useful. Chat returns 409 while recovery runs and recovery returns 409 while chat runs.

Add `POST /api/chat/sessions`. Require the `Origin` header to equal `http://${Host}` for this write. Add `POST /api/chat/stream`, with the same exact origin rule, request-abort propagation, `cache-control: no-store`, and NDJSON response. The server emits the session event first, then token, tool, result, or error events. Stop cancels only the local request. After an abort or ambiguous error, keep the gate until the last upstream invoke start plus 45 seconds. Apply the same safety rule to recovery with its current 60-second timeout.

Add `public/chat-client.js` to the static allowlist. The route tests cover the static allowlist, exact origin mismatch, malformed and oversized input, session creation, unknown session, idle expiry, turn cap, shared 409 behavior, abort release, and NDJSON event order.

### 6. Add the recovery-agent chat interface

Modify `public/index.html`, `public/styles.css`, and add `public/chat-client.js`. Do not combine this state with the recovery workflow module.

Place a compact conversation area in the existing RECOVERY AGENT case. Include a transcript region with accessible live status, a textarea or input composer, Send, Stop, and New chat controls. Disable Send while an invocation runs. Stop aborts only the browser request and leaves the partial assistant text visibly labeled as stopped. New chat clears local messages. The next send requests a fresh server session. Preserve the composer text until the server accepts a turn. Keep the existing single quiet synthetic-data disclosure outside the case cards. Do not add another literal `synthetic` label inside the cards.

Render user, model, tool-progress, error, and stopped states as DOM elements. Set all model and tool result text with `textContent`. The developer-details element is collapsed by default. It displays the session ID separately from a generic CloudWatch console link. It never exposes credentials, an ARN, prompt text, model settings, or tool input.

Preserve the current Run recovery agent control and stage behavior. The chat does not enable an action or affect an approval record. Label browser-only stream tests as **mock** in their visible test fixture.

### 7. Add inspected CloudWatch setup

Add `scripts/inspect-configure-agentcore-observability.ts` and `tests/observability-script.test.ts`.

The script uses the local AWS CLI with the configured `livenation-demo` profile. It never prints credential values. Its inspect mode discovers the harness from an explicit `HARNESS_ARN` or a scoped exact configured harness name through read-only AWS CLI calls. It obtains the runtime ARN, execution role, AgentCore log groups, retention values, Logs resource policies, X-Ray trace destination, indexing configuration, and relevant role policies. Startup uses the same explicit environment ARN or scoped discovery. It does not read Terraform state.

The script then prints a dry-run write scope. It names every policy, log group, retention value, X-Ray setting, and IAM permission which a configure run would change. It records prior values in a task-owned local rollback file. It refuses configure mode when discovery does not prove that a group is task-owned or a current setting can be restored.

Configure mode is idempotent. It uses one fixed task policy name and the documented `aws/spans:*` and `/aws/application-signals/data:*` resource ARNs with `aws:SourceArn` and `aws:SourceAccount` conditions for `xray.amazonaws.com`. It sets the X-Ray destination to `CloudWatchLogs`. It does not call `UpdateIndexingRule` and refuses an absent Default rule. It creates a missing nonreserved Application Signals group, waits for AWS to create reserved `aws/spans`, and then sets one-day retention. It never deletes groups, policies, or account configuration.

Account Transaction Search and X-Ray destination are shared account settings. The script records prior X-Ray or CloudWatchLogs destination and prior indexing for rollback. It must report their prior values and a reversible rollback command. Inspect mode prints the exact missing caller IAM statement. The main owner applies it to the known demo identity if permissions permit. Otherwise it supplies the concrete statement for a human. Do not use root escalation, unknown new grants, or an empty-worktree Terraform apply. [AWS observability setup](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-get-started.html)

The app shows `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#gen-ai-observability` and the session ID separately with instructions to filter for it. The generic link does not contain the session ID. Do not invent a direct session URL or add a CloudWatch API proxy. Validation requires a manual console lookup that proves the same session ID appears in the collected trace.

### 8. Repair test freshness deterministically

Modify `src/west-seed.ts`, `scripts/seed-west-sales-demo.ts`, and `tests/west-seed.test.ts`.

Add a narrow `now` parameter to `validateWestSeedRows` and `buildWestSeedStatements`, with the real current time as the production default. The seed script passes a current time. Tests pass one fixed clock for valid old seed examples. Add one test that uses the current default and proves stale evidence still fails. Do not weaken the seven-day freshness rule.

## AWS execution order

1. Verify the worktree points at `codex/agentcore-chat-observability` from `21b0866`. Confirm no Terraform state exists here.
2. Authenticate through the approved AWS login path. Do not show the authorization code, tokens, or credential values. The profile name is safe to show.
3. Inspect current spend against the documented $13 target, $15 stop, and strict less-than-$20 cap. Stop before limited probes when cost policy requires it.
4. Run observability inspect mode against account `009073575420` and `us-east-1`. Capture only non-secret resource identifiers and previous setting values in the local rollback record.
5. Run the exact allowed-tools probe. Stop and return to planning on a failed safe selector.
6. Run configure mode only after its dry-run scope matches the discovered task-owned resources. Preserve all prior shared settings.
7. Wait up to ten minutes for Transaction Search ingestion when AWS requires it. Do not treat a delay as a missing trace without this wait.
8. Deploy no Terraform change unless the probe proves that request-time overrides are insufficient and a reviewed plan update identifies the needed change.

## Validation

### Automated

- Run `bun test` after the clock injection. The fixed baseline stale tests must pass, and a new test must prove stale rejection with the real clock path.
- Test `ChatService` limits, LRU eviction, expiration, transcript cap, prompt delimiters, and no browser configuration input.
- Test both initial and follow-up stream tokens, tool use, tool result, metadata, error, abort, and exact same session ID.
- Test API status codes 400, 404, 409, and 413. Test exact Origin enforcement, existing loopback checks, and new-chat-required behavior after an abort or error.
- Test tool input rejection, six-row portfolio results, one-event results, adapter errors, and no fallback fixture.
- Test observability inspect parsing, dry-run scope, policy scoping, preservation of existing indexing, one-percent default, retention target checks, and rollback record creation.

### Manual

1. Open the local app and use a mock stream fixture. Confirm the fixture carries a visible **mock** label.
2. Send a two-turn chat. The first turn must request evidence. The follow-up must answer after the tool result. Confirm text streams on the first response.
3. Confirm the app conversation ID remains stable. Confirm each turn has a new runtime ID and its inline handoff reuses that turn ID.
4. Inspect the browser DOM. Model output must be text nodes, not HTML.
5. Open Developer details. Confirm the generic CloudWatch link and separate session ID show no secret or model configuration.
6. Retrieve the matching AWS trace through the CloudWatch console link or a Transaction Search query. Confirm its session ID and source time.
7. Run a recovery portfolio check during an active chat and a chat during an active recovery check. Each second request must receive 409.

## Risks and stop conditions

| Risk | Control | Stop condition |
| --- | --- | --- |
| Built-in tool exposure | Exact `allowedTools` live probe | Kimi needs wildcard or built-ins for the inline call |
| Shared account telemetry change | Inspect, dry-run scope, capture prior settings | Task ownership or reversible rollback is not proven |
| Trace cost growth | Cost check before limited probe; preserve indexing | Spend reaches the $15 stop or could reach $20 |
| Prompt injection from transcript | Delimited untrusted context; server prompt ownership | A test shows browser content changes tool, model, or role selection |
| Bad evidence | Read adapter only after tool request; full validation | Adapter or validation fails; surface the error |
| Terraform state loss | Use ARN or exact API discovery | Worktree asks to initialize, create, or copy state |

## Open technical live checks

- What exact Kimi `allowedTools` selector works with a request-time inline function?
- Which AgentCore and Transaction Search log groups already exist, and which are task-owned?
- What are the current X-Ray destination, Transaction Search state, and indexing percentage?
- Which console filter finds the AgentCore runtime session ID after the documented general console page opens?
- Which narrowly scoped IAM actions are missing for inspect and configure modes?

These are execution checks, not user product decisions. The implementation must stop when any check invalidates a locked safety boundary.

## AWS governance capabilities reference

This section records AWS capabilities for later decisions. It adds no implementation requirement. Every cloud enablement state remains unverified until AWS login succeeds.

- **IAM and identity:** Caller IAM policy controls harness invocation. The execution role controls AWS actions from the harness. Harnesses can require inbound identity-provider JWTs. Per-user outbound OAuth needs the inbound OAuth path and AgentCore Identity. SigV4 does not propagate a per-user identity to downstream tools. [Harness security](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-security.html)
- **Gateway policy:** AgentCore Gateway can enforce Cedar or Dogwood policy for calls that go through a gateway. This does not govern the existing client-side inline handler. [Policy](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy.html) [Harness security](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-security.html)
- **Hooks and notifications:** Lifecycle hooks can send events to Lambda, SNS, or EventBridge. A Lambda `before_tool_call` hook can deny an inline call before client handoff. SNS and EventBridge targets notify without a decision path. [Lifecycle hooks](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-lifecycle-hooks.html)
- **Content safety:** Bedrock Guardrails can provide content-check signals to AgentCore Policy. Guardrails do not replace application authorization. [Guardrails in Policy](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-guardrails-in-policies.html)
- **Quality measurement:** AgentCore Evaluations supports on-demand and sampled online evaluation. These measure quality. They do not authorize a tool or user action. [Evaluation types](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/evaluations-types.html)
- **Audit and observability:** CloudTrail can record harness management and data events. Inspect the actual trail data-event configuration before relying on it for invocation audit. Transaction Search indexing is an index or sample setting. It does not promise that ingestion has no charge. [Harness operations](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html) [AWS observability setup](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-get-started.html)
- **Registry governance:** AWS Agent Registry supports discovery and approval. The public-preview `bedrock-agentcore` namespace ends on October 30, 2026. Use the `agent-registry` namespace for new work and plan migration if the preview namespace appears in discovery. [Registry record lifecycle](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-record-lifecycle.html)

## Sources

- [Harness get started](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-get-started.html)
- [Harness operations](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html)
- [Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)
- [Harness security](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-security.html)
- [Harness memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-memory.html)
- [Harness lifecycle hooks](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-lifecycle-hooks.html)
- [AgentCore observability setup](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-get-started.html)
- [AgentCore observability policy](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy.html)
- [Evaluation types](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/evaluations-types.html)
- [Registry record lifecycle](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-record-lifecycle.html)

## Review record

Sonnet 5.5 supplied repository and documentation context. Opus 5.5 found a material revision. The plan now applies the accepted rulings: two-ID sessions, safe selector probes, caller IAM preparation, shared-setting rollback, timeout gate, exact Origin, abortable resolver, LRU correction, JSON transcript, and documented follow-up test update.

The review also checked [InvokeHarness](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarness.html), [Enable Transaction Search](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Enable-TransactionSearch.html), and [UpdateTraceSegmentDestination](https://docs.aws.amazon.com/xray/latest/api/API_UpdateTraceSegmentDestination.html). Transaction Search is account-wide. One-percent indexing limits summary indexing only. It does not make span ingestion or storage free.

## Final code review and rulings

Sonnet 5.5 collected facts. Opus 5.5 requested changes. The host applied the accepted fixes once; no second review round was requested. Live AWS verification remains blocked by the pending authorization code.

- Finding 1, high, agree: empty inline arguments now become an empty object. A regression test covers an absent input delta.
- Finding 2, medium, agree: chat handles up to three adjacent evidence calls in order. Recovery retains its existing single-call bound.
- Finding 3, medium, agree: a separate rollback-only policy provides DeleteResourcePolicy permission. The default apply policy still cannot delete policies or log groups.
- Finding 4, low, partial: API configuration waits for the CloudWatchLogs destination to become ACTIVE. Broader Application Signals and service-linked-role grants remain excluded pending evidence of need.
- Finding 5, low, agree: the concurrency test waits for an explicit request-entry signal instead of a one-millisecond delay.
- Finding 6, low, agree: this plan now describes final-answer text, aggregate usage, and refusal of an absent indexing rule. Added LRU and twenty-turn boundary tests.
- Finding 7, low, partial: disabled chat already preserves the composer text. Busy and rejected turn requests now preserve it too.
- Finding 8, low, agree: startup discovery needs valid AWS credentials unless HARNESS_ARN is explicit. The README states this requirement.

The host fetched current [AWS inline tool documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html) before the empty-argument and adjacent-call fixes. The host also checked [Transaction Search API steps](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Enable-TransactionSearch.html). That page documents the ACTIVE check; the necessity of its broader console prerequisites for this API path remains unverified. [CloudWatch Logs service authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazoncloudwatchlogs.html) lists no resource-level scope for DeleteResourcePolicy. Its separate rollback policy therefore uses Resource wildcard and requires explicit operator review.

## Operational addendum: October 16, 2026

This addendum supersedes the plan's unverified observability execution assertions. It does not change the chat, MCP, or harness design.

The first attempt to create the reserved `aws/spans` group failed before any write. The corrected manual setup followed the AWS documents: it installed the scoped resource policy, set the `CloudWatchLogs` destination, let AWS create both shared groups during enablement, and then set one-day retention. The scripted path creates a missing nonreserved Application Signals group and waits for AWS to create reserved `aws/spans`.

AWS can return JSON policy objects with a different key order. The script parses the policy JSON and uses Node `isDeepStrictEqual` on the objects. This check tests policy content, not returned key order.

The active destination, three one-day log groups, and the bounded trace probe now have verified evidence. The Default summary-indexing value is one percent. The setup did not call `UpdateIndexingRule`. The one-percent value indexes a summary sample. It does not restrict full span ingestion.

Sonnet 5.5 collected facts. Opus 5.5 approved the independent review with minor fixes. The host applied the fixes and focused checks found no blocker. `bun test` passed 167 tests with zero failures and 609 assertions across 27 files. The setup script Bun build passed. Fourteen focused tests passed after the operator-note clarification. Earlier plan statements that say AWS login, live trace proof, observability execution, or review remains pending are historical.

A session groups conversation turns. A trace records one invocation. A span records one operation within that invocation.

## Local validation result

On October 16, 2026, all 124 tests passed after the review fixes. Both the app and verifier compiled with Bun. Browser mock checks covered two turns, literal HTML text, Stop, New chat, a retained message after HTTP 409, and a 390-pixel light layout.

Historical statement, superseded by the operational addendum: no live AWS chat, selector proof, or trace lookup occurred. The AWS CLI still awaited the user's authorization code. The separate setup validator reported Databricks CLI 1.17.0 instead of the required 1.18.0. No tool upgrade occurred.
