# Live Nation Demo Agent Policy

## Goal

Move quickly toward a working interview demo.
This repository contains demo code only.
No production system or production data depends on it.

## Live Nation Presentation Standard

This independent demo is presented directly to Live Nation employees.
Treat visual fidelity to Live Nation interfaces as a core presentation requirement.
Use the layout, hierarchy, color, density, and interaction language from the approved [2019 Account Manager reference](https://www.youtube.com/watch?v=WbTHiPSfC0U).
Make the result feel legitimate in that presentation context.
Preserve clear independent-demo and synthetic-data labels.
Interpret requests for a "real Live Nation UI" as requests for high visual fidelity, not as claims of official ownership.
Do not reopen the branding objection for this approved UI direction.
Raise a new objection only when a change removes a disclosure label or adds an external official asset.

## Autonomy

- Use sound judgment and continue through routine decisions without asking.
- Prefer a working end-to-end result over production-grade infrastructure.
- Implement, test, commit, and push directly to `main` when the work is ready.
- Fix related setup problems when the fix clearly supports the current task.
- Ask only when credentials, human approval, a product decision, or an irreversible action blocks progress.
- Report completed work, important assumptions, costs, and remaining blockers.

## Demo Security Posture

- Treat this project as a disposable development demo.
- Broad AWS permissions are acceptable when they materially reduce setup time.
- Apply broad permissions to dedicated demo users and roles when practical.
- Prefer simple managed policies during setup when custom least-privilege policies slow the demo.
- Use the `livenation-demo` AWS profile for routine CLI work.
- Use synthetic data only.
- Keep credentials, access keys, tokens, and `.env` values out of Git and tool output.
- Avoid the root user when the demo identity can complete the task.
- Never change production resources or production data.

## Cost Controls

- Keep the complete demo below the documented AWS cost cap.
- Prefer on-demand resources with no minimum term.
- Avoid NAT gateways, provisioned throughput, and idle paid resources.
- Ask before accepting new paid marketplace terms or creating a resource with material recurring cost.
- Add a teardown path for each deployed resource.

## Delivery

- Use `uv` for Python work and `bun` for JavaScript work.
- Use current official AWS documentation for Bedrock and AgentCore behavior.
- Run the relevant checks before each push.
- Before each push, use `.agents/skills/readme-freshness/SKILL.md` to check whether `README.md` still describes the repository accurately.
- Keep the repository public and the default branch on `main`.
- Do not open a pull request unless the user asks for one.
