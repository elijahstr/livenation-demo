# 🎫 Live Nation AI sales demo

This repository is a small interview demo for an AI assistant that helps a concert-sales team notice shows that need attention.

The assistant reads fictional ticket-sales totals, explains what the numbers show, and proposes a useful next step. A person stays in control before any outside action occurs.

This is an independent prototype. It is not an official Live Nation product.

## 🔎 What this demo does

The finished demo will show one clear workflow:

1. Read aggregate sales data for a fictional show.
2. Compare current ticket sales with the target.
3. Explain the evidence without inventing customer details.
4. Suggest a practical response.
5. Ask for human approval before it prepares an outside action.
6. Keep a clear record of the evidence, recommendation, and decision.

For example, the assistant could identify a show below its sales target. It could then explain the gap and prepare an outreach draft.

## ✅ Current status

The repository already includes:

- fictional, aggregate sales data with no personal information;
- a read-only tool that returns evidence for an approved fictional show;
- limits that keep the agent focused on evidence and safe recommendations;
- automated tests and local configuration checks; and
- a live managed AgentCore Harness that uses Kimi K2.5.

The harness completed a live synthetic evidence-tool cycle on September 25, 2026.

## 🛠️ What comes next

The planned repository will add:

- a simple interface for the complete demo;
- a connection to a curated sales-data source;
- a human approval step for proposed actions;
- a safe outreach-draft workflow;
- a simulated marketing-change workflow; and
- a visible activity record for review and troubleshooting.

The demo will use AWS as the managed environment for the AI agent. Detailed infrastructure notes stay in [`infra/`](infra/) and [`docs/plans/`](docs/plans/).

## 🛡️ Safety boundaries

- The demo uses synthetic data only.
- The sales tool can read aggregate evidence, but it cannot change source data.
- The demo does not send email or change a live advertising campaign.
- A recommendation is not proof that an action will increase revenue.

## 🧪 Run the local checks

Install the existing project dependencies, then run:

```sh
bun test
bun run validate-setup
```

These checks validate the local demo files. They do not create cloud resources or perform outside actions.

## ☁️ Run the live harness check

Use the deployed harness through the `livenation-demo` AWS profile:

```sh
bun run invoke-harness
```

The script verifies the AWS SDK bundled with AgentCore CLI 0.30.0.
It then runs one simple response and one client-side evidence-tool cycle.
The client processes only `get_sales_evidence` inline calls.

AWS does not document a plain `allowedTools` match for inline functions.
Kimi did not expose the function with its plain-name allow-list during live tests.
The trusted demo invocation therefore supplies the inline tool with a wildcard allow-list.
That wildcard also enables the built-in `shell` and `file_operations` tools for that invocation.
Do not expose this script to untrusted prompts.

## 🧹 Teardown

Remove the harness and its execution role:

```sh
terraform -chdir=infra destroy
```

Delete the confirmed Runtime log group with the `livenation-demo` profile.
Then use the root profile to detach and delete `LiveNationDemoHarnessProvisioning`.

## 🗂️ Repository guide

| Path | Purpose |
| --- | --- |
| [`fixtures/`](fixtures/) | Fictional ticket-sales examples |
| [`src/`](src/) | Local sales-evidence logic |
| [`tests/`](tests/) | Automated behavior and safety checks |
| [`config/`](config/) | Agent settings and demo limits |
| [`infra/`](infra/) | Deployed harness and execution-role configuration |
| [`docs/plans/`](docs/plans/) | Design decisions and implementation plans |
