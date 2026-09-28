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

## Interview slide deck

The static deck source is in [`slides/`](slides/).
GitHub Pages was disabled before this deployment sequence.
The final Pages URL remains unknown until GitHub reports the deployment result.
