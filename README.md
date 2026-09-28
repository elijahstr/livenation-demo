# Live Nation AI sales demo

This public repository is an independent interview demo. It is not an official Live Nation product.

The demo finds one weak West-region ticket-sales result, asks Kimi for a bounded explanation, and records a human-approved local simulation. It uses real Live Nation portfolio venue names with synthetic show and sales data.

## What works now

- The local Bun command center has six West-region venues.
- Deterministic code selects only a row below 75 percent of its cumulative target.
- The code validates six synthetic Databricks evidence rows before a Kimi request.
- The managed AgentCore Harness uses Kimi K2.5 and one selected evidence tool.
- Email, Social, and Dismiss actions create local JSON records only.
- Editing a draft removes approval.
- Duplicate local execution returns the existing completed record.

The local verifier and the live Databricks-to-Kimi verifier pass. The live browser flow also passes.

## Live setup

You need these profiles and tools:

- The `livenation-demo` AWS profile.
- The `livenation-demo` Databricks profile.
- AWS CLI 2.36.49.
- Databricks CLI 1.17.0.
- AgentCore CLI with its pinned AWS SDK.
- Terraform for the deployed Harness output.

The Databricks demo table contains exactly six synthetic West-region rows. The live sales check selects Hayden Homes Amphitheater at 55 percent of target.

```sh
bun run seed-west-demo
```

The seed command changes only `workspace.livenation_demo`. It captures migration data under ignored `outputs/migrations/` before it replaces the synthetic demo table.

## Start the command center

Set the live configuration first. The runtime file contains non-secret defaults, including the demo warehouse identifier.

```sh
export HARNESS_ARN="$(terraform -chdir=infra output -raw harness_arn)"
bun run dev
```

Open `http://127.0.0.1:3000`.

The server binds only to loopback. It accepts only its configured `127.0.0.1` or `localhost` Host header. It serves only `index.html`, `app.js`, and `styles.css`.

## Verify the demo

Run the complete local verification without AWS or Databricks:

```sh
bun test
bun run verify-west-demo:local
bun run validate-setup
```

Run the live verification after AWS login succeeds:

```sh
bun run verify-west-demo
```

The live verifier passed. It reads six synthetic Databricks rows, expects Hayden Homes Amphitheater at 55 percent of target, invokes Kimi once, and checks one approved local simulation. It does not send email or change advertising.

## Synthetic-data boundary

- Venue names, cities, states, and public capacities use public Live Nation venue information.
- Show names, dates, sales, targets, market signals, and actions are synthetic.
- The interface labels the data as synthetic.
- The model receives one selected aggregate. It receives no free-form operator prompt.
- Kimi rationale is not measured fact.
- Email and Social are simulations. Dismiss is a local audit record.

## Harness risk for this demo

Kimi needs an invocation override with `allowedTools: ["*"]` for the current inline evidence tool handoff. This also exposes built-in `shell` and `file_operations` tools. It adds about 900 input tokens per trusted model request.

This accepted risk applies only to the fixed-prompt, synthetic interview demo. Do not use this setting with untrusted text or production data.

## Static-file compatibility

Bun 1.3.11 cannot use the planned `{ dir }` route here without unavailable framework runtime packages. The server therefore uses a tested manual allowlist for three public files and rejects traversal paths.

## Repository guide

| Path | Purpose |
| --- | --- |
| [`fixtures/`](fixtures/) | Six synthetic West-region evidence rows |
| [`src/`](src/) | Validation, Databricks, Harness, action, and server code |
| [`public/`](public/) | Local command-center interface |
| [`scripts/`](scripts/) | Seed, local verification, and live verification commands |
| [`infra/`](infra/) | Managed Harness configuration |
| [`docs/plans/`](docs/plans/) | Design and implementation records |
