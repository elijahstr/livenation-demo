# Regional scan, account detail, and account chat

Status: implemented and verified, Tier 1. All six decisions are settled. Both external reviews completed. Material findings are resolved.

## Goal

Build one seller flow. The seller starts a bounded regional scan, opens any authorized account, and chats about that account.

The flow reports honest coverage. It does not invent evidence, progress, recommendations, or successful tool calls.

<!-- fig:regional-account-flow -->

## Scope

The server reads synthetic Gold and Silver data. It does not write database records, send messages, create holds, or purchase inventory.

The scan covers every account in the approved versioned roster. Every account stays visible, even without a recommendation.

The approved Premium sales prototype supplies the interface language. The current recovery flow stays unchanged.

## Verified facts

- The current scan design supports server-owned roster coverage, fixed evidence, bounded analytics, and a local JSON ledger.
- The current configuration uses Kimi, one concurrent request, zero retries, and a 2,048-token output limit.
- The source snapshot is frozen on 2026-10-16. A source refresh schedule is not approved.
- Existing fixed account tools support A100. The implementation must extend authorization through the approved roster.
- The current plan records a Genie route, but it does not prove a generate-only execution mode.

## Locked decisions

- Replace Genie in this new flow with server-scoped analytics. Retain the current Genie chat, model, and permissions outside this flow.
- Retain the current broad demo identity for read-only synthetic queries. The server enforces account and venue scope.
- Rank useful seller actions today above a revenue-only objective.
- Publish progressive cards only after one whole validated batch commits atomically.
- Provide manual scans only. Do not add a scheduler until the source refresh schedule exists.
- Keep a scan under 600 seconds and each batch under 180 seconds.
- Keep a scan under 120 business calls. Each batch gets at most the smaller of 12 calls and its fair remaining share.
- Start each scan with batches of three accounts. Keep this size for the first implementation. A truncated batch defers without a split retry.
- Keep independent session context for each batch. Do not append prior batches into one conversation.
- Keep model, concurrency, retry, and output limits unchanged. Do not relax cost controls.
- Acquire one global operation lock for scan, chat, and detail work across the legacy server.
- Count cache hits as tool calls. Do not retry a submission with an unknown result.
- Use only `get_account_evidence`, `find_options`, and `ask_analytics` as seller-agent tools.
- Do not add a hold, send, purchase, or customer-message tool.

## Open questions

No user decision remains open. Live verification passed with honest partial assessment coverage.

## Architecture

The server owns the roster, authorization, scope hash, operation deadline, coverage state, and persisted scan ledger.

The per-batch tool-call ceiling is `min(12, floor(remaining_calls / remaining_batches))`. A batch with no remaining tool budget defers its accounts.

Business calls mean model-requested tool calls, including cache hits. Model invocations and poll requests count separately under deadline and cost controls.

The approved versioned allowlist contains 278 account and venue ID pairs. It labels 94 California accounts as Northern California by explicit user assignment on 2026-10-20.

The same allowlist contains 92 Oregon accounts and 92 Washington accounts. The service never infers territory from state data.

Implementation generates the exact versioned ID list from the approved roster snapshot. No live source can alter that list during a scan.

The ledger lives in an atomically written JSON file under the existing local output path. It records each account outcome and source fingerprint.

One reviewed summary `SELECT` reads the scoped accounts. It binds account IDs and permitted venue IDs as parameters.

Completed statement chunks may support this query. The adapter keeps existing limits of 1,000 rows and 1 MiB.

The summary reads current Gold and Silver projections for identity, activity, relationship, and benefits. It needs no schema or data write.

Each account remains in the roster view. A missing recommendation must show an explicit unavailable, deferred, or no-action explanation.

Each route verifies identity and scope before it returns data or invokes a tool.

The recommended analytics design retains the `ask_analytics` name. The agent selects a dataset, metric, aggregation, group-by, and typed optional filters.

The dataset enum is activity, purchases, benefits, or attendance. Filters can constrain typed time, event, and product values.

The server compiles approved query templates. It injects authorized account and venue scope before every execution.

Activity templates support counts and latest activity by activity type. Purchase templates support net amounts and qualifying tickets by event or product.

Attendance templates support historical distinct ticket uses by event or artist. This result is historical use, not net demand.

Benefit templates support included quantity and qualifying `purchased_line_count` by event or product. The tool accepts no free identifier or function.

The server rejects model SQL. The result has at most 50 rows and 64 KiB. It returns the question, choices, compiled SQL, query ID, rows, and source units.

Unsupported analysis returns unavailable. It does not become a fixed final sales recommendation.

The server validates every model result as one complete batch. It rejects missing, duplicate, extra, or unauthorized account IDs.

The server commits the valid batch before it publishes cards. A rejected batch publishes no partial card set.

The service computes full coverage only when every account is assessed and every fingerprint remains stable. Deferred and unavailable outcomes make the scan partial.

The scan stores the full authorized roster before model work. A live snapshot lists assessed, deferred, unavailable, and in-progress counts.

One shared cloud-operation lock covers legacy and Premium scan, detail, and chat calls. It never permits parallel paid work.

A background scan owns the lock. Navigation reads committed ledger summaries during a scan without a `409` response.

New database detail reads use the lock only when no persisted summary exists. New chat calls return useful `409` busy responses.

After a scan completes, live detail and chat calls use the same lock. Account navigation never aborts a server-owned scan.

The ledger marks unfinished batches deferred after a process crash. Resume is valid only when scope, source, and original deadline still match.

Otherwise, the service starts a new scan. It never joins results from different source fingerprints.

The service fingerprints only tables, views, and skills that the summary query and approved templates read. It records Delta table IDs and versions, Gold definition hashes, scope hash, and skill hashes.

The service checks this fingerprint before start, each batch commit, end, and resume. A batch commits only when its publish check matches.

Fingerprint reads cover 13 tables and three Gold definitions. The service assigns an explicit fingerprint time budget and records measured timing during the live run.

The current probe measured 2,007 ms for `DESCRIBE DETAIL`, 2,275 ms for `DESCRIBE HISTORY`, and 2,046 ms for `SHOW CREATE TABLE`.

These measurements do not prove a full-fingerprint service-level time. A 17-table and five-view extrapolation is about 83 seconds per full check.

Before a new batch, the runtime reserves the latest measured final-fingerprint duration plus cleanup time. It defers the batch when the remaining deadline cannot complete that final check.

The service stops honestly when fingerprint work would consume the deadline reserve. It never bypasses a fingerprint check to publish a result.

A changed fingerprint stops publication and marks the scan mixed. `retrieved_at` and `served_at` stay separate from the source timestamp.

The in-scan evidence cache stores only validated fixed evidence. It has at most two entries per account and at most 1 MiB total.

Each key includes identity, scope, source, tool, schema, arguments, and cutoff.

The service authorizes every cache access. It bounds entry count and bytes, coalesces in-flight reads, and never stores errors.

The server returns explicit envelopes for absent data, unavailable data, errors, and truncation. It does not map any of these states to zero.

A known read timeout or database failure returns an unavailable envelope. An abort propagates. An ambiguous remote submission quarantines the operation and stops further work.

The ledger persists `remote_until` before each remote invocation or submission. A restart honors it through the maximum duration and cleanup reserve.

The lock uses file ownership across processes. An unknown remote outcome retains its quarantine through `remote_until`.

The next scan orders accounts with deferred or unavailable outcomes from the newest same-scope and same-source scan first. It then uses stable roster order.

This order never reuses a prior judgment. The current scan creates every assessment again.

## Account detail and chat isolation

The detail route accepts any authorized roster account. It returns identity, relationship, activity, benefits, scan result, and an unknown explanation.

During a scan, detail routes serve persisted summary fields. Missing fields show unavailable. New detail reads use the lock only when no persisted summary exists.

The chat server binds each session to account, scope, source version, actor identity, and one runtime session ID.

The URL account must match stored session state. The server rejects session reuse across accounts or actors.

Each chat turn can retrieve live further evidence. The citation panel uses server-provided tool provenance.

Each turn receives a tools override with an account enum containing only the bound account ID. The system prompt includes the trusted bound account.

The invoker allows only the three named tools and their qualified forms. It never uses a wildcard allowed-tool value.

Every handler closes over the validated session scope and checks account authorization again before it reads data.

The client stores detail and chat state in a `Map` keyed by account ID. A captured request identity and generation rejects late events for another account.

The server session binding remains the authority. Client state prevents incorrect rendering after a fast account switch.

`POST /api/premium/scans` starts a scan and returns its ID. `GET /api/premium/scans/:id` polls the actual ledger.

`GET /api/premium/accounts/:id` returns scoped account detail. `POST /api/premium/accounts/:id/sessions` creates a bound session.

`POST /api/premium/accounts/:id/chat` sends one bound chat turn. `/premium?scan=:id&account=:id` preserves scan identity and back navigation.

An expired session shows a clear conversation-expired message. The client creates a new session for the same account and never resends a paid message automatically.

## Implementation tasks

1. Add `src/regional-scope.ts`. Load the approved 278-pair scope map and enforce account and venue authorization.
2. Add `src/regional-data.ts`. Own projections, summary SQL, source fingerprints, and approved analytics templates.
3. Add `src/regional-scan-service.ts`. Own atomic JSON ledger writes, coverage, recovery, and batch publication.
4. Add `src/regional-runtime.ts`. Own the shared lock, persisted `remote_until`, deadlines, call budgeting, prompt bounds, cost admission, and usage collection.
5. Add `src/account-chat-service.ts`. Bind account, scope, actor, source state, and runtime session IDs.
6. Wire routes and services in `src/main.ts` and `src/server.ts`. Add the scan, poll, detail, session, and chat endpoints.
7. Extend the existing tool cycle. Record aggregate and raw usage callbacks plus context byte and token reservations.
8. Build `public/premium.html`, `public/premium.css`, and `public/premium.js`. Render scan progress, coverage, evidence, source dates, unknowns, actions, and useful error states.
9. Store client states in an account-keyed `Map`. Preserve scan results and reject late request events after account changes.
10. Add focused tests. Run a simplify pass. Update the guide and README only after live proof confirms behavior.

11. Add admission cost guards and raw usage collection. Record usage for every invocation, including failures, with an exact price date.

## Acceptance criteria

- Every approved roster account receives an assessed, deferred, or unavailable outcome.
- The scan shows partial status whenever coverage or source consistency is incomplete.
- Every authorized account opens a detail view, including accounts without a recommendation.
- Account chat never reads or displays another account session or late response.
- Fixed evidence has reviewed provenance. Analytics use server-compiled SQL and enforced account and venue scope.
- Source changes stop publication. Resume never mixes source, scope, or deadline state.
- The shared cloud-operation lock permits no parallel paid operation. Navigation does not cancel a server-owned scan.
- The interface has no invented progress, evidence, tool success, recommendation, or source date.
- Existing recovery behavior remains unchanged.

## Verification plan

Run focused tests for scope and conversation isolation, scan coverage, honest partial outcomes, and material implementation defects.

The runtime allows 600 seconds for fingerprint, SQL, model, and cleanup work. It reserves five seconds before the deadline.

Each batch lasts at most 180 seconds. Each Harness invocation lasts at most 40 seconds and uses 2,048 maximum output tokens, one concurrency slot, and zero retries.

Each prompt body uses at most 64 KiB, including supplied tool results. The service uses UTF-8 byte bounds and explicit hidden-runtime headroom.

The service reserves the full 256 KiB model context plus 2,048 output tokens for every Harness iteration. It multiplies this reservation by the maximum allowed Harness iterations.

The service logs observed calibration. It does not assume four characters per token or tokenizer support.

Cost admission requires Cost Explorer accrued cost, locally accrued reservations, and the next worst-case reservation to remain below $13.

The persistent local spend ledger covers scans and chats. Double counting is acceptable because it prevents daily Cost Explorer lag from understating spend.

The service retains a $5 reserve, stops at $15, and stays below the $20 cost cap. It blocks paid calls when Cost Explorer is unavailable.

Missing paid-invocation usage is unknown. It retains the upper-bound reservation until complete usage proof replaces it.

The service persists raw usage after every invocation, including failures. It records database profile bytes and queue time only when available.

The verified primary Kimi price is $0.60 input and $3.00 output per million tokens in us-east-1 Standard on 2026-10-20. Databricks billing remains unavailable.

Run existing Bun tests and `git diff --check`. Do not add an exhaustive user-interface suite.

Use Chrome DevTools at desktop and mobile widths. Run one bounded scan after implementation and required reviews finish.

Open at least three accounts, including one account other than A100. Run follow-up chats on at least two accounts and verify conversation separation.

Record measured scan coverage, elapsed time, model usage, and cost measurements. Label unavailable metrics as unavailable.

Update the consolidated guide and README only after browser-to-server-to-Databricks-to-AgentCore proof exists.

## Review and delivery

Obtain an independent Sonnet factual review and Opus plan review before implementation. The reviewers must report evidence and unresolved blockers.

Delegate routine implementation and tests to Terra after the plan review. Keep integration, security decisions, and final verification with the main agent.

Run a simplify pass after tests pass. Re-run affected checks, then obtain independent Sonnet and Opus final-diff reviews.

Check related open issues before a ready-for-review pull request. Add a `Read closely` line for scope enforcement, atomic publication, and account binding.

Merge only after required checks, both reviews, and live verification finish. Verify the default branch after the merge.

## Plan review ledger

Sonnet factual context used `claude-sonnet-5-5`. Opus independent judgment used `claude-opus-5-5`. Auxiliary CLI metadata used `claude-haiku-5-5`.

The verdict was needs material revision. No fallback reviewer ran. No second review loop is required.

- The plan retains per-batch fingerprint checks. It limits checks to relevant objects, measures time, reserves final-check time, and reports honest partial coverage.
- The scan prioritizes deferred or unavailable accounts from the newest matching scan. It never reuses prior assessments.
- A persistent spend ledger and conservative reservations protect against Cost Explorer daily lag and unknown usage.
- The first implementation uses three-account batches. A truncated batch defers without retry.
- Persisted remote work and a file-owned lock preserve the concurrency limit after a process restart.
- Detail routes serve persisted summary fields during scans. Chat remains subject to the shared lock.
- Per-turn tool overrides, explicit allowed tools, bound system prompts, and scoped handlers protect account isolation.
- Known read failures return unavailable envelopes. Ambiguous submissions quarantine work. Expired sessions require a new same-account session.
- Typed template enums and parameter validation reject free SQL identifiers and functions.

The pre-change baseline passed 237 tests with zero failures and 833 expectations. This result does not verify the proposed implementation.

## Sources and verification status

- [Existing regional scan guide](../design/regional-scan/guide.md) supplies the current design baseline.
- [Architecture decisions](../design/regional-scan/architecture-decisions.md) supplies the decision record.
- [Retrieval contracts](../design/regional-scan/retrieval-contracts.md) supplies the envelope and evidence contract.
- [Genie start conversation API](https://docs.databricks.com/api/genie/v1/genie-start-conversation) has no generate-only control. It is unsuitable for preexecution scope validation.
- [AgentCore InvokeHarness API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarness.html) supports actor ID, session, tools, and token controls.
- [Delta history](https://docs.databricks.com/aws/en/tables/history), [view definitions](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-aux-show-create-table), and [statement chunks](https://docs.databricks.com/api/statement-execution/v1/get-result-data) remain the verified source controls.

## Final code review record

Sonnet 5.5 collected repository facts. Opus 5.5 reviewed the complete staged diff. Its verdict was `request changes`.

The CLI also reported an auxiliary Haiku 5.5 model. It did not act as an independent reviewer. No reviewer fallback occurred.

The main agent accepted the findings and applied these corrections:

1. Successful empty results now differ from unavailable and failed evidence. Contacts have a separate section from contracts.
2. Each batch reserves time for its publication check. An unavailable check preserves earlier assessments as historical evidence. A changed hash still marks them mixed.
3. A statement submission finishes within its own timeout after a client disconnect. The server then cancels the known statement ID. Genuine unknown outcomes remain blocked until reconciliation.
4. Model and statement quarantine states are separate. Each new remote operation checks them, including calls inside an existing scan.
5. Cost Explorer request fees enter the local ledger. Missing cache metrics retain the conservative model reservation. The live preflight records remaining capacity.
6. Section quotas retain identity first and keep the total response within 50 records. Only complete sections receive citable evidence IDs.
7. The scan prompt permits at most one tool request per response.
8. Cache hits recheck authorization and bind to the last verified source. The required live check still precedes publication.
9. Input validators use a dedicated error type. Source failures return unavailable evidence instead of blaming model input.
10. Scan registration precedes persistence, so status polls cannot mistake a new scan for a process crash.
11. A failed write does not poison the future write queue. Tool-budget reservations await persistence before retrieval.
12. The current implementation checks 13 source tables and three Gold definitions. Busy requests receive 409. Documentation separates implementation from live proof.

The review also identified inclusive end-date behavior. Timestamp filters now use an exclusive next-day boundary.

The main agent corrected a deadline race after the cost check. A late cost response cannot start a model call after the deadline.

The final local suite passed 268 tests with zero failures. The earlier empty-result expectation asserted the defect; its correction does not weaken a safety check.

Source checks for the rulings:

- [Optional Harness cache fields](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_HarnessTokenUsage.html)
- [Cost Explorer API price](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/)
- [Databricks next-day date boundary](https://docs.databricks.com/aws/en/sql/language-manual/functions/date_add)

Live browser verification passed on October 20, 2026. The scan assessed 12 accounts and deferred 266 in 448.989 seconds. All 278 accounts remained available.

A100 and SC0001-A each completed live evidence retrieval and an analytics follow-up. Their conversations remained separate after account switches. Five account views and both desktop and mobile sizes passed inspection.

The main agent corrected the partial notice in account views after the browser check. Agent reasons now appear as hypotheses beside the source limitations. These presentation corrections passed the final browser check.

See the [live verification record](../design/regional-scan/live-verification-2026-10-20.json) for measured usage, costs, coverage, query IDs, and browser evidence.
