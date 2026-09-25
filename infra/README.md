# Terraform deployment

This module reads the same harness configuration as the offline checks.
It manages one harness and its execution role in `us-east-1`.
AWS also provisions the underlying Runtime resources for the harness.
The caller bootstrap policy and service-created log group remain outside Terraform.
The reviewed caller policy source is [`iam-harness-bootstrap-policy.json`](iam-harness-bootstrap-policy.json).

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

These commands install and validate the provider. They do not change resources.
Keep `.terraform.lock.hcl` under version control after its review.

## Current deployment

- Harness: `livenation_demo`
- Model: `moonshotai.kimi-k2.5`
- Memory: disabled
- Network: public
- Idle timeout: 60 seconds
- Maximum lifetime: 300 seconds
- Runtime log retention: one day
- Transaction Search: disabled

Terraform reports no changes after refresh.
The execution role permits only direct Kimi K2.5 invocation in `us-east-1`.
The caller policy omits `bedrock-agentcore:InvokeAgentRuntimeCommand`.
AWS requires `Resource: "*"` for the three AgentCore create actions because they support no resource type.

The configured token limits do not cap all AWS charges.
The project target remains $13, with an operational stop at $15 and a $5 reserve.
Runtime memory remains billable during idle sessions.
See [AWS harness cost controls](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html).

## Commands

Use the normal demo profile for plans and teardown:

```sh
terraform -chdir=infra plan
terraform -chdir=infra destroy
```

The initial create used `-var aws_profile=default` because the cached development session lacked a new create-time tag permission.
Do not use that override for routine work.

The active AWS managed policy is `LiveNationDemoHarnessProvisioning`.
Update it from the reviewed JSON only after AWS Access Analyzer validation.

After destruction, confirm the harness and Runtime are absent.
Delete the confirmed Runtime log group with `livenation-demo`.
Use the root profile to detach and delete `LiveNationDemoHarnessProvisioning` after Terraform no longer needs it.
