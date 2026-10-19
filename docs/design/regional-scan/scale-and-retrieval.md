# How the regional scan works

Status: teaching review. This page describes a proposed read-only design. No runtime work occurred.

The database gathers reliable facts. The agent investigates and judges. The server makes sure no account is lost.

Think of an analyst with one folder for each account. The database puts dated records into each folder. The agent reads a small set of folders and asks for more records only when they can change the next step. The server keeps the folder list and checks that every folder has an honest result.

A **model** reads and writes language. An **agent** is a model with task rules and controlled tools. The **server** is the program that enforces account scope and saves the results.

<!-- fig:rolesflow -->

## Start with the problem

A regional seller can have many accounts. Reading every raw event, ticket, activity, and inventory record would take too much space and hide useful facts. A model can help investigate, but it must not invent numbers or decide which accounts exist.

An **account** is a customer relationship. A **row** is one table record. An **activity** is a contact event, such as an email or call. A ticket use is a separate scan record. One account can have many rows. The scan must cover accounts, not merely count activities.

The database stores the source records. **SQL** is a query language that asks the database for selected facts. Bronze, Silver, and Gold are data layers: **Bronze** keeps source-shaped records, **Silver** cleans and links them, and **Gold** gives reviewed business summaries. The proposed scan reads narrow Gold summaries. It does not send all Silver rows to the model.

## What the system knows first

The **roster** is the approved account list. One SQL **query**, a request for facts, creates one compact summary for each authorized account. The server saves the result in a **ledger**, a durable list of account results and their evidence. This means the scan can resume after an interruption.

The observed October 19 measurement covered 278 accounts, 555 activities, and 9,999 Silver rows across 17 tables. It was a CA, OR, and WA benchmark. It was not an approved seller roster or a production performance test. The full measurement is in [the evidence file](scale-evidence-2026-10-19.json).

<!-- fig:summaryvsdetail -->

The server gives up to ten summaries to one model call. This small group is a **batch**. It sends no more than 16 KiB of summary text. A KiB is 1,024 bytes, so 16 KiB is a small text parcel. The existing tool response cap is 64 KiB, a larger parcel for a tool result. These caps keep one request readable and bounded. They do not promise speed.

With 278 accounts, ten accounts per model batch requires at least 28 batches. The ledger pages by 50 accounts for the application. An API is a way for programs to exchange a request and result. A result chunk is one piece of a large API result. Ledger pages are separate from model batches and result chunks. A detail query happens only when a summary cannot answer a material question.

## A concrete A100 example

These are observed facts for A100 Harbor Works:

- The contract is active through 2026-12-31.
- An email activity has the timestamp 2026-09-30. It has no body or direction.
- Three ticket uses exist for one Meridian Lights event.
- General Parking is included for E200.
- Premier Parking is not owned.
- A 2026-10-16 inventory snapshot records 12 Premier Parking units at $40.

These facts do not prove renewal risk, a preference for a future event, attendance plans, an email meaning, or that an item remains available. The 12 units at $40 are a dated snapshot, not an availability promise.

A possible future agent step is to recommend that the seller ask whether future attendance or travel would make parking useful. The read-only scan does not contact the customer. This is not a fact from the three ticket uses. Missing evidence can support `ask` or `deferred`. `no-action` needs evidence that no useful step exists now.

## How the agent judges a useful next step

| Part | Purpose and example |
| --- | --- |
| Skill | A written work rule. The judgment skill tells the agent to separate facts, inferences, and unknowns. |
| Tool | A controlled function that returns data. A fixed SQL tool can return contract dates. |
| MCP | A standard that connects an agent to tools. |
| Genie | Analytics that can answer a bounded natural-language question with generated SQL. |

An AgentCore **harness** runs agent and tool steps. A **trace** records the request path for inspection. A trace does not prove that the judgment was correct.

The agent first checks evidence strength and customer value. It then considers urgency, effort, and revenue only when the scan objective permits them. It compares a leading explanation with another reasonable explanation. It asks for a missing fact only when that fact could change the recommendation. This prevents a fixed SQL threshold from becoming a universal sales script.

The agent chooses what to investigate. It can choose a different path or wording even for the same facts. This nondeterministic behavior does not permit invented facts. SQL facts, server permissions, roster checks, and saved evidence remain reliable controls.

The current route sends questions to workspace-wide Genie One. The proposed route uses a curated Genie connection with its own approved context. The agent cannot submit arbitrary SQL. It calls a named tool. Fixed tools run reviewed queries. Genie generates a query for an allowed analytic question.

## How the scan finishes honestly

The server does not stop at a top N list. It retains the complete authorized roster. It checks every returned account ID, saves each valid batch, and records whether each account is assessed, deferred, or unavailable. A timeout marks remaining work as deferred. It never makes that result look complete.

<!-- fig:coverageoutcomes -->

The proposed 600-second scan budget and 120 business-call budget are ceilings. They are safety limits, not performance promises. A scan can finish with full roster coverage but partial assessment when some accounts are deferred or unavailable.

## A short guide to safe reuse

A **cache** is a saved copy that can make a repeated read faster. It does not prove access or freshness. The server checks access before it uses saved evidence. It keeps the source time and the time it served the copy.

The scan has application and Databricks reuse layers. Model prompt caching is a separate conditional layer. It remains unverified on this route. None saves a seller decision as fresh evidence. The scan refreshes live inventory before a later seller action. Read [the reliability practices](best-practices.md) before the technical notes.

## Technical notes

<!-- details:start:Exact measurements and controls -->

The single-query benchmark took 17,809 ms and returned 57,815 serialized bytes. The six-page keyset probe took 43,791 ms and returned 278 unique accounts. It matched the baseline rows. Both timings include CLI submission, polling, and retrieval. Cache state was not measured. Neither timing proves runtime scan performance or an SLA.

The measurement read Silver directly under the demo identity. The proposed Gold route with a restricted principal has no runtime measurement. The current fixed tools support A100 only and use the broad synthetic demo identity. Proposed seller-scoped permissions need separate verification.

The current Statements adapter rejects multi-chunk results. The proposed extension is not live. It verifies chunk index, offset, completeness, deadline, and bounded disk spooling. It follows no arbitrary next URL. A missing chunk produces partial coverage. Repeated SQL page queries can repeat database work. The proposed path reads one completed query result into the ledger. The server stores source references, units, cutoff, retrieval time, status, and source fingerprint with saved evidence.

A fingerprint includes relevant Delta table IDs and latest versions, Gold view definitions, skill hashes, and the scope configuration hash. A fingerprint change marks the scan mixed and requires a fresh comparison. UTF-8 size checks keep complete text and evidence together when the server splits a batch.

The proposed fairness formula reserves business calls across remaining batches: `min(12, floor(remaining_calls / remaining_batches))`. A zero allowance permits a summary assessment or an explicit deferral. It does not force a no-action result.

<!-- details:end -->

## Limits and open decisions

This page is a teaching explanation, not proof that the design runs end to end. The original plan keeps six open decisions: the curated Genie connector, scan objective, partial-card behavior, schedule cadence, versioned regional allowlist, and restricted query identity. Read [the full plan](/full) for the canonical technical design and [the source evidence](/source/scale-evidence) for exact observed data.

## Sources

- [Databricks statement result chunks](https://docs.databricks.com/api/workspace/statementexecution/getstatementresultchunkn)
- [Databricks query profile](https://docs.databricks.com/aws/en/sql/user/queries/query-profile)
- [Databricks query caching](https://docs.databricks.com/aws/en/sql/user/queries/query-caching)
- [Databricks Genie best practices](https://docs.databricks.com/aws/en/genie-agents/best-practices)
