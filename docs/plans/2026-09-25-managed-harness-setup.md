# Managed harness setup bundle

## Goal

<!-- digest:start -->

Prepare a local managed AgentCore Harness bundle. The bundle validates configuration and synthetic fixtures without an AWS request.

The local setup creates no browser, shell, file-operation, skill, Gateway, or direct-command grant. The configuration does not prove absent effective IAM permissions.

<!-- digest:end -->

> **Objection.** Do not run `agentcore dev`. AWS documents that it deploys AWS resources before it starts a local server. [Get started](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-get-started.html)

## Local files

| Path | Purpose |
| --- | --- |
| `config/create-harness.json` | Canonical direct `CreateHarness` request. |
| `config/model-catalog.json` | Selected model and future allowlisted model records. |
| `config/demo-limits.json` | Demo budget intent and retry limits. |
| `fixtures/synthetic-sales.json` | Aggregate-only fictional sales evidence. |
| `src/local-setup.ts` | Pure fixture handler and local configuration assertions. |
| `scripts/validate-setup.ts` | Bun local validation entry point. |
| `tests/setup.test.ts` | Local unit tests for the fixture handler and configuration assertions. |
| `infra/main.tf` and `infra/versions.tf` | Harness-only Terraform draft from canonical JSON. |

Do not create an AgentCore CLI project. Do not invoke a model. Do not deploy. Do not create a Gateway, Memory resource, credential provider, or IAM resource.

## Locked decisions

- Use `config/create-harness.json` as the source of truth for the direct service request and Terraform draft.
- Use `harnessName: "livenation_demo"`.
- Use the planned role ARN `arn:aws:iam::009073575420:role/livenation-demo-harness`. The role does not exist in this bundle. The file proves no role, trust policy, or permission.
- Use `us-east-1`, `us.openai.gpt-6-luna`, `bedrockModelConfig`, and `apiFormat: "converse_stream"`.
- Set the per-model `maxTokens` to `1024`. Set the invocation `maxTokens` to `2048`.
- Set `maxIterations` to `3`, `timeoutSeconds` to `60`, `idleRuntimeSessionTimeout` to `60`, and `maxLifetime` to `300`.
- Set `memory` to `{ "disabled": {} }`, `skills` to `[]`, and `truncation.strategy` to `sliding_window`.
- Use only `get_sales_evidence` as an `inline_function`. Set `allowedTools` to `["get_sales_evidence"]`.
- Give `get_sales_evidence` only `show_id` and `region`. Allow `east_show` or `west_show`, and `east` or `west`.
- Keep the region authorization value in trusted caller context. The local handler rejects a region outside that value and rejects unknown input keys.
- Do not grant `bedrock-agentcore:InvokeAgentRuntimeCommand`. AWS documents that `allowedTools` does not restrict this separate command API. [Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)

## Configuration limits

The request uses the AgentCore Runtime environment with `PUBLIC` network mode. This local declaration creates no network resource or public endpoint.

The direct request stores lifecycle values under `environment.agentCoreRuntimeEnvironment.lifecycleConfiguration`. The selected values meet the documented 60-second minimum. The idle timeout is less than the maximum lifetime. [CreateHarness CLI reference](https://docs.aws.amazon.com/cli/latest/reference/bedrock-agentcore-control/create-harness.html)

The model catalog records the Luna route and the prior research estimate. Its status states that the estimate is not a current bill or price guarantee. It has no comparator selection.

The limits file sets a `$13` target, a `$15` operational stop, an absolute cap below `$20`, and a `$5` reserve. It sets zero retries and one concurrent run. These values express local intent only. They are not an AWS hard spend cap.

## Fixture boundary

The fixture has only synthetic origin, a data timestamp, regional show IDs, and aggregate ticket counts. It has no person, account, email, authorization value, venue identifier, action target, or external source.

`get_sales_evidence` is a pure local handler. It returns evidence only for the requested fictional show and the trusted caller region. It has no network, browser, shell, file-write, or direct-command path.

The system prompt requires the synthetic origin and timestamp. It prohibits actions and customer-data inference.

## Staged local bundle

<!-- digest:stages Configuration | Local validation | Deployment authority -->

1. Add the canonical JSON, local fixture, pure handler, and Bun validator.
2. Validate JSON shape, fixed model and limits, disabled Memory, no skills, and the single-tool allowlist.
3. Validate the east and west fixture paths. Reject unknown keys, unknown shows, and cross-region reads.
4. Generate the AWS CLI input skeleton to confirm operation availability. Do not pass candidate configuration to this command.
5. Run `bun scripts/validate-setup.ts`, `bun test`, and `terraform -chdir=infra validate`.
6. Prepare only the Terraform Harness draft. Do not plan or apply the draft.

AWS CLI `2.36.49` cannot validate this candidate with `--generate-cli-skeleton output`. It expands conflicting tagged-union response members with invalid placeholders. The local validator checks the candidate configuration. The input skeleton checks operation availability only.

Do not claim that AWS CLI locally validates the candidate request schema. The loopback endpoint and `--no-sign-request` remain local safety controls when the command needs an endpoint.

## Terraform preparation

The Terraform draft uses the exact `hashicorp/aws` version `6.66.0`. It reads the canonical JSON and declares one Harness only.

Dependency approval allowed `terraform init -backend=false -input=false`. Terraform installed the signed HashiCorp provider and created `infra/.terraform.lock.hcl`. `terraform -chdir=infra validate` passed against provider `6.66.0`.

Do not run `terraform plan` or `terraform apply`. The draft needs a separately reviewed execution role before apply.

HashiCorp documents native Harness support in provider `6.66.0`. [Provider source](https://raw.githubusercontent.com/hashicorp/terraform-provider-aws/v6.66.0/website/docs/r/bedrockagentcore_harness.html.markdown)

## Deployment blocks

- The planned execution role has no verified existence, trust policy, model permission, telemetry permission, or caller permission.
- AWS account access, Region support, model access, and SigV4 operation require live verification.
- AgentCore Gateway remains a future live requirement. It is not ready in this bundle.
- The inline-function client adapter is absent. A future client must capture model `toolUse`, validate the request and region, run the local handler, and return the assistant `toolUse` plus user `toolResult` in a follow-up `InvokeHarness` call. Without this adapter, the harness stops with `tool_use`.
- WorkIQ authentication is absent.
- Databricks service identity is absent.
- The frontend is not built.
- The configured budget thresholds do not cap total AWS charges.

## Open questions

- Grant deployment authority only after review of concrete costs, permissions, Region support, model access, and a final Terraform plan.
- Review the execution role before it exists or receives permissions.

## Documentation review result

Independent review found that the digest searched for `Open question` while the plan used `Open questions`. The digest now reads the plural heading and shows both open questions.

Independent review found that the inline-function adapter was not present. The deployment block now states the required follow-up tool protocol and its absent status.

## Evidence and claim status

| Claim | Status | Evidence |
| --- | --- | --- |
| `agentcore dev` deploys AWS resources before its local server starts. | Verified | [Get started](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-get-started.html) |
| `converse_stream` is the default Bedrock format. | Verified | [Harness models](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-models.html) |
| `allowedTools` does not restrict the direct command API. | Verified | [Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html) |
| The local validation proves the role or live deployment. | False | Local files, an input skeleton, and Terraform validation do not prove AWS state. |
| AWS CLI output skeleton generation validates this candidate request. | False | CLI `2.36.49` creates invalid tagged-union response placeholders. |
| The one-tool configuration alone removes all IAM direct-command risk. | False | IAM still controls the separate direct command API. |

## Tests

- Run `bun scripts/validate-setup.ts` with no AWS credentials in the environment.
- Run `bun test`.
- Check that the only tool and allowed tool are `get_sales_evidence`.
- Check that the tool schema rejects unknown keys and values outside the two fictional shows and regions.
- Check that the pure handler rejects a cross-region request.
- Check that the fixture declares `origin: "synthetic"` and two fictional regional shows.
- Check that the validator uses AWS CLI `2.36.49` and `--generate-cli-skeleton input` only for operation availability.
- Check that custom local assertions validate the candidate configuration and synthetic fixture.
- Run `terraform -chdir=infra validate` against the approved locked provider.
- Check that no validation command deploys, invokes, plans Terraform, or applies Terraform.

## Sources

- [Get started](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-get-started.html)
- [Models and instructions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-models.html)
- [Tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)
- [Observability and cost controls](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html)
- [CreateHarness API](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_CreateHarness.html)
- [HashiCorp Harness provider source](https://raw.githubusercontent.com/hashicorp/terraform-provider-aws/v6.66.0/website/docs/r/bedrockagentcore_harness.html.markdown)
