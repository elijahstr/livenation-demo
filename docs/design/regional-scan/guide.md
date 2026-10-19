# Regional scan guide

## Start here

The regional scan is a **proposed**, read-only way to help a seller review an approved account list. It is not a deployed workflow. Think of it as a careful clerk with a folder for each account: the database places dated facts in each folder, an agent reads a small group of folders, and the server checks that every folder has an honest recorded outcome.

An **account** is a customer relationship. An **activity** is a contact event, such as an email or call. A **row** is one database record. The **roster** is the approved list of accounts to assess. A **model** writes and reads language. An **agent** is a model with written rules and controlled tools. The **server** is the program that keeps the roster, access checks, and saved results.

The October 19 benchmark observed **278 accounts, 555 activities, and 9,999 Silver rows across 17 tables**. **Silver** is the cleaned and linked data layer. **Gold** is the reviewed business-summary layer. The benchmark covered California, Oregon, and Washington. It is a measurement, not an approved Northern California roster and not a production performance result. The data is synthetic. The proposed demo roster still needs its versioned allowlist.

**Current status:** Premium chat has fixed A100 evidence tools and one workspace-wide Genie analytics tool through a local bridge. The scan, its roster control, its ledger, and its UI integration remain proposed. The scan makes no business write. It cannot hold inventory, send a message, release an offer, or spend money.

<!-- fig:rolesflow -->

## How it works

The database supplies facts. SQL, a language for database questions, creates one compact summary for every authorized account. The server saves the summaries and their evidence identifiers in a **ledger**, a durable result list. It then gives no more than ten summaries to one model call. A detail request happens only when it can change the next seller step.

This separates evidence from judgment. The database can state a date, quantity, or benefit. The agent can assess whether the evidence supports `act`, `ask`, or `no-action`. It checks evidence strength, customer value, urgency, and effort, then considers revenue only when the scan objective permits it. It compares reasonable explanations and records unknowns. It cannot convert a missing fact into a negative fact. The server validates every returned account identifier and calculates coverage itself.

A **skill** is a written work rule. A **tool** is a controlled data function. **MCP** is a standard that connects an agent to tools. An AgentCore **harness** runs agent and tool steps. Fixed tools return reviewed facts. The agent uses adaptive investigation only for questions that can change the seller step.

<!-- fig:summaryvsdetail -->

Harbor Works, account `A100`, shows the boundary. Its active contract ends on 2026-12-31. One email has a timestamp but no body or direction. Three ticket uses exist for one Meridian Lights event. General Parking is included for E200. Premier Parking is absent. A dated October 16 snapshot records 12 Premier Parking units at $40.

Those facts do not prove customer intent, future attendance, travel plans, email meaning, renewal risk, or present inventory availability. A useful seller step can be: ask whether future attendance or travel makes parking useful. It cannot promise a hold. The later seller action refreshes inventory first.

## Reliability

The server owns the coverage promise. It retains the full authorized roster and records every account as assessed, deferred, or unavailable. A timeout leaves remaining accounts deferred. A scan can finish processing yet remain **partial**. The page must never present that result as complete.

<!-- fig:coverageoutcomes -->

A **cache** is a saved copy. It may avoid duplicate work, but it does not prove access or freshness. The proposed application cache reuses only complete validated fixed-tool evidence inside one scan. It checks authorization before each protected use. It saves the business cutoff, source observation time, original retrieval time, and cache service time. It never reuses live inventory across scans or treats an error as a fact.

Databricks can reuse query results and files, but that does not replace seller authorization or freshness checks. The proposed retrieval uses one parameterized, scoped summary statement and its completed result chunks. It does not use offset pages as a claim of bounded database work. The existing Gold objects are ordinary views. This design adds no manual optimization or warehouse change.

The repository selects Kimi on `converse_stream`, but that does not prove a live scan runtime. Keep the route until identical held-out cases pass fact, scope, coverage, unknown-handling, latency, and measured-cost checks. Prompt caching remains conditional until the exact route supports it and an observed cache read confirms it. Model input caching never becomes current seller evidence.

## Decisions

The design has six open decisions. Each card gives the recommendation and its cost. These selections only create a readable note for review. They do not change the design or submit anything.

<!-- decisions -->

## Reference

The closed sections below keep the technical record on this page. They include the full implementation plan, contracts, skills, prompt, Genie context, evaluation material, and source proof. The embedded JSON sections are readable here. The server also preserves raw developer downloads at `/source/*`.

<!-- details:start:Exact measurements and scan controls -->

The single-query benchmark took 17,809 ms and returned 57,815 serialized bytes. The six-page keyset probe took 43,791 ms and returned 278 unique accounts. It matched the baseline rows. Both timings include CLI submission, polling, and retrieval. Cache state was not measured. Neither timing proves runtime scan performance or an SLA.

The measurement read Silver directly under the demo identity. The proposed Gold route with a restricted principal has no runtime measurement. The current fixed tools support A100 only and use the broad synthetic demo identity. Proposed seller-scoped permissions need separate verification.

The current Statements adapter rejects multi-chunk results. The proposed extension verifies chunk index, offset, completeness, deadline, and bounded disk spooling. It follows no arbitrary next URL. A missing chunk produces partial coverage. The proposed path reads one completed query result into the ledger. The server stores source references, units, cutoff, retrieval time, status, and source fingerprint with saved evidence.

A fingerprint includes relevant Delta table IDs and latest versions, Gold view definitions, skill hashes, and the scope configuration hash. A fingerprint change marks the scan mixed and requires a fresh comparison. UTF-8 size checks keep complete text and evidence together when the server splits a batch.

The proposed fairness formula reserves business calls across remaining batches: `min(12, floor(remaining_calls / remaining_batches))`. A zero allowance permits a summary assessment or explicit deferral. It does not force a no-action result.

<!-- details:end -->

<!-- details:start:Reliability practices and source proof -->

### Regional scan reliability practices

Date checked: 2026-10-19. Status: design guidance. The scan is read-only and unbuilt.

The scan treats a cache as a fast copy. It does not treat a cache as proof of access or freshness. The server checks access before every protected cache read. It records the source time and the time it served a saved copy.

## Practice status

| Practice | Why | Current status |
| --- | --- | --- |
| Reuse completed account evidence within one scan. | It prevents duplicate database work. | **Proposed.** The server owns this cache. |
| Reuse `brief` and `options` during one fixed-tool handler set. | It avoids duplicate current-chat reads. | **Existing.** `src/premium-tools.ts` keeps a per-turn promise map. |
| Coalesce identical in-flight evidence requests. | It prevents duplicate submissions during a request burst. | **Proposed.** No Redis or new service is required. |
| Read one scoped SQL summary statement, then consume result chunks. | A result-row limit does not alone prove bounded SQL work. | **Proposed.** The existing Gold objects are ordinary views. |
| Keep Kimi until an evaluation passes. | A low token price does not prove a safe seller result. | **Proposed.** Repository configuration only. |
| Use model prompt caching after route support and observed reads. | A provider cache does not save completed scan evidence. | **Conditional.** Kimi cache behavior and Harness wiring are unverified. |

## Three caches have different jobs

The application evidence cache belongs to this server. It can reuse one complete, validated fixed-tool evidence result during one scan. It does not cache adaptive Genie answers by natural-language question text. Its key includes trusted workspace, principal and authorization version, seller-roster scope hash, tool or query and schema version, normalized arguments, cutoff, and source fingerprint. These key fields are this design's choices. The server authorizes the caller before every protected hit. This follows guidance to authorize before lookup and scope every result attribute. [OWASP multi-tenant security guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)

An evidence entry retains `data_as_of`, the semantic cutoff, and `observed_at`, the source or snapshot time. It retains original `retrieved_at` and adds proposed cache-ledger `served_at`. The server reuses only complete, validated evidence. A failed, stale, truncated, or mixed result never becomes an empty fact. The server rejects reuse when a current check detects a changed source or authorization. A changed fingerprint stops publication. A time limit is not proof that the source stayed fresh.

The entry expires no later than the scan deadline and policy maximum age. This expiry rule and the entry and byte limits are proposed design controls. A failure cooldown, if used, has a separate state from evidence. It must never store an error as a fact. Durable audit records can outlive a cache entry, but they are not fresh data. AWS describes expiry, cache-off tests, and request coalescing as useful cache practices. [AWS caching strategies](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/)

Databricks reuses query results and files as provider caches. The application still checks its own seller permissions and business freshness. The vendor page does not describe these caches as application authorization or seller-scope controls. [Databricks query caching](https://docs.databricks.com/aws/en/sql/user/queries/query-caching)

Prompt-prefix caching belongs to the model provider. It can reuse model input only when the exact model, API route, and Harness request support it. It does not store a seller answer, conversation memory, or scan ledger. AWS's explicit-cache table omits Kimi. The Kimi model card does not establish a cache type. Harness has no first-class cache checkpoint field. Keep prompt caching conditional until exact route support and an observed cache read prove it. Do not treat that as permanent non-support. Keep stable tools, system instructions, and skills before variable account facts. [AWS prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html) [Kimi K2.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k2-5.html) [AWS InvokeHarness](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarness.html)

## Freshness and recommendation safety

The design has no cross-scan cache for live inventory. A later seller action refreshes inventory first. The server reuses committed judgment only inside the same scan and unchanged configuration during resume. It does not cache recommendations across scans.

The source fingerprint binds relevant Delta versions, Gold view definitions, skills, and scope configuration. A source change stops comparison and invalidates affected evidence. The result can remain audit history, but it cannot support a current claim.

## Databricks retrieval

The scan runs one parameterized, scoped summary statement. It consumes chunks from that completed statement. It does not issue offset pages for the same summary. This design infers that a result-row limit does not prove bounded read work. Databricks defines `LIMIT` as a maximum result-row count and says skipped `OFFSET` rows still get processed. [Databricks statement execution](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial) [Databricks query syntax](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-query)

Profile the actual statement before a performance decision. Record queue or cold-start time, execution time, result fetch time, actual bytes read, joins, cache behavior, and result size. Databricks Query Profile shows operators and metrics for this work. [Databricks Query Profile](https://docs.databricks.com/aws/en/sql/user/queries/query-profile) The observed 17.809-second and 43.791-second measurements include CLI submission and retrieval. Their cache state is unknown. They are not end-to-end scan times or a service target.

The current Gold assets are ordinary views over curated data. Predictive optimization, when it applies, operates on managed tables below these views. This design adds no manual `OPTIMIZE`, `ANALYZE`, or `VACUUM`. It makes no warehouse or auto-stop configuration change. Cold starts and queue time remain measurement inputs. [Databricks predictive optimization](https://docs.databricks.com/aws/en/optimizations/predictive-optimization) [Databricks warehouse configuration](https://docs.databricks.com/aws/en/compute/sql-warehouse/create)

Use a curated scoped identity and parameterized statements. Keep Genie narrow, with seller metrics, examples, and benchmarks. Databricks recommends simple datasets, documented semantics, and example SQL. A workspace-wide Genie route is not automatically unsafe because it is broad. Its scope and permissions still need verification. [Databricks Genie best practices](https://docs.databricks.com/aws/en/genie-agents/best-practices)

## Model selection and prompt limits

The repository configuration selects `moonshotai.kimi-k2.5` on `converse_stream`. This does not prove a live regional-scan runtime. The design makes no automatic provider change.

Choose a route from representative held-out cases. Include ambiguity, refunds, missing or stale evidence, owned products, and prompt injection. Compare seller quality, scope control, evidence coverage, unknown handling, total workflow latency, and measured cost. Select a smaller or cheaper route only after it passes critical fact, scope, and coverage gates. SQL supplies counts. It does not create a deterministic priority prefilter that removes model assessment.

Keep independent batch contexts bounded. Do not append every earlier account batch into one conversation. Reuse stable instructions, send only relevant batch evidence, and resume from the ledger. Conversation memory is not a substitute for fresh tool facts.

Use input, output, and remaining-headroom budgets in addition to byte limits. Use conservative calibrated estimates and observed usage. Do not assume four characters equal one token. The Kimi model card lists `Count tokens` as unsupported. [Kimi K2.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k2-5.html)

The local create-time file sets a nested 1,024-token value and a top-level 2,048-token value. The current Premium invocation requests 2,048 tokens. The live effective value and output sufficiency for a ten-account result are unverified. They need a truncation test before scan readiness. `maxTokens` limits one model call. It does not limit all calls in a Harness run. Record aggregate use across all calls. [AWS InvokeHarness](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarness.html)

AWS `InvokeHarness` can return input, output, cache-read, cache-write, and latency values. A missing cache value is `unknown`, not zero. For cache-enabled Converse only, AWS defines total input as `inputTokens + cacheReadInputTokens + cacheWriteInputTokens`. Do not apply this formula to Harness, Responses, or an already aggregated `totalTokens` field without mapping and aggregation verification. Capture raw usage, API route, and model. Use model-specific separate rates with a price date. Cache benefit and cost savings remain conditional until exact route support, request wiring, and a measured cache read prove them. [AWS prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html) [AWS Harness token usage](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_HarnessTokenUsage.html)

## Bounded work and evidence

Use up to two workers only after isolated batch contexts, atomic global budget reservation, and serialized ledger writes exist. Use a rate-aware queue. Give one layer ownership of each retry. Apply exponential backoff with jitter only within the remaining whole-scan deadline and cleanup reserve. When an ambiguous statement or Genie submission returns no statement or conversation ID, record the attempt as unknown and defer affected work. Do not resubmit it in the same scan. Reconcile only an attempt with a returned ID. The worker count is a proposed design choice. AWS documents backoff and jitter to reduce retry storms. [AWS timeout, retries, and backoff](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

The proposed 120-business-call budget counts model-requested tools. Cache hits still count, to prevent loops. It does not count every SQL poll, cache lookup, or model call. The scan records and separately bounds provider attempts, polls, and model tokens. They share the same whole-scan deadline and cleanup reserve. It adds no numeric quota before measurement.

The scan records each cache layer as hit, miss, or unknown. It records SQL statement, queue, run, and fetch times; model input, output, and cache tokens when present; calls, retries, wall time, estimated cost with price date, coverage, and grounding quality. Cache-disabled, cold, warm, and repeated synthetic-account volume tests are planned evaluation cases. Repeated accounts test volume, not judgment variety. They are not completed measurements.

## Required evaluation cases

- An authorization change causes a cache miss or denial.
- A source change invalidates evidence.
- A cache miss does not create a failure storm.
- Identical in-flight requests create one source submission.
- Cold and warm runs preserve facts and coverage. Creative wording can differ.
- The record distinguishes source freshness from retrieval time.
- A model candidate passes the same held-out safety and quality cases before selection.

## Sources

- [AWS caching strategies](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/)
- [AWS timeout, retries, and backoff](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [OWASP multi-tenant security guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- [Databricks query caching](https://docs.databricks.com/aws/en/sql/user/queries/query-caching)
- [AWS prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)

<!-- details:end -->

## Sources

- [Scale evidence](scale-evidence-2026-10-19.json)
- [Databricks statement result chunks](https://docs.databricks.com/api/workspace/statementexecution/getstatementresultchunkn)
- [Databricks query profile](https://docs.databricks.com/aws/en/sql/user/queries/query-profile)
- [Databricks query caching](https://docs.databricks.com/aws/en/sql/user/queries/query-caching)
- [Databricks Genie best practices](https://docs.databricks.com/aws/en/genie-agents/best-practices)
