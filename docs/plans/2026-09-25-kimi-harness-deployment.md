# Kimi managed harness deployment

## Goal

Deploy the prepared AgentCore Harness in `us-east-1`, invoke Kimi K2.5, and complete one synthetic inline-tool cycle.
Keep the deployment small, reversible, and below the documented demo cost cap.

<!-- fig:kimi-harness-flow -->

## Scope

- Create the `livenation-demo-harness` execution role through Terraform.
- Grant `livenation-dev` the permissions needed to provision and invoke this demo.
- Create the managed harness through Terraform.
- Add a dependency-free client adapter around the verified AWS SDK bundled with AgentCore CLI 0.30.0.
- Verify a simple response and one `get_sales_evidence` tool cycle.
- Keep the harness deployed for the interview demo.
- Document an exact teardown command and inspect service-created logs after teardown.

## Locked decisions

- Use direct `moonshotai.kimi-k2.5` through Bedrock Converse Stream.
- Use the existing `livenation-demo` AWS profile for Terraform and invocation.
- Use root for the bootstrap policy and initial apply because the cached development session lacks the updated create-time tag permission.
- Use a public AgentCore network because this demo reads only local synthetic tool data.
- Disable managed memory, Browser, Code Interpreter, Gateway, and skills.
- Keep the 60-second idle timeout and 300-second lifetime allowed by the current API.
- Keep three iterations, 2,048 harness output tokens per invocation, a 1,024-token model cap, and a 60-second invocation timeout.
- Grant the execution role direct Kimi K2.5 invocation only.
- Grant no `InvokeAgentRuntimeCommand` permission.

## Plan

1. Add the execution role and its inline policy to `infra/main.tf`.
2. Point the harness resource at the managed role and enforce the role-policy dependency.
3. Protect the role trust with the account ID and AgentCore source-ARN conditions.
4. Grant the public harness only model, ECR Public, telemetry, and workload-identity permissions.
5. Add a pure TypeScript stream adapter with tests for the inline-function handoff loop.
6. Require one 33-character-or-longer session ID, fragmented JSON assembly, exact tool-name checks, and explicit stream-error failure.
7. Repeat each complete assistant `toolUse` and user `toolResult` handoff while the model returns `tool_use`, up to three iterations.
8. Add a runnable script that resolves the SDK bundled with AgentCore CLI and verifies version `3.1140.0` before use.
9. Confirm that `livenation-demo` maps to `livenation-dev` and Kimi remains authorized.
10. Probe Kimi tool use directly through Bedrock before any harness resource exists.
11. Add a persistent caller bootstrap policy with one root write because no non-root administrator exists.
12. Grant harness and Runtime lifecycle actions, required Memory dependencies, tags, log retention, and scoped `iam:PassRole`.
13. Scope Harness actions to `harness/livenation_demo-*`; use deliberate account-and-Region wildcards for service-generated Runtime and Memory IDs.
14. Keep the caller bootstrap policy until Terraform destroy completes, and omit `InvokeAgentRuntimeCommand`.
15. Run local tests, configuration checks, Terraform formatting, and Terraform validation.
16. Run a saved Terraform plan and inspect its exact create actions.
17. Apply the reviewed plan with a temporary root profile override; keep `livenation-demo` as the committed default.
18. Wait for the harness to become ready.
19. Invoke one simple Kimi response with strict limits.
20. Invoke one tool prompt in one uninterrupted process and verify `tool_use`, synthetic evidence, `end_turn`, and token metadata.
21. If the tool prompt returns `end_turn` without tool use, retry once with an invocation override containing only the inline function.
22. Set one-day retention on any created AgentCore Runtime log group.
23. Save local evidence without committing credentials or Terraform state.

## IAM contracts

The caller bootstrap policy grants these AgentCore actions:

- `CreateHarness`, `GetHarness`, `ListHarnesses`, `ListHarnessVersions`, `UpdateHarness`, and `DeleteHarness`.
- `CreateAgentRuntime`, `GetAgentRuntime`, `ListAgentRuntimes`, `UpdateAgentRuntime`, and `DeleteAgentRuntime`.
- `CreateMemory`, `GetMemory`, `UpdateMemory`, and `DeleteMemory` because the Harness API requires these dependencies.
- `InvokeHarness`, `InvokeAgentRuntime`, `TagResource`, `UntagResource`, and `ListTagsForResource`.

The caller policy grants exact-role IAM lifecycle actions and scoped `iam:PassRole`.
The pass-role condition permits only `bedrock-agentcore.amazonaws.com`.
The policy does not grant `bedrock-agentcore:InvokeAgentRuntimeCommand`.

The execution role trust permits only `bedrock-agentcore.amazonaws.com` from this account and its `us-east-1` AgentCore resources.
It uses `StringEquals` for `aws:SourceAccount` and `ArnLike` for the wildcard `aws:SourceArn`.
Its policy grants direct Kimi invocation, ECR Public authentication, X-Ray, CloudWatch logs, metrics, and default workload identity.

## Verification

- `bun test`
- `bun run validate-setup`
- `terraform -chdir=infra fmt -check`
- `terraform -chdir=infra validate`
- `terraform -chdir=infra plan -out=../outputs/kimi-harness.tfplan`
- `terraform -chdir=infra show -no-color ../outputs/kimi-harness.tfplan`
- `terraform -chdir=infra apply ../outputs/kimi-harness.tfplan`
- `aws bedrock-agentcore-control get-harness ...`
- `bun run invoke-harness`

## Cost and rollback

The harness has no separate surcharge, but Runtime, Kimi, CloudWatch, and X-Ray usage can incur charges.
Runtime memory remains billable while a session stays warm.
The bounded verification uses two scenarios, three harness requests, and synthetic data only.

Use `terraform -chdir=infra destroy` to remove the managed harness and execution role.
After destruction, remove this project’s confirmed AgentCore Runtime log groups and caller bootstrap policy.

## Deployment outcome

The harness reached `READY` with ID `livenation_demo-1on72c4veC`.
Terraform provider 6.66.0 returned two service defaults after creation and marked the resource tainted.
The configuration now declares empty environment variables and a 150-message sliding window.
Terraform is untainted and reports no changes.

The simple live check returned `HARNESS_OK`.
The static plain-name allow-list did not expose the inline function to Kimi.
The client now supplies the single inline tool through the documented invocation override and verifies the tool name itself.
That path completed structured `tool_use`, returned synthetic evidence, and ended with `end_turn`.
Live verification proved that Kimi requires a wildcard allow-list for this override.
That wildcard also exposes the built-in `shell` and `file_operations` tools during the trusted demo invocation.

## Open questions

None. The user approved the deployment, paid invocation, IAM bootstrap, and live verification on September 25, 2026.
Kimi availability is `AUTHORIZED` and `AVAILABLE`, and a direct invocation returned `KIMI_OK` before this plan.
