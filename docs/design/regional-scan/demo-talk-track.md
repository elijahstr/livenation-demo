# Regional scan demo talk track

> **Caveat for the presenter.** Show this as an architecture demo.
> Do not claim that the regional scan is deployed.
> Do not promise revenue, customer intent, an inventory hold, or an automated release.

## Three to five minute path

### 1. Start with the seller

"This seller covers Northern California, Oregon, and Washington."

"The proposed demo roster uses a versioned venue and account allowlist."

"Current data proves state scope only. It does not prove a Northern California boundary."

"The first screen is a scan because the seller needs useful work, before a dashboard."

"The scan then opens an account conversation with the evidence already in view."

**Say:** This flow is a settled design.

**Do not say:** This scan runs in the current application.

### 2. Explain the two evidence paths

"The system uses two paths because not every question has the same shape."

"Fixed retrieval answers repeated business facts."

"It keeps counts, refund treatment, benefits, and dates consistent."

"Genie supports open investigation when the scan agent needs another fact."

"The seller can also ask an open follow-up question."

"The server sends the agent a bounded account batch."

"The agent chooses the evidence sequence inside that batch."

"The server validates every expected account result before it publishes coverage."

"It can recommend an action, a seller question, or no action."

**Say:** The model investigates.
The data layer defines stable business facts.

**Do not say:** The model can run any SQL or change business data.

### 3. Use Harbor Works as the concrete example

"Harbor Works is our verified synthetic teaching case."

"It shows three used tickets for one Meridian Lights event."

"General Parking is included for a future event."

"Premier Parking is not included."

"The saved inventory snapshot shows twelve Premier Parking units at $40."

"The missing facts are travel, future attendance, and customer intent."

"The useful recommendation is to ask about cars before a quote."

"It is not a recommendation to reserve inventory."

**Say:** This is evidence plus a bounded seller question.

**Do not say:** The customer wants Premier Parking.

### 4. Explain the proof path

"Each recommendation names its evidence and its unknowns."

"The server records source-table versions, view fingerprints, roster scope, and skill hashes."

"The demo can show Databricks query evidence and the AgentCore trace."

"Those records prove a request path."

"They do not prove a business outcome."

**Say:** The proof helps a reviewer inspect the claim.

**Do not say:** A trace proves recommendation quality.

### 5. Close with authority

"The agent does not release an offer, send a message, or hold inventory."

"The later design makes seller selection prepare a server-side hold and draft."

"The later design requires seller approval for a specific release or spend."

"Permissions and application code enforce the action boundary."

**Say:** Skills guide qualitative judgment.
SQL defines quantified rules.
The design puts action checks in application code and access checks in permissions.
Current request validation limits sources, but the demo identity has broad rights.
Scoped permissions are proposed work.

**Do not say:** A prompt or tool allowlist is the access control.

## Current-state disclosure

Use this disclosure if a technical reviewer asks what works now.

"Current Premium chat has two fixed A100 tools and one Genie analytics tool."

"The regional scan, its tool contracts, and its UI integration remain design work."

"The current application calls workspace Genie One through its local bridge."

"The proposed design reuses the dedicated Genie Agent after a runtime verification."

"The October 19 Silver check found 278 accounts, 555 activities, and 9,999 rows across 17 tables."

"We will recheck that observation before the demo."

"Repository proof records 10,000 Bronze rows. That does not mean 10,000 accounts or 10,000 tickets. The generated accounts remain repetitive, so varied scenario fixtures still matter."

"We will recheck the loader state before the demo."

## Presenter checklist

- State `synthetic` before discussing Harbor Works.
- State the inventory `snapshot_at` time when it appears.
- Name one source for each material claim.
- Name an unknown before any proposed customer action.
- Show no draft, hold, or release as an autonomous agent action.
- Distinguish current code from proposed architecture.
- Describe the roster as a proposed demo roster until its allowlist is verified.

## Presenter references

- [Architecture decisions](architecture-decisions.md)
- [Current Premium tools](../../../src/premium-tools.ts)
- [Premium Gold guide](../../data/premium-gold-tools.md)
- [Current static scan mock](../../prototypes/premium-sales/index.html)
