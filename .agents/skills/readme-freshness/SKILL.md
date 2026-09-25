---
name: readme-freshness
description: Check README accuracy before each commit or push in this repository, and after a push completes.
---

# README freshness

Keep `README.md` useful for a newcomer who has no project context.

Before each push, compare the pending changes and local commits with the README. Check these public facts:

- the demo purpose and user workflow;
- what works now;
- what remains planned;
- the local setup and check commands; and
- important safety boundaries.

Update the README when these facts changed. Keep AWS details at a high level, and link to technical documents for deeper details.

Separate current behavior from planned behavior. Do not describe unverified or incomplete work as complete.

The check does not require a README edit when the existing text remains accurate. If a completed push made the README stale, correct it in the next authorized push.
