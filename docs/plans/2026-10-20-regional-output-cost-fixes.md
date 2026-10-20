# Regional output completion and cost reservation fixes

Status: reviewed and revised Tier 2 implementation plan. Implementation has not started.

## Goal

Fix two regional-scan failures. A model response must have enough output space for the required complete result. The runtime cost ledger must reserve and settle each paid invocation with one consistent policy.

The plan keeps the existing Kimi model, tool policy, authorization checks, response validation, source checks, cost cap, and three-account batch size. It adds no dependency, cloud data write, model switch, or new remote service.

<!-- fig:regional-output-cost-flow -->

## Scope

The future implementation changes the local AgentCore invocation override, scan assessment path, local runtime ledger, and tests. It does not change the model ID, model route, source query policy, authorization policy, scan deadline, account scope, or cloud data.

The current scan has a ten-minute deadline. Ninety-three batches need about 930 seconds from one rough ten-second source check per batch. This is a check-only estimate. Initial and final source checks and model time make the real requirement larger. The 180-second batch reserve, fingerprint time, and ten-second cleanup reserve are the `canStartBatch` admission reserve. They are not added elapsed time for every batch. The fixes must not promise a complete scan. A later measurement decision must address coverage, deadline, or batch design.

## Verified context

- `src/local-setup.ts` accepts `bedrockModelConfig.maxTokens` only from 1 through 1,024.
- `src/regional-runtime.ts` uses a 2,048 output-token value for context checks and reservations.
- `src/regional-runtime.ts` reserves four iterations with a 256,000-token input limit and the 2,048 output-token value.
- The runtime can overwrite prior usage when later metadata arrives. It uses a reservation when it cannot calculate an estimate.
- `src/regional-scan-service.ts` uses a fixed batch size of three and a 600,000 millisecond scan deadline.
- The source-cache browser record reports a terminal maximum-token error, incomplete JSON, a $11.062592 local reservation ledger, and no verified actual bill.
- `InvokeHarness` supports both the configured model maximum and a request maximum. The documented contract does not establish precedence. The scan must send 4,096 at both levels.
- Kimi K2.5 supports 16K output and 256K context. This plan uses 262,144 as the conservative input upper bound.
- AgentCore reports invocation-wide usage. It requires integer input, output, and total fields. Cache fields are optional.
- A harness can emit more than one `messageStop`. Business publication needs `end_turn` and a valid result.
- A read-only harness check at about 21:23 UTC found `READY`, Kimi K2.5, `converse_stream`, a 1,024 model limit, a 2,048 request default, three remote iterations, and a 60-second default timeout. It made no cloud mutation.
- The read returned only `modelId`, `maxTokens`, and `apiFormat` in `bedrockModelConfig`. Explicit legacy 1,024 overrides mirror that configuration. The control-plane read was not a model or Cost Explorer call.

## Route policy map

| Route | Model and request output caps | Iterations and timeout | Reservation |
| --- | --- | --- | --- |
| Regional scan | 4,096 and 4,096 | 4 and 40 seconds | $0.6782976 |
| Regional account chat | 1,024 and 2,048 | 4 and 40 seconds | $0.6537216 |
| Premium chat | 1,024 and 2,048 | 4 and 40 seconds | $0.6537216 |
| West chat | 1,024 and 2,048 | 3 and 40 seconds | $0.4902912 |
| West recovery | 1,024 and 2,048 | 3 and 60 seconds | $0.4902912 |

Every route sends the existing Kimi model ID and `converse_stream` route explicitly. Each route uses Standard tier in `us-east-1`. The reservation uses the larger output cap because precedence is unknown. It uses a 262,144-token pricing input bound. The existing 256,000 context-byte guard remains unchanged.

## Decisions

- Set one explicit output budget for the regional scan. The initial bounded value is 4,096 tokens.
- Send `model.bedrockModelConfig.maxTokens: 4096` and `request.maxTokens: 4096` on the full regional override. This removes the default 1,024 conflict without an assumed precedence rule.
- Make every budgeted application route send its verified current policy explicitly. Do not change harness defaults, `config/create-harness.json`, or `src/local-setup.ts`.
- Derive context checks, reservation, and the invocation request from that one policy value. Do not keep independent numeric constants.
- Retain the batch size of three for the first repair. The plan does not use a larger batch as a cost or coverage fix.
- Request compact, exact, validated output. The model must return the required schema only. The existing validator remains the publication gate.
- Retry only a known completed `end_turn` response with invalid JSON. Start a fresh model session. Reuse the same evidence. Keep the global tool allowance, authorization, source fingerprint, and deadline.
- Limit that recovery path to one clean `end_turn` invalid-JSON retry per affected three-account batch. Use a stricter concise instruction and a fresh session. Do not retry token-limit, remote-error, timeout, unknown-submission, abort, source-change, invalid-evidence, cross-account-evidence, or tool-policy cases.
- Never publish a partial JSON result. Convert an exhausted repair to the existing deferred or unavailable result with explicit trace data.
- Record clean `max_tokens` and `max_output_tokens_exceeded` stops as limit outcomes. Defer the batch. Do not retry it automatically.
- Before the next batch and before the final source check, wait once for an existing `remote_until` when it fits inside the deadline and cleanup reserve.
- Do not wait-clear `unknown_block`. If the wait cannot fit or a hold remains, end partial once with an explicit reason. Do not rapidly defer all later accounts.
- Treat remote terminal state and billing completeness as separate facts. A modeled iterator exception does not prove either fact. Keep its hold and reservation.
- Reserve the worst case for each invocation from the same sent model, region, tier, per-iteration output cap, remote iteration cap, and 262,144-token input upper bound.
- Settle an invocation once only after exactly one validated invocation usage record, clean EOF, and the last `messageStop` from the documented enum. This includes `tool_use`. A `tool_result` before EOF is intermediate.
- This settlement rule is a proposed local estimate policy. It does not prove an AWS bill.
- Treat omitted optional cache fields as zero for the current no-cache Kimi route. Treat a present nonzero cache field as incomplete billing until a priced policy exists.
- Keep observed Cost Explorer amount and local ledger amount additive. Do not use an unverified deduplication or maximum shortcut.
- Cache a Cost Explorer response for one hour. Key it by account, query scope, date range, currency, refresh date, and model-rate policy version. Use an explicit no-paginate cursor loop. Record every request and every page, including failed requests.
- Fail closed when a required cost refresh is unavailable. Optional cache fields do not prove billing completeness.
- Never clear an unknown remote hold or a local reservation from error text. Only authoritative completion and valid usage can settle a charge. Explicit reconciliation remains a separate action.
- Preserve every legacy hold. Add a read-only historical audit that reports evidence and missing proof. Do not reset, reprice, or correct legacy rows in this repair.

## Alternatives

| Alternative | Decision | Cost |
| --- | --- | --- |
| Keep 1,024 configured tokens and change only the ledger | Reject | The model can still truncate valid output. |
| Change the model | Reject | It changes behavior, pricing, and evaluation scope. |
| Increase the batch size now | Reject | It does not prove the deadline or source-check capacity. |
| Publish best-effort partial JSON | Reject | The UI can show an unsupported claim. |
| Clear a reservation after an error string | Reject | The ledger can understate a paid or unknown invocation. |
| Use observed or local cost, whichever is larger | Reject | It silently assumes overlap that this system does not measure. |

## Implementation

1. Add `src/harness-invocation-policy.ts` and `src/regional-cost.ts`.
   - Put the model ID, route, output caps, maximum iterations, timeout, region, tier, context limit, and rate-policy version in one typed policy object.
   - Export pure helpers for request configuration, worst-case reservation, and valid usage settlement.
   - Set the initial 4,096-token output budget in the regional scan policy object.
   - Wire explicit policies through `src/main.ts`, `src/account-chat-service.ts`, `src/regional-app.ts`, and `src/agentcore-harness-client.ts`.
   - Make `scanMode` select the scan or regional-account-chat policy. Pass the same policy to the client and runtime wrapper.
   - Preserve verified legacy effective behavior with explicit 1,024 and 2,048 caps. Do not modify setup defaults, the harness configuration, or its validator.

2. Change `src/regional-runtime.ts` to use the policy module.
   - Remove separate output-budget and rate arithmetic from the runtime.
   - Reserve one worst-case amount before a remote submission.
   - Persist the policy version, region, tier, sent caps, timeout, and reservation inputs with each charge.
   - Settle a charge only once after exactly one complete authoritative usage record passes validation.
   - Keep a completed charge reserved when usage fields are missing, invalid, or contradictory.
   - Preserve `unknown_block`, `remote_until`, raw charge identifiers, and raw usage. Do not clear them from message text.
   - Add one explicit stream-outcome classifier: clean EOF with a final known stop; modeled SDK iterator exception with safe name and `$fault`; or transport, abort, deadline, and other unknown failure.
   - Preserve the hold and reservation for modeled iterator exceptions. Log only the safe name and `$fault`. Do not match error text or retain raw payload.
   - Derive the model hold from the actual policy timeout plus five seconds. Remove the magic 45-second and recovery 65-second values.
   - Clear a model execution hold only after clean EOF and a final known stop. An iterator exception, abort, missing EOF, or text match keeps the hold.
   - Await the wrapped iterator finalizer before the operation lock releases. Drain pending local settlement writes before release. Keep raw remote cleanup bounded. Preserve holds when remote cleanup remains uncertain.

3. Add a Cost Explorer cache and accounting record in `src/regional-runtime.ts` or a small local helper.
   - Use a one-hour key over account, query scope, date range, currency, refresh date, and active rate-policy version.
   - Use `--no-paginate` and handle `NextPageToken` in one explicit loop. Set `AWS_MAX_ATTEMPTS=1` for each Cost Explorer process. Do not use `||=`.
   - Bound the loop to 20 pages. Reject a repeated token. Apply the existing timeout and deadline to each page.
   - Recheck admission budget and persist the $0.01 request reservation before each actual page attempt. Record attempted request count, received page count, response timestamps, and failure status.
   - Count a failed refresh request in local cost accounting. Do not install a partial page set in the cache.
   - Refuse a paid invocation when the policy requires a refresh and the refresh fails.
   - Keep observed Cost Explorer cost plus local unsettled and settled ledger cost. Do not reduce either value by inference.
   - Keep cache, reserve, and settlement changes under the existing shared cloud-operation lock. Require an active owner for every mutation. Do not add a parallel scheduler.

4. Change the assessment path in `src/regional-app.ts` and `src/harness-tool-cycle.ts`.
   - Locate the existing response parser and validator that `runHarnessToolCycle` reaches.
   - Require compact schema-only output in its system and task instructions.
   - Classify only clean `end_turn` invalid JSON as a recoverable completion failure.
   - Start one fresh session for one repair request. Pass only the existing validated evidence and the original bounded task.
   - Use the same global tool cap, authorization path, source-fingerprint check, and scan deadline.
   - Record clean limit stops and defer the batch. Reject and defer after the one invalid-JSON retry. Do not merge fragments from two responses.

5. Add a read-only historical ledger audit.
   - Report legacy candidates by charge ID and the exact missing proof.
   - Preserve all legacy holds by default. Do not reprice or reset the ledger automatically.
   - Do not rewrite or delete historical ledger rows.

6. Extend compatible invocation records and user-visible scan traces only where the existing record exposes them.
   - Add optional `stop_reason`, `stream_complete`, `usage_status`, `metadata_event_count`, `policy_version`, and `reservation_inputs` fields to `RawInvocation`.
   - Keep the existing status enum. `completed` means the remote response ended. It does not mean the account result or billing data is valid.
   - Keep `RuntimeState` version 1 readable. Missing legacy proof retains the existing hold. Do not require a storage migration.
   - Add distinct trace states for response repair eligibility, limit outcome, modeled SDK exception, incomplete billing usage, Cost Explorer cache status, and admission refusal.
   - Keep terminal remote state distinct from charge settlement state.
   - Do not expose partial model JSON in scan publication.

7. Change `src/regional-scan-service.ts` to prevent a quarantine cascade.
   - Add one bounded availability wait before the next batch and before the final source check.
   - Permit the wait only when `remote_until`, the scan deadline, and cleanup reserve leave time for the required action.
   - Keep `unknown_block` blocked until explicit reconciliation. It is not a wait target.
   - Mark each still-pending account deferred once with one shared stop reason when the wait cannot fit or the hold remains. Finish partial without repeated failed-batch attempts.
   - Keep the existing final-source-check behavior. An unavailable final source check leaves consistency unknown.

## Test matrix

| Area | Required proof |
| --- | --- |
| Route policy | Each route sends its map values explicitly. The scan sends 4,096 at both levels. Legacy routes preserve their verified effective caps. |
| Unified output budget | The context guard and reservation use the same policy object. The 256,000 context guard remains separate from the 262,144 pricing upper bound. |
| Admission | A new invocation reserves its maximum cost before submission. |
| Settlement | The proposed local estimate policy settles after exactly one valid metadata event, clean EOF, and the final documented `messageStop`, including `tool_use`. A pre-EOF `tool_result` does not settle. This does not prove an AWS bill. |
| Incomplete usage | Missing optional cache fields settle as zero for this no-cache route. Missing core fields, unsafe integers, duplicate metadata, or unpriced nonzero cache fields keep the reservation. |
| Stream outcomes | A modeled RuntimeClientError-style iterator throw records only safe type and fault data, keeps the hold and reservation, and does not match text. Transport, abort, deadline, and EOF-only outcomes remain unknown. |
| Output repair | A clean `end_turn` invalid JSON result starts one fresh-session retry with identical evidence and a stricter concise instruction. |
| Retry limits | A clean token-limit stop defers the batch without retry. A second malformed response, remote error, timeout, source mismatch, or deadline exhaustion does not retry. |
| Publication | Partial JSON never reaches an assessment or scan record as a completed result. |
| Quarantine wait | One failed three-account batch waits once before later work and final source verification when time permits. A non-fitting wait defers each still-pending account once with one shared reason and records partial. |
| Cost Explorer cache | Equal account, scope, date, currency, refresh date, and rate policy reuse a result under one hour. Any key difference refreshes it. |
| Cost Explorer pages | The executor uses `--no-paginate`, one explicit retry setting, a 20-page limit, a repeated-token failure, and one persisted request cost per attempt. |
| Cost failure | A failed required refresh blocks the paid call. A failed attempted page counts exactly once. No partial page set enters the cache. |
| Serialization | A second mutation cannot interleave cache, reserve, or settlement changes with the existing operation owner. |
| Cost arithmetic | Observed and local values remain additive for unsettled, settled, and failed-request cases. |
| Historical audit | The report writes no file and preserves all legacy holds. It does not reset, reprice, or correct a legacy row. |
| Cleanup race | An abandoned stream, a throwing iterator, and a never-resolving raw cleanup drain or preserve local state before lock release. |
| Regression | Existing authorization, tool cap, source checks, batch size, deadline, and cap tests continue to pass. |
| Route tests | `tests/harness-invocation-policy.test.ts` covers every route. Update `tests/regional-runtime.test.ts`, `tests/harness-tool-cycle.test.ts`, `tests/regional-scan.test.ts`, and account-chat tests as required. |

## Delivery and rollback

1. Run focused unit tests for runtime, setup validation, harness output parsing, and scan publication.
2. Run the complete Bun test suite and `git diff --check`.
3. Run a local read-only ledger audit against a copied fixture only.
4. After implementation, run the simplify pass, then repeat affected tests before independent code review.
5. Run the README freshness check before any commit or push.
6. Run no paid browser scan during this plan-only task.
7. A later authorized canary first scans three accounts under the existing cap and declared maximum reservation. It observes request 4,096, model route, metadata count, and response validity.
8. A later bounded ten-minute browser run occurs only under existing authorization after the canary. It cannot prove all 278 accounts complete.
9. Deploy the regional override and runtime policy together because the output policy has one source of truth.
10. If a defect appears, restore the preceding application revision. Retain the ledger and any later audit record. Do not delete runtime state or clear holds during rollback.

## Platform sources

These primary sources support the stated managed-service behavior.

- [AgentCore InvokeHarness API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarness.html): verified model configuration and request output fields. The precedence is not specified.
- [Kimi K2.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k2-5.html): verified 16K output and 256K context limits.
- [AgentCore HarnessTokenUsage API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_HarnessTokenUsage.html): verified required usage fields and optional cache fields.
- [AgentCore HarnessMetadataEvent API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_HarnessMetadataEvent.html): verified invocation-wide metadata usage.
- [AgentCore stream output API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarnessStreamOutput.html): verified stream failures are not completion receipts.
- [AgentCore message-stop API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_HarnessMessageStopEvent.html) and [harness guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-get-started.html): verified stop values and multi-turn tool behavior.
- [AWS CLI retry configuration](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-retries.html): verified that the initial call counts toward `AWS_MAX_ATTEMPTS`. The value `1` permits one attempt.
- [AWS CLI Cost Explorer command](https://docs.aws.amazon.com/cli/latest/reference/ce/get-cost-and-usage.html): verified `--no-paginate`, `--next-page-token`, and exclusive end dates.
- [AWS Cost Explorer GetCostAndUsage](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_GetCostAndUsage.html) and [botocore paginator data](https://github.com/boto/botocore/blob/develop/botocore/data/ce/2017-10-25/paginators-1.json): the API permits a next token although current botocore defines no paginator. The bounded explicit loop remains fail closed.
- [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/): verified Kimi K2.5 standard US Region rates of $0.60 input and $3.00 output per million tokens. Priority and Flex use different rates.
- [AWS Cost Explorer pricing](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/): verified $0.01 per primary-view request. The current code has no billing-view ARN.
- [Cost Explorer API best practices](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-api-best-practices.html) and [Cost Explorer data freshness](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-exploring-data.html): verified that the observed value can lag billing events.

## Risks and limits

- A 4,096-token regional policy reserves $0.6782976 per four-iteration invocation. The prior value reserves $0.638976. This reduces admission capacity under the existing cap.
- A required Cost Explorer refresh can block work during an AWS outage. This is the fail-closed cost decision.
- One repair call can use more budget and deadline time. The one-retry bound prevents an unbounded loop.
- Historical data lacks proof for automatic repricing. The audit report prevents unsafe cleanup.
- The local ledger has 16 completed rows, 11 with usage and five without, plus one unknown row. Its current total is $11.062592 with cached observed cost of $0. A new $0.6782976 reservation gives $11.7408896 before one $0.01 refresh. This is local admission evidence, not an AWS bill or a promise that later calls fit.
- A local mock recorded 9,221 input and 760 output tokens against a $0.638976 hold. The token estimate is $0.0078126. This is not an AWS bill.
- The ledger cap guards only modeled invocation and Cost Explorer work. Runtime, Databricks, CloudWatch, and delayed Cost Explorer costs remain outside this complete-bill proof.

## Outside this repair

The ten-minute deadline and current source-check duration do not support a 93-batch complete scan. This plan does not change batch size, deadline, source-check design, or coverage policy. A separate execution decision must address full coverage.

## Review handoff

The independent plan review inspected the one-policy invariant, settlement proof, unknown-hold preservation, recovery eligibility, evidence reuse, Cost Explorer key, additive accounting, and legacy audit design.

The implementation review must inspect the final diff and tests. It must verify that no path publishes partial JSON or removes a hold from error text.

## Review record

The independent factual review used `claude-sonnet-5-5`. The independent judgment review used `claude-opus-5-5`. Internal support used `claude-haiku-5-5`. The verdict was `needs material revision`.

| Finding | Ruling | Plan action |
| --- | --- | --- |
| SDK stream exception shape | Partial | Add the three-outcome classifier. Keep holds and reservations for modeled iterator errors. |
| Billing settlement gate | Accept | Settle after clean EOF, one valid usage record, and the last documented stop. |
| Legacy holds must be reset or corrected | Dispute | Preserve every legacy hold. The corrected ledger evidence does not show permanent admission blockage. |
| Route policy drift | Accept | Add the explicit route policy map and shared typed policy. |
| Token-limit retry | Accept | Remove automatic token-limit retry. Keep one clean invalid-JSON retry. |
| Lock-release race | Accept | Drain local settlement writes before release. |
| Cost Explorer pagination | Partial | Keep the bounded explicit loop because the API permits a next token. |
| Deadline estimate | Partial | Label it check-only and include source checks, model time, batch reserve, fingerprint, and cleanup reserve. |
| README freshness | Accept | Add the required check before commit or push. |

The full review report is [available locally](/tmp/livenation-external-plan-review.P7HGnR/opus-review.txt). The host applied the accepted changes and recorded disputed assumptions with the cited sources. No second review runs for this revision.
