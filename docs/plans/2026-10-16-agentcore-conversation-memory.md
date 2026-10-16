# AgentCore conversation memory implementation plan

> **Blocker:** Do not enable direct Databricks MCP yet. The approved sales Genie asset is absent. The workspace exposes only an unrelated Bakehouse asset. The AWS direct-MCP credential provider list is empty. The local Databricks CLI profile does authenticate. Do not create a token without specific credential approval. This plan preserves that migration dependency.

## Goal

Persist only seller conversation context in a customer-owned Amazon Bedrock AgentCore Memory resource. Persistent chat will keep one AgentCore Runtime session for each browser conversation. A stable server-owned actor ID will scope the memory records. The server will send only the current user text to persistent memory mode.

The change removes the duplicate application transcript from persistent mode. It does not add long-term memory, a chat-history screen, browser restart resume, a new SDK, or a dependency.

<!-- fig:memory-trust-flow -->

## Scope

Included work:

- Create the `livenation_demo_conversation_memory` AgentCore Memory resource with a seven-day event expiry.
- Attach the resource to the existing managed harness through its optional memory configuration for all harness calls.
- Add a narrow execution-role policy for the exact memory ARN.
- Reuse one runtime session ID for each active `ChatService` conversation in persistent mode.
- Keep the existing local transcript mode for recovery and backward compatibility.
- Add source tests, a bounded no-tool paid smoke test, and a read-only startup preflight helper.

Excluded work:

- Direct Databricks MCP activation, token creation, Gateway use, or invented sales endpoints.
- Long-term memory strategies, semantic recall, summaries, browser history, or restart resume.
- New model probes before source checks and independent review pass.
- Resource deletion, Terraform state copying, or committing Terraform state.

## Risk tier and authorization

This is Tier 1 work. It changes managed-memory attachment, execution IAM permissions, and Terraform-managed cloud resources. The user authorized a complete reviewed plan. Cloud writes require the later source checks, simplify pass, independent code review, and precise saved-plan scope.

## Verified platform facts

- AgentCore Memory can persist short-term event history without `memoryStrategies`. With `eventExpiryDuration` set to seven days, event records expire after seven days. [Create a memory store](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-create-a-memory-store.html)
- Managed harness memory requires at least one strategy. Its default strategies create semantic and summary memory. That behavior conflicts with conversation-only memory. [Harness managed memory configuration](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_HarnessManagedMemoryConfiguration.html)
- A harness can reference AgentCore Memory through `agentCoreMemoryConfiguration`, with a memory ARN, actor ID, and bounded message count. [Harness memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-memory.html)
- The execution role needs memory-event actions. The narrow required operations are `CreateEvent`, `DeleteEvent`, `GetEvent`, `ListEvents`, and `RetrieveMemoryRecords`. [Harness security](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-security.html)
- Runtime idle limits and service limits can evict a runtime session. Memory persistence does not keep this process registry or its runtime session alive. [AgentCore limits](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html)

## Inferences and live checks

- Terraform provider 6.66.0 supports `aws_bedrockagentcore_memory` and `harness.memory.agentcore_memory_configuration`. The current provider schema confirms these fields.
- **Verified:** The original Terraform state path is `/home/elijahstraight/repos/livenation-demo/infra/terraform.tfstate`.
- **Verified:** The read-only pre-change plan shows one baseline difference. The deployed harness has `environment_variables: null`, while current configuration sets `{}`. The plan changes it to `{}` and marks the computed actual environment unknown. The evidence is `/tmp/agentcore-memory-review/before-plan.txt`.
- **Unverified:** The deployed harness currently has no conflicting memory attachment. The preflight helper rejects an enabled non-matching attachment.
- **Unverified:** The account cost remains below $13 before the paid memory smoke test. Cost Explorer can lag. The check is not a hard billing cap.

## Locked decisions

- Use direct Databricks MCP after the approved sales Genie asset and credential provider exist. Do not use Gateway.
- Create customer-owned AgentCore Memory named `livenation_demo_conversation_memory`.
- Set `eventExpiryDuration` to seven days. Set no `memoryStrategies`.
- Do not use managed harness memory. It requires at least one strategy and can create semantic and summary memory.
- Attach memory with `agentCoreMemoryConfiguration: { arn, actorId, messagesCount: 12 }`.
- Use `demo-user` for chat, `recovery-system` for recovery, and `demo-system` for generic scripts. The browser cannot select an actor.
- The seven-day event retention applies to all harness calls. It does not apply only to chat.
- Grant a separate execution IAM policy only `CreateEvent`, `DeleteEvent`, `GetEvent`, `ListEvents`, and `RetrieveMemoryRecords` on the exact new memory ARN.
- Preserve all other harness properties, including tool schemas, model limits, existing execution permissions, and recovery behavior.
- Use one runtime session ID per `ChatService` conversation in persistent mode. Use a distinct runtime session ID for each different conversation.
- Send only the current user text to the harness in persistent mode. Do not append the local transcript.
- Keep local memory-only transcript mode for recovery and backward compatibility.
- Select persistent memory mode for chat only after startup and per-turn preflight verify the exact expected memory attachment.
- Keep abort invalidation, the shared concurrency cooldown, message limits, and all current limits.

## Architecture

### 1. Terraform declares the owned memory boundary

Update `infra/main.tf` and its focused variables or outputs.

Declare the AgentCore Memory resource with the exact name and seven-day event expiry. Omit `memoryStrategies`. Declare a separate IAM policy for the existing harness execution role. Scope each memory-event action to only the created memory ARN. Add an explicit `depends_on` edge from the harness memory attachment to this policy.

Put the exact name, seven-day expiry, actor ID, and 12-message limit in `config/conversation-memory.json`. Both Terraform and TypeScript consume this file. Keep `config/create-harness.json` as the bootstrap template with memory disabled. Document that Terraform overrides this bootstrap value.

Reference the memory configuration from the existing harness resource. Preserve every existing harness setting outside the memory object. Normalize empty `environmentVariables` to `null` in Terraform. This preserves the deployed absence and removes the verified baseline diff. Terraform must not reconstruct tool schemas or limits from a second source.

Run `terraform init` with the existing lock and a task-private `TF_DATA_DIR`. Run `terraform plan` from the feature worktree with `-state=/home/elijahstraight/repos/livenation-demo/infra/terraform.tfstate`. Save the plan in a task-private path.

Record the original state serial and lineage before planning. Verify the same serial lineage after apply. Verify that no Terraform state file exists in the feature worktree.

Verify that the saved plan contains only a new memory resource, a separate IAM policy, and an in-place harness memory update. Computed attributes can remain unknown. Reject any unrelated change or replacement. Apply only that saved plan with the same state path and lock. Stop when Terraform reports a concurrent state lock. Do not copy, import, or commit state. Do not run an imperative apply script.

Use an explicit rollback update that sets the harness memory block to disabled. Do not omit the block. This worktree is the sole Terraform control point until equivalent infrastructure configuration reaches `main`.

Do not run `main` Terraform apply until `main` includes the equivalent infrastructure configuration. Stop on every plan that destroys, replaces, or changes an unrelated resource. Do not split state. Do not use `terraform state rm`. Do not use `-target` as a workaround.

### 2. Startup preflight and chat mode

Add a read-only AWS CLI preflight helper. It validates the exact attached memory ARN, `ACTIVE` status, no strategies, seven-day event expiry, fixed actor ID, and message count before the server enables persistent chat. It repeats this low-cost check before each turn. It detects detached memory and prevents silent context loss. It rejects an unexpected attachment and does not mutate cloud resources.

Extend `ChatService` with an explicit memory mode selected at startup. Startup calls the read-only attachment verification before chat becomes available. Persistent mode remains disabled if verification fails, returns an unexpected memory ARN, actor ID, or message count, or cannot complete.

Persistent mode creates one runtime session UUID when the server creates the conversation. It stores that UUID with the server session record. Every turn for that conversation uses the same runtime session UUID. A different conversation receives a new UUID.

Persistent mode prompts the harness with the current user text only. It does not include `UNTRUSTED PRIOR CONVERSATION` or any application transcript. The client system prompt contains the greeting and sales-freshness instructions. The harness receives memory context through AgentCore Memory. This prevents duplicate context and keeps the server transcript outside the persistent path.

Recovery and local compatibility mode retain the present bounded in-process transcript and their current turn-specific runtime session behavior. Existing callers retain that mode until they explicitly select persistent chat.

### 3. The user-visible limit remains explicit

AWS can retain the conversation records after the runtime becomes idle. The local in-process conversation registry still expires after 30 minutes and is lost on a server restart. The 12 raw messages can contain fewer than six full turns. This change does not promise chat resume across browser restart or server restart. No new user interface is required.

## Tests

Add or update focused tests without changing tests only to pass.

- Persistent mode reuses one runtime session ID for several turns in one conversation.
- Persistent mode uses different runtime session IDs for separate conversations.
- Persistent mode sends current user text without a duplicate local transcript.
- Persistent mode uses the fixed server-owned `demo-user` actor.
- Recovery uses `recovery-system`. Generic scripts use `demo-system` unless they specify another server-owned actor.
- Startup rejects chat before the expected memory attachment is verified.
- Per-turn preflight rejects detached memory before persistent context can be silently lost.
- Local mode keeps its existing transcript and recovery behavior.
- Abort invalidation, shared concurrency cooldown, size limits, and turn limits remain effective. A rejected `toolResult` invalidates only its affected conversation.
- The preflight helper rejects a non-matching attachment, inactive memory, strategies, or an incorrect expiry.
- Terraform reads the shared JSON configuration and a saved plan contains only the permitted additions and in-place memory update. The state serial and lineage remain on the original state file.
- Terraform configuration has no memory strategies and scopes the separate policy to the exact created memory ARN.

## Paid smoke test

Run this test only after cloud deployment, source tests, simplify, and independent code review pass. It uses actual `ChatService` persistent mode and the production chat-invoker overrides.

1. Check observed account cost. Stop when cost is $13 or more.
2. Record at most three test attempts in `outputs/agentcore-memory/probe-attempts.json`. Do not auto-loop.
3. Create two unique runtime sessions for the fixed actor `demo-user`.
4. In the first session, send a random synthetic phrase. Do not request a tool.
5. Observe saved event identifiers only. Do not print event payloads.
6. Wait more than 300 seconds. Use 10-second wait steps.
7. Query the first session with the same actor. It must recall the synthetic phrase.
8. Query the other session. It must not receive the phrase.
9. Stop on any failure. Do not make model probes after a failed attempt.

The saved event identifiers and wait beyond the 300-second maximum runtime lifetime prove supported cold-runtime restore, same-session recall, and session isolation. The test does not prove a sales-tool end-to-end chat flow. That flow remains blocked by the existing six-call data path and direct-MCP migration. This plan does not prove long-term memory behavior.

## Delivery sequence

1. Confirm the original Terraform state path and inspect the deployed harness without writes.
2. Implement Terraform, shared JSON configuration, startup preflight, persistent chat mode, and tests.
3. Run focused tests and the complete relevant test suite.
4. Simplify the diff, then run the affected tests again.
5. Run one independent code review on the complete diff.
6. Apply accepted findings and rerun focused checks.
7. Run Terraform validation and a saved-plan scope check with the original locked state path.
8. Apply cloud changes from the inspected saved feature-worktree plan when it matches the task-owned resources.
9. Run the bounded paid smoke test only when its cost gate passes.
10. Update `README.md`, `infra/README.md`, and stale slide claims that say Memory off.

## Risks and open questions

| Risk or question | Control | Stop condition |
| --- | --- | --- |
| Direct MCP has no approved sales asset or credential provider | Preserve the blocker and use current local evidence path | Genie asset or credential provider is absent |
| Managed memory creates unwanted durable summaries | Use customer-owned memory with no strategies | Any configuration requires a strategy |
| Existing harness memory attachment is unknown | Preflight rejects it before chat enables | Attachment is enabled and non-matching |
| Terraform plan includes unrelated work | Apply only a saved plan with three permitted changes | Plan adds unrelated changes or replacement |
| Original Terraform state is unavailable | Use its declared path and lock only | State cannot be read or is concurrently locked |
| Memory test cost grows | Check cost below $13 and allow three recorded attempts | Any attempt fails or cost is $13 or more |
| Local registry expiry is confused with AWS memory expiry | Document the 30-minute and restart limit | A requirement asks for browser or restart resume |
| Recovery wildcard concern remains | Track it as direct-MCP migration work | Migration changes recovery tool authorization |
| Future demo identity lacks metadata-read permission | Prepare the required read permission only | A future non-root identity requires preflight |
| Shared-state deployment can conflict with a future main apply | Use the saved feature plan as the sole control point | Any main apply lacks equivalent infrastructure configuration |

## Deployment status

Terraform apply completed with two additions, one in-place change, and no destroys. The memory ID is `livenation_demo_conversation_memory-1Fd0yIE92A`. It is `ACTIVE`, has seven-day retention, and reports `strategies: []`.

The harness remains `livenation_demo-1on72c4veC` in `READY` status. Its runtime ARN is unchanged. The original state serial changed from 12 to 16 with the same lineage `cf6dab48-8f79-c875-3b24-f9ec53633093`. No worktree state file exists.

The post-apply Terraform plan returned exit code 0 with no changes. The full test suite passed with 138 tests, zero failures, 508 expects, and 23 files. The main build passed.

Historical status: Memory probe attempt 1 completed its first turn and found saved event identifiers. It then entered the 310-second maximum-lifetime wait. This pending status is superseded by the final verification below.

Evidence records are `/tmp/agentcore-memory-review/apply.txt`, `/tmp/agentcore-memory-review/after-plan.txt`, `/tmp/agentcore-memory-review/tests-final.txt`, and `/tmp/agentcore-memory-review/live-probe.txt`.

## Final memory verification

Memory probe attempt 1 passed at `2026-10-16T20:06:11Z`. The private ignored proof is `outputs/agentcore-memory/1792181171416-verification.json`.

The first and same-session calls used runtime session `e0684d34-83ec-4a2e-9028-c98c9554f79d`. The separate session used `0f3395ee-e2a2-4073-96b5-3cc95bf8f314`. The probe reports `sameSessionRestored`, `differentSessionIsolated`, `isolationAcknowledged`, and `noToolCalls` as true.

Saved event counts changed from 6 to 10. The 310-second wait exceeded the 300-second maximum runtime lifetime. Three calls used 773 total tokens: 247, 302, and 224. Observed account cost was about $0 before the test. Cost Explorer lag remains possible.

Conversation memory verification is complete. Sales-tool end-to-end chat, direct Databricks MCP, and trace verification remain pending. The direct-MCP blocker remains unchanged.

## Plan review ledger

| Finding | Ruling | Plan action |
| --- | --- | --- |
| Seven-day retention affects all harness calls | Accepted | Use separate server-owned actors for chat, recovery, and generic scripts. |
| Shared state can conflict with future main applies | Partially accepted | Use the locked saved feature plan as the sole Terraform control point until `main` has equivalent configuration. |
| A rejected tool result can affect only one conversation | Accepted | Add the focused invalidation test. Do not assume a pending handoff persists. |
| A memory smoke test must prove production chat mode | Accepted | Use `ChatService` persistent mode, production overrides, saved event identifiers, and a wait beyond 300 seconds. |
| The harness can attach before its role policy exists | Accepted | Add explicit Terraform `depends_on`. |
| A worktree can create a different state lineage | Accepted | Record state serial and lineage before and after apply. |
| Greeting and sales freshness behavior can drift | Accepted | Put both instructions in the client system prompt. |
| Twelve raw messages can be fewer than six turns | Accepted | State the bounded-message limit without a turn claim. |
| Root can read metadata today | Accepted | Add no grant now. Prepare metadata-read permission for a future demo identity. |
| Documentation still says Memory off | Accepted | Update repository and infrastructure documentation plus slides after implementation. |

## Sources

- [Harness memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-memory.html)
- [Managed memory configuration API](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_HarnessManagedMemoryConfiguration.html)
- [Create a memory store](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-create-a-memory-store.html)
- [Harness security](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-security.html)
- [AgentCore limits](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html)
- [Terraform lifecycle](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle)
- [Terraform local backend](https://developer.hashicorp.com/terraform/language/backend/local)
- [Terraform state coordination](https://developer.hashicorp.com/terraform/language/state/remote)

## Review provenance

Independent plan review used `claude-sonnet-5-5` for repository context and `claude-opus-5-5` for adversarial judgment. The full review record is `/tmp/agentcore-memory-review/plan-review.json`.

## Code review record

Independent code review used `claude-sonnet-5-5` for repository context and `claude-opus-5-5` for judgment. Opus approved the diff with minor fixes. The complete record is `/tmp/agentcore-memory-review/code-review.json`.

| Finding | Ruling | Required action |
| --- | --- | --- |
| Memory strategies are optional | Accepted | Omit strategies or allow `null` and `[]`. Reject `{}` and any long-term strategy in tests. |
| Startup preflight can fail | Accepted | Disable chat and retain the recovery user interface. Per-turn preflight still rejects persistent chat. |
| A metadata probe can fail | Accepted | Use a metadata list-session fallback for diagnosis. Do not retry blindly. |
| A literal `NONE` marker is not proof of isolation | Accepted | Record `isolationAcknowledged` as a soft signal. Treat nonce absence as live-probe support only. Assert configuration and session isolation in tests. |
| Terraform static tests can mirror provider behavior | Accepted | Use manual schema, validation, and saved-plan checks. Do not add static mirror tests. |
| Documentation can claim verified memory too early | Accepted | Hold commit, push, and slide publication until memory verification succeeds. Mark the material pending otherwise. |
| Shared-state risk remains | Accepted | Keep the feature worktree as the sole Terraform control point until `main` has equivalent configuration. |

Thirty-one focused tests passed after the minor fixes. The full suite now has 138 passing tests, zero failures, 508 expects, and 23 files. Terraform deployment and memory recall plus cross-session isolation verification succeeded.
