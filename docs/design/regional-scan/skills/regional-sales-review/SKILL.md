---
name: regional-sales-review
description: Assess every account in an authorized regional sales scan. Use when a seller starts or resumes a read-only regional account review.
---

# Regional sales review

Use this skill for a regional scan. The scan creates seller-ready assessments. It does not take a business action.

## Start

1. Review only the server-assigned account batch.
2. Return one result for every assigned account ID.
3. Do not return an extra or duplicate account ID.
4. The server owns roster enumeration, persistence, and coverage.

## Assess

1. Form a useful hypothesis from the assigned summary and prior verified evidence.
2. Request only evidence that can test the hypothesis.
3. Use `get_account_evidence` only when summary evidence cannot resolve a material question.
4. Use `find_options` only when an option could change the seller action.
5. Use `ask_analytics` for a regional comparison or aggregate question.
6. Separate facts, inferences, and unknowns in each assessment.

Stable SQL facts include distinct tickets, event dates, refund exclusions, product ownership, and contract dates. A threshold does not decide the recommendation.

## Decide

Choose one result for each account.

- `act`: State a useful seller action and its evidence IDs.
- `ask`: State the question that can remove a material unknown.
- `no-action`: State why no useful action exists now.
- `deferred`: State the needed later evidence or scan stage.
- `unavailable`: State the missing source or failed retrieval.

Do not infer customer intent, message direction, or message content from an activity timestamp. Do not promise eligibility, inventory, a hold, or a purchase.

## Stop

Use the server-supplied `scan_objective`. The proposed default ranks useful seller actions today. Revenue can affect rank.

Stop after every assigned account has a schema-valid result. Return `deferred` for an uncompleted assessment. Include evidence IDs and source limits. The server computes coverage.
