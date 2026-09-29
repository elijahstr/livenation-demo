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

## AWS CLI v2

> **Objection — resolve before a shared IAM-user login.** An IAM user must have the AWS managed `SignInLocalDevelopmentAccess` policy before `aws login` can create its local session. A root user needs no extra policy, but AWS treats root authentication as a higher-risk option. Use a dedicated demo IAM user when it exists. [AWS sign-in guide](https://docs.aws.amazon.com/signin/latest/userguide/command-line-sign-in.html)

| Item | Verified finding |
| --- | --- |
| Exact product, publisher, and source | The required product is **AWS Command Line Interface v2**, executable `aws`, published and maintained by AWS. The source repository is [aws/aws-cli](https://github.com/aws/aws-cli). AWS documents the package at the official [`awscli.amazonaws.com`](https://awscli.amazonaws.com/) download endpoint. |
| Version and cooldown | `2.36.49` was tagged by the AWS CLI release automation on 2026-09-18. At 2026-09-29T00:15Z, it was more than 72 hours old, so it passes the repository cooldown. [Official release](https://github.com/aws/aws-cli/releases/tag/2.36.49) |
| Typosquatting check | The product name, the `aws` command, the `aws/aws-cli` repository, and the `awscli.amazonaws.com` installer endpoint agree. This check cannot prove that no lookalike exists. |
| Usage metric | AWS provides no first-party public install or download metric. No usage count is asserted. The public repository has active issues and pull requests, but these are maintenance signals, not usage metrics. [Repository](https://github.com/aws/aws-cli) |
| Maintenance and cadence | AWS published adjacent `2.36.x` releases and maintains a current changelog. This is active maintenance. The release history shows frequent, usually daily, patch releases; cadence is an observation, not a support commitment. [Changelog](https://raw.githubusercontent.com/aws/aws-cli/2.36.49/CHANGELOG.rst) |
| License | Apache License 2.0. [v2.36.49 license](https://raw.githubusercontent.com/aws/aws-cli/2.36.49/LICENSE.txt) |
| Problem here | The CLI supplies the `aws` command that the repository validates and uses with the `livenation-demo` credential profile. It can read AWS resources and validate the deployed AgentCore Harness configuration. |
| Alternatives | The AWS SDK supplies programmatic calls but does not replace shell commands or the repository CLI version validation. The AWS Console cannot supply automated local calls. An SDK-only path needs a repository design change. |
| Official macOS arm64 route | Use the versioned AWS macOS installer: `https://awscli.amazonaws.com/AWSCLIV2-2.36.49.pkg`. AWS documents the versioned filename rule and the macOS package route. A check of this official package found a universal binary with both `x86_64` and `arm64` slices; this is a local verification, not an AWS documentation claim. [Past-release install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-version.html) · [macOS support](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| Verification | Run `pkgutil --check-signature AWSCLIV2.pkg` before install. A local check on 2026-09-28 reported Apple notarization and `Developer ID Installer: AMZN Mobile LLC (94KV3E626L)`, timestamped 2026-09-18 19:03:56 UTC. The observed SHA-256 was `6ced2166d7299b2c503684431dbd50bddc279aab4beeb94efa5bbc220bc0e6b3`. AWS does not publish a macOS-PKG checksum or detached signature in its install guide. Treat the hash as a local observation, not an AWS-published expected value. |
| Administrator rights | A system install uses `sudo installer -pkg AWSCLIV2.pkg -target /`. A current-user install can use the package choice XML and a writable directory; it needs no administrator rights when the executable symlink also targets a writable directory. [Past-release install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-version.html) |

**Safest `livenation-demo` profile route.** Do not place access keys in shell history, `.env`, source control, or command output. For a root, IAM-user, or IAM-federated console identity, `aws login --profile livenation-demo --region us-east-1` opens browser authentication and writes temporary credentials for that named profile. It works with an IAM user when that user has `SignInLocalDevelopmentAccess`; it works with a root user without that policy. The session lasts up to 12 hours. Repeat the same command to restore or renew the profile. Then use `aws sts get-caller-identity --profile livenation-demo` to validate identity without printing secrets. [AWS login](https://docs.aws.amazon.com/signin/latest/userguide/command-line-sign-in.html) · [named profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)

`aws configure sso` plus `aws sso login --profile livenation-demo` is required only for an IAM Identity Center setup. Long-lived access keys are not required for `aws login`, and AWS advises against IAM-user credentials for normal development. If the user cannot use console login or IAM Identity Center, access keys remain a fallback. Store them only in the AWS credentials file and do not print them. [AWS authentication options](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)

## Install-source summary

| Tool | New source or registry | Permission needed after this research |
| --- | --- | --- |
| Terraform | HashiCorp release archive with the checksum from `hashicorp/tap` history | Approved and installed at the repository pin, `1.16.3`. |
| Databricks CLI | `databricks/tap` Homebrew tap and explicit Homebrew trust | Approved and installed at `1.18.0`. |
| AgentCore CLI | npm registry package `@aws/agentcore` | Not installed because it cannot provide the required SDK contract. |
| Required SDK | npm registry package `@aws-sdk/client-bedrock-agentcore@3.1140.0` | Approved and installed as an exact project dependency. |
| AWS CLI | Signed AWS macOS package `AWSCLIV2-2.36.49.pkg` | Approved and installed for the current user at `2.36.49`. |

No guesses appear in the installation recommendation. GitHub stars and forks are adoption signals, not usage counts.
