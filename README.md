# Live Nation AI sales demo

This public repository is an independent interview demo. It is not an official Live Nation product.

## Start the UI and server

From the repository root, run:

```sh
export AWS_PROFILE=livenation-demo
export DATABRICKS_PROFILE=livenation-demo
export HARNESS_ARN="$(terraform -chdir=infra output -raw harness_arn)"
bun run dev
```

Open `http://127.0.0.1:3000`.
