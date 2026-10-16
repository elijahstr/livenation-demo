# Terraform deployment

This module reads the same harness configuration as the offline checks.
It manages one harness, its execution role, and a conversation-memory store in `us-east-1`.
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

## Historical deployment record

- Harness: `livenation_demo`
- Model: `moonshotai.kimi-k2.5`
- Memory: disabled
- Network: public
- Idle timeout: 60 seconds
- Maximum lifetime: 300 seconds
- Runtime log retention: one day
- Transaction Search: disabled

This is a repository record. It is not a refreshed live AWS report.
The execution role permits only direct Kimi K2.5 invocation in `us-east-1`.
The caller policy omits `bedrock-agentcore:InvokeAgentRuntimeCommand`.
AWS requires `Resource: "*"` for the three AgentCore create actions because they support no resource type.

The configured token limits do not cap all AWS charges.
The project target remains $13, with an operational stop at $15 and a $5 reserve.
Runtime memory remains billable during idle sessions.
See [AWS harness cost controls](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html).

## Conversation memory change

The September record above predates this change. On October 16, 2026, Terraform created the memory and its scoped policy, then attached the memory to the existing harness. No resource was destroyed. The subsequent plan reported no changes.

The memory resource is `livenation_demo_conversation_memory-1Fd0yIE92A`. AWS reports `ACTIVE`, seven-day retention, and an empty strategy list. The first live probe verified saved events, recall after a 310-second wait, and separation between two conversations. No sales tool ran in that probe. This is not proof of the complete sales chat or direct MCP integration.

Terraform reads `config/conversation-memory.json`. It creates a seven-day AgentCore Memory store with no long-term strategies. It attaches that store to the harness and grants the execution role access only to that memory ARN. `config/create-harness.json` remains the original bootstrap template; Terraform replaces its disabled-memory setting.

Every invocation of this shared harness stores events. Chat uses `demo-user`, recovery uses `recovery-system`, and other scripts default to `demo-system`. These actor names separate demo records; they do not authenticate distinct human users. The app checks the attachment at startup and before each persistent turn. It retrieves up to twelve raw messages, which can include tool messages.

The runtime still has a 300-second maximum lifetime. A restart during an inline-tool handoff can interrupt that conversation. The app requires a new chat after a failed handoff. No automatic model retry occurs.

Use `/home/elijahstraight/repos/livenation-demo-agentcore` as the sole Terraform control point until main contains the same infrastructure configuration. **Do not apply Terraform from the older main configuration.** It would propose deletion of the new memory and policy. The task uses the original state at `/home/elijahstraight/repos/livenation-demo/infra/terraform.tfstate`, with its normal lock. Do not copy state, split ownership, use `state rm`, or bypass the lock.

Prepare a private saved plan from this worktree with the original state path. Permit only the memory and policy additions and the in-place harness memory update. Reject deletion, replacement, or unrelated changes. After apply, verify that the original state lineage stays the same and its serial increases. No state file should appear in this worktree.

Rollback must explicitly set `memory { disabled {} }` on the harness. Never omit the memory block: omission can select managed memory defaults. Retain the memory resource and policy declarations during rollback so Terraform does not delete stored events. Disable live chat before rollback. Review the rollback plan before apply.

After deployment, the bounded recall check uses the real chat invoker and waits beyond the runtime's 300-second maximum lifetime:

```sh
bun run verify-agentcore-memory --run
```

This paid check requires observed cost below $13 and permits at most three recorded attempts. It tests saved events, recall, and separation between conversations. It does not prove the sales-tool path or direct MCP. Its ledger is separate from the sales-chat probe ledger. Cost Explorer can lag.

## Transaction Search inspection

Transaction Search changes span ingestion for the complete AWS account. Inspect the account before any change.

```sh
bun run scripts/inspect-configure-agentcore-observability.ts
bun run scripts/inspect-configure-agentcore-observability.ts --permissions
```

The first command prints discovered resources and the dry-run write scope. The second command prints the exact caller policy statement. It does not apply permissions.

Use this command only after review of the dry-run scope and caller permissions:

```sh
bun run scripts/inspect-configure-agentcore-observability.ts --apply
```

The script uses a fixed scoped resource policy. It preserves existing group retention and existing indexing. It uses one-day retention only for a new shared group it creates. It records the prior X-Ray destination and indexing for rollback.

The script rejects an absent Default indexing rule. It does not invent a rollback. Transaction Search indexing is not a promise of free ingestion or storage.

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

## Rollback permission and readiness

The default apply policy cannot delete a resource policy. Print the separate rollback-only permission when the recorded rollback requires it:

```sh
bun run scripts/inspect-configure-agentcore-observability.ts --rollback-permissions
```

`logs:DeleteResourcePolicy` has no resource-level IAM scope. Review this broader permission before any grant. The rollback record identifies the one task policy to remove. It never authorizes log-group deletion.

After apply, the script waits for the `CloudWatchLogs` destination to report `ACTIVE`. A matching span remains a separate live check.

The printed API policy deliberately omits Application Signals discovery and service-linked-role creation. The script does not call these APIs. The [AWS prerequisite list](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Enable-TransactionSearch.html) includes them for the complete setup workflow. If the API path needs them, inspect the exact denial before any additional grant. An incomplete apply retains its rollback record.
