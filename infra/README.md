# Terraform preparation

This module reads the same harness configuration as the offline checks.
It declares one managed harness in `us-east-1` for account `009073575420`.
AWS also provisions the underlying Runtime resources for the harness.
The module does not create an execution role, caller permissions, Gateway, or log controls.
It is not ready to apply.

## Provider

The proposed dependency is the official `hashicorp/aws` provider, version `6.66.0`.
The exact namespace prevents confusion with similarly named providers.
HashiCorp maintains it under MPL-2.0 in its active [provider repository](https://github.com/hashicorp/terraform-provider-aws).
The repository had 11,102 stars when checked on September 25, 2026.
Recent releases have approximately weekly intervals.
Version 6.66.0 was [released September 21, 2026](https://github.com/hashicorp/terraform-provider-aws/releases/tag/v6.66.0).
The release exceeds the 72-hour cooldown.
Its [versioned documentation](https://github.com/hashicorp/terraform-provider-aws/blob/v6.66.0/website/docs/r/bedrockagentcore_harness.html.markdown) includes the harness resource.

The provider tracks resource state and supports a reviewed teardown.
The installed AWS CLI is the alternative, but direct CLI changes require separate state management.
The AgentCore CLI uses a CDK deployment path and can install extra packages.
This setup keeps the original Terraform choice.

The user approved provider installation on September 25, 2026.
Terraform installed version `6.66.0` and verified its HashiCorp signature.
The lockfile records the selected version and package checksums.
Keep signature and checksum checks enabled for subsequent installations.

To reproduce the approved local initialization:

```sh
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
```

These commands install and validate the provider. They do not apply resources.
Keep `.terraform.lock.hcl` under version control after its review.

## Remaining deployment requirements

- Verify the non-root deployment identity and its exact permissions.
- Create the named execution role through a separately reviewed permission change.
- Limit model access to direct `moonshotai.kimi-k2.5` in `us-east-1`.
- Include `bedrock:InvokeModelWithResponseStream` for `arn:aws:bedrock:us-east-1::foundation-model/moonshotai.kimi-k2.5`.
- Omit `bedrock-agentcore:InvokeAgentRuntimeCommand` from caller permissions.
- Review telemetry permissions, Transaction Search, and short log retention.
- Confirm model access and a bounded live test.
- Review the Terraform plan, expected charges, and exact teardown targets before apply.

The configured token limits do not cap all AWS charges.
The project target remains $13, with an operational stop at $15 and a $5 reserve.
Runtime memory remains billable during idle sessions.
See [AWS harness cost controls](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html).

The eventual teardown must remove only this project's confirmed resource IDs.
After resource deletion, inspect the remaining Runtime resources and log groups.
Terraform destroy alone does not prove that every charge has stopped.
