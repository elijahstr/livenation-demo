import { expect, test } from "bun:test";
import { callerPermissions, rollbackPermissions, waitForTraceDestination } from "../scripts/inspect-configure-agentcore-observability";

test("prints rollback-only delete permission separately from apply permissions", () => {
  expect(JSON.stringify(callerPermissions)).not.toContain("DeleteResourcePolicy");
  expect(rollbackPermissions.Statement[0].Action).toEqual(["logs:DeleteResourcePolicy"]);
  expect(JSON.stringify(rollbackPermissions)).not.toContain("DeleteLogGroup");
});
test("waits until CloudWatch destination is ACTIVE", async () => {
  let reads = 0;
  let delays = 0;
  await waitForTraceDestination(async () => { reads++; return { Destination: "CloudWatchLogs", Status: reads === 2 ? "ACTIVE" : "PENDING" }; }, async () => { delays++; });
  expect(reads).toBe(2);
  expect(delays).toBe(1);
});
test("does not report success for another destination", async () => {
  await expect(waitForTraceDestination(async () => ({ Destination: "XRay", Status: "ACTIVE" }), async () => {}, 2)).rejects.toThrow("not active");
});
