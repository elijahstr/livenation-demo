# CLI install due diligence

Checked 2026-09-28. This note uses vendor documentation, source repositories, release records, and npm registry APIs.

## Resolution

The user approved the corrected dependency path on 2026-09-28.
Terraform `1.16.3` now comes from HashiCorp's official release archive and verified tap checksum.
Databricks CLI `1.18.0` now comes from its official Homebrew tap.
The application now declares `@aws-sdk/client-bedrock-agentcore@3.1140.0` as an exact project dependency.
The application no longer resolves the SDK through the global AgentCore CLI.
The Databricks version policy now accepts `1.18.0`.
The original assessment below records the pre-change state.

> **Original objection — resolved.** The AgentCore CLI did not supply the SDK layout or exact SDK version that the application required. The Databricks version policy also rejected the current official release.

## Original decision

Do not install a new tool until the following three repository defects have a decided fix:

1. `src/agentcore-harness-client.ts` resolves the SDK relative to the global `agentcore` executable. The official CLI installs as the npm package `@aws/agentcore`; Node does not make global package dependencies project dependencies. The path calculation also does not point to the CLI package's normal `node_modules` location.
2. The code requires `@aws-sdk/client-bedrock-agentcore` exactly at `3.1140.0`. The official `@aws/agentcore@0.30.0` shrinkwrap pins `3.1114.0`. It cannot meet the check. The supported solution is an approved, exact project dependency or a revised adapter. The CLI is not a substitute.
3. `src/tool-versions.ts` requires Databricks CLI `1.17.0`. The official tap now installs `1.18.0`. The current formula does not provide a `databricks@1.17` formula.

These findings are verified from the local source, the [AgentCore CLI `package.json`](https://github.com/aws/agentcore-cli/blob/v0.30.0/package.json), its [shrinkwrap](https://raw.githubusercontent.com/aws/agentcore-cli/v0.30.0/npm-shrinkwrap.json), and the [Databricks tap formula](https://raw.githubusercontent.com/databricks/homebrew-tap/main/Formula/databricks.rb).

## Terraform

| Item | Verified finding |
| --- | --- |
| Exact name and owner | `terraform`, from HashiCorp/IBM. The official macOS route identifies `hashicorp/tap/terraform`. [Install guide](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli) |
| Typosquatting check | The name and the `hashicorp/tap` owner match HashiCorp's own installation page. This check does not prove that no lookalike package exists. |
| Current stable release | `v1.16.4`, published 2026-09-23. [Release](https://github.com/hashicorp/terraform/releases/tag/v1.16.4) |
| Maintenance and cadence | The release history shows stable releases on 2026-09-09, 2026-09-16, and 2026-09-23. The upstream repository has active commits. [Releases](https://github.com/hashicorp/terraform/releases) · [source](https://github.com/hashicorp/terraform) |
| License | BUSL-1.1 with the additional use grant in the [v1.16.4 license](https://raw.githubusercontent.com/hashicorp/terraform/v1.16.4/LICENSE). It is not MPL-2.0. |
| Usage signal | No vendor registry metric applies. GitHub reported 49,785 stars and 10,636 forks at check time. [Repository API](https://api.github.com/repos/hashicorp/terraform) |
| Problem here | It reads the deployed Harness ARN from the local Terraform state. `HARNESS_ARN` removes this runtime need. |
| Alternatives | Set the non-secret `HARNESS_ARN` explicitly. Use the AWS CLI to query the Harness. Store a reviewed runtime configuration value. |
| macOS arm64 route | `brew tap hashicorp/tap`, then `brew install hashicorp/tap/terraform`. The route adds the official HashiCorp Homebrew tap. [Install guide](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli) |

## Databricks CLI

| Item | Verified finding |
| --- | --- |
| Exact name and owner | Executable and formula: `databricks`; package source: Databricks. The official tap is `databricks/tap`. [Install guide](https://docs.databricks.com/aws/en/dev-tools/cli/install) |
| Typosquatting check | The command, tap, and `databricks/homebrew-tap` repository match Databricks' official page. This check does not prove that no lookalike package exists. |
| Current stable release | `v1.18.0`, published 2026-09-24. [Release](https://github.com/databricks/cli/releases/tag/v1.18.0) |
| Maintenance and cadence | Releases `v1.15.0` through `v1.18.0` occurred from 2026-09-03 through 2026-09-24. The source repository is active. [Releases](https://github.com/databricks/cli/releases) · [source](https://github.com/databricks/cli) |
| License | The vendor [Databricks License](https://raw.githubusercontent.com/databricks/cli/v1.18.0/LICENSE) permits use with Databricks Services. It is not an OSI license. |
| Usage signal | No vendor package-registry metric applies. GitHub reported 402 stars and 242 forks at check time. [Repository API](https://api.github.com/repos/databricks/cli) |
| Problem here | The local server uses the configured CLI profile to run the Databricks SQL Statement Execution request. |
| Alternatives | Use the Databricks SDK or direct REST API. Both require an approved application dependency or an authenticated HTTP implementation. |
| macOS arm64 route | `brew tap databricks/tap`; `brew trust databricks/tap`; `brew install databricks`. The tap is a third-party Homebrew source, owned by Databricks. Homebrew 6 requires explicit trust. The formula selects the `darwin_arm64` release archive. [Install guide](https://docs.databricks.com/aws/en/dev-tools/cli/install) · [formula](https://raw.githubusercontent.com/databricks/homebrew-tap/main/Formula/databricks.rb) |

Before the resolution, the application pinned `1.17.0`, which the project released on 2026-09-16. The current formula installs `1.18.0`.

## Amazon Bedrock AgentCore CLI

| Item | Verified finding |
| --- | --- |
| Exact name and owner | npm package `@aws/agentcore`; executable `agentcore`; publisher source repository `aws/agentcore-cli`. AWS documents this exact installation. [AWS guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-get-started-cli.html) |
| Typosquatting check | The npm scope `@aws`, package name, repository, and AWS installation page agree. This check does not prove that no lookalike npm package exists. |
| Current stable release | `0.30.0`, published 2026-09-15. [npm metadata](https://registry.npmjs.org/@aws/agentcore/0.30.0) · [release](https://github.com/aws/agentcore-cli/releases/tag/v0.30.0) |
| Maintenance and cadence | npm metadata records 89 versions since 2026-02-12. The last stable release is `0.30.0`; later GitHub tags are release candidates or prereleases. [npm metadata](https://registry.npmjs.org/@aws/agentcore) · [releases](https://github.com/aws/agentcore-cli/releases) |
| License | Apache-2.0. [Source license](https://github.com/aws/agentcore-cli/blob/v0.30.0/LICENSE) |
| Usage signal | npm recorded 18,961 downloads during 2026-09-21 through 2026-09-27. [npm downloads API](https://api.npmjs.org/downloads/point/2026-09-21:2026-09-27/@aws%2Fagentcore) |
| Problem here | None at application runtime. It supports creating and deploying AgentCore projects. This repository uses the SDK directly to invoke an existing Harness. |
| Alternatives | Use the AWS CLI, a direct AWS SDK project dependency, or a signed HTTP SigV4 client. The AWS SDK is the direct API interface. [AWS interfaces](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/develop-agents.html) |
| macOS arm64 route | Install Node.js 20 or later, then run `npm install -g @aws/agentcore`. This route adds a package from the npm registry. It adds no Homebrew tap. The package is JavaScript, not an architecture-specific native executable. [AWS guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-get-started-cli.html) |

## Required AWS SDK

The repository asks for `@aws-sdk/client-bedrock-agentcore@3.1140.0`. This npm package exists. It is Apache-2.0 and comes from [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3). The registry published it on 2026-09-24 and includes a SHA-512 integrity value. [Package metadata](https://registry.npmjs.org/@aws-sdk/client-bedrock-agentcore/3.1140.0)

npm recorded 885,664 downloads for this SDK package during 2026-09-21 through 2026-09-27. [Downloads API](https://api.npmjs.org/downloads/point/2026-09-21:2026-09-27/@aws-sdk%2Fclient-bedrock-agentcore)

`@aws/agentcore@0.30.0` declares `@aws-sdk/client-bedrock-agentcore` as `^3.1114.0`, but its checked-in shrinkwrap resolves `3.1114.0`. It does not bundle `3.1140.0`. This is a verified incompatibility with the repository's exact version check, not a guess.

## Install-source summary

| Tool | New source or registry | Permission needed after this research |
| --- | --- | --- |
| Terraform | HashiCorp release archive with the checksum from `hashicorp/tap` history | Approved and installed at the repository pin, `1.16.3`. |
| Databricks CLI | `databricks/tap` Homebrew tap and explicit Homebrew trust | Approved and installed at `1.18.0`. |
| AgentCore CLI | npm registry package `@aws/agentcore` | Not installed because it cannot provide the required SDK contract. |
| Required SDK | npm registry package `@aws-sdk/client-bedrock-agentcore@3.1140.0` | Approved and installed as an exact project dependency. |

No guesses appear in the installation recommendation. GitHub stars and forks are adoption signals, not usage counts.
