---
name: sales-evidence-judgment
description: Judge regional sales evidence before a seller recommendation. Use when facts support competing explanations or material unknowns remain.
---

# Sales evidence judgment

Use this skill after evidence retrieval. This skill ranks actions by the server-supplied scan objective. The proposed default is useful seller action today.

## Classify evidence

1. Check the source field before you mark a returned row as a fact.
2. Mark a conclusion from facts as an inference.
3. Mark absent or unavailable information as an unknown.
4. Reject a fact when its envelope reports an error or truncation.
5. Use dated stale evidence only for a stated historical claim.
6. Do not use stale or mixed evidence for current availability or unsupported comparisons.

An active contract supports an account relationship. It does not prove renewal risk. A ticket use supports attendance. It does not prove a preference for a future event.

## Compare explanations

1. Name the leading explanation.
2. Name one reasonable competing explanation when it affects the action.
3. Request more evidence only when it can change the action.
4. Prefer an ask when a material unknown blocks a useful action.

Do not turn a fixed SQL threshold into the final recommendation. Do not create a universal upsell script.

## Rank actions

Rank an action by the server-supplied scan objective. Consider revenue, customer value, evidence strength, urgency, and effort when the objective permits them.

## Output

For each account, return:

```text
State: act | ask | no-action | deferred | unavailable
Facts: evidence IDs and short facts
Inference: one qualified conclusion, if supported
Unknowns: material unknowns
Seller action: one useful next step
```

Stop when the result has a state, evidence trace, and honest limit.
