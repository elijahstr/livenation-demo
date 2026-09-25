# Live Nation demo preparation

This repository contains a local preparation bundle for a managed AWS AgentCore Harness.

The selected route is Bedrock Converse Stream with direct in-Region `moonshotai.kimi-k2.5` in `us-east-1`.

The bundle does not deploy AWS resources, invoke a model, create a Gateway, access Databricks, connect Work IQ, or provide a user interface.

## Local checks

Run the tests:

```sh
bun test
```

Validate the strict local configuration and the AWS CLI input skeleton path:

```sh
bun run validate-setup
```

The validator uses `Bun.spawnSync` with an argument array. It calls `aws --version` and `create-harness --generate-cli-skeleton input` only. This verifies local CLI input-schema generation, not AWS access, model availability, IAM authorization, deployment, or billing.

AWS CLI 2.36.49 cannot generate a usable `create-harness --generate-cli-skeleton output` response. It expands every tagged-union arm with invalid placeholder values, then returns local parameter validation errors. The local contract validator checks the candidate configuration instead. This is a CLI limitation, not a successful AWS schema check.

## Boundaries

- [`config/create-harness.json`](config/create-harness.json) limits the Harness to one inline aggregate-evidence tool.
- [`fixtures/synthetic-sales.json`](fixtures/synthetic-sales.json) contains fictional aggregate data only. It has no PII.
- [`config/demo-limits.json`](config/demo-limits.json) records a target of $13, a stop point of $15, and an exclusive cap below $20. These values express intent only. They do not enforce a live AWS budget.
- [`config/model-catalog.json`](config/model-catalog.json) records the selected Kimi K2.5 Standard price: $0.60 input and $3.00 output per million tokens in `us-east-1`. AWS pricing was checked on 2026-09-25. This is not a current AWS bill or price guarantee. Luna remains an unselected catalog entry. No proven Kimi-to-Luna comparison exists.

## Known incomplete work

The earlier Luna test failed during AWS account verification. A subsequent direct Kimi test on September 25 used 64 output tokens and no retries. AWS denied `bedrock:InvokeModel` for `livenation-dev`. This permission failure does not establish whether account verification has completed.

The developer profile also cannot list harnesses or inspect the execution role. A non-root administrator profile is required for the permission changes. No IAM changes or deployments occurred during the Kimi test.

The Harness execution role setup, AgentCore deployment, Gateway, Databricks integration, Work IQ draft path, UI, observability, and live budget controls remain incomplete. Terraform initialization completed locally. No Terraform deployment occurred.

The inline-tool client adapter is also absent. The tool schema does not execute the local handler automatically. A future client must capture `toolUse`, validate the arguments and caller region, and call the handler. It must return both the assistant `toolUse` message and the user `toolResult` message. Without that client, the harness stops at `tool_use`. See the [AWS inline-function protocol](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html#harness-tools-inline-functions).

`agentcore dev` can auto-deploy resources. Do not use it for this repository. This repository is not an AgentCore CLI project. A local Terraform draft and its approved provider installation exist, but no deployment occurred.

See the [historical Luna setup plan](docs/plans/2026-09-25-managed-harness-setup.md). This handoff selects Kimi and does not revise that historical decision record. See the [visual summary](docs/plans/managed-harness-view/managed-harness-setup.html) and [Terraform preparation](infra/README.md).
