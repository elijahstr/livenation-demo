# Live Nation AI sales demo

This public repository is an independent interview demo. It is not an official Live Nation product.

## Start the UI and server

The hosted flow requires these local prerequisites:

- Bun
- AWS CLI `2.36.49`
- Terraform CLI `1.16.3`
- Databricks CLI `1.18.0`
- Configured `livenation-demo` profiles for AWS and Databricks

From the repository root, install the locked dependencies and start the server:

```sh
bun install --frozen-lockfile
export AWS_PROFILE=livenation-demo
export DATABRICKS_PROFILE=livenation-demo
export HARNESS_ARN="$(terraform -chdir=infra output -raw harness_arn)"
bun run dev
```

Open `http://127.0.0.1:3000`.

## Interview slide deck

The static deck source is in [`slides/`](slides/).
Open the live five-slide deck at [elijahstr.github.io/livenation-demo](https://elijahstr.github.io/livenation-demo/).
GitHub Pages publishes the static runtime files and supplied brand assets from the `gh-pages` branch.
