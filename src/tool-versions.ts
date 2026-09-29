export const DATABRICKS_CLI_VERSION = "1.18.0";

export function assertDatabricksCliVersion(output: string, exitCode: number): void {
  if (exitCode !== 0 || !output.includes(DATABRICKS_CLI_VERSION)) {
    throw new Error(`This preparation bundle requires Databricks CLI ${DATABRICKS_CLI_VERSION}`);
  }
}
