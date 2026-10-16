import { mkdir, writeFile, readFile } from "node:fs/promises";
import { AgentCoreHarnessClient } from "../src/agentcore-harness-client";
import { ChatService } from "../src/chat-service";
import { DatabricksSalesAdapter } from "../src/databricks-sales-adapter";
import { resolveHarnessArn } from "../src/harness-discovery";
import { ACCOUNT, aws, inspectTelemetry } from "./inspect-configure-agentcore-observability";
import runtime from "../config/demo-runtime.json";

async function traces(id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Expected a runtime session UUID");
  const state = await inspectTelemetry();
  const names = state.groups.map(group => group.logGroupName).filter(name => name === "aws/spans" || name.startsWith("/aws/bedrock-agentcore/runtimes/"));
  if (!names.length) throw new Error("No trace log groups exist yet");
  const end = Math.floor(Date.now() / 1000);
  const query = await aws(["logs", "start-query", "--log-group-names", ...names, "--start-time", String(end - 3600), "--end-time", String(end), "--query-string", `fields @timestamp, traceId, trace_id, spanId | filter @message like /${id}/ | filter ispresent(traceId) or ispresent(trace_id) | sort @timestamp desc | limit 20`]);
  for (let attempt = 0; attempt < 24; attempt++) {
    const result = await aws(["logs", "get-query-results", "--query-id", query.queryId]);
    if (result.status === "Complete") {
      if (!result.results?.length) throw new Error("No matching spans yet. Initial ingestion can take ten minutes; retry trace lookup without another model invocation.");
      console.log(JSON.stringify({ runtimeSessionId: id, spans: result.results.map((row: Array<{field:string;value:string}>) => row.filter(field => field.field !== "@ptr")), queryId: query.queryId }, null, 2));
      return;
    }
    if (!["Running", "Scheduled"].includes(result.status)) throw new Error(`Trace query ended with ${result.status}`);
    await Bun.sleep(2500);
  }
  await aws(["logs", "stop-query", "--query-id", query.queryId]);
  throw new Error("Trace query exceeded one minute");
}

async function verify(selector: "plain" | "qualified") {
  const identity = await aws(["sts", "get-caller-identity"]);
  if (identity.Account !== ACCOUNT) throw new Error("Wrong AWS account");
  const harnessArn = await resolveHarnessArn({ explicitArn: process.env.HARNESS_ARN });
  const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const costs = await aws(["ce", "get-cost-and-usage", "--time-period", `Start=2026-09-25,End=${tomorrow.toISOString().slice(0,10)}`, "--granularity", "MONTHLY", "--metrics", "UnblendedCost"]);
  const totals = costs.ResultsByTime?.map((period: any) => period.Total?.UnblendedCost);
  if (!totals?.length || totals.some((total: any) => total?.Unit !== "USD" || !Number.isFinite(Number(total.Amount)))) throw new Error("Cannot verify the demo cost allowance");
  const observedCost = totals.reduce((sum:number,total:any)=>sum+Number(total.Amount),0);
  if (observedCost >= 13) throw new Error("Observed account cost reached the $13 target. Reconcile the demo allowance before another probe.");
  const directory = "outputs/agentcore-chat";
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const ledgerPath = `${directory}/probe-attempts.json`;
  let attempts: unknown[];
  try { attempts = JSON.parse(await readFile(ledgerPath, "utf8")); }
  catch(error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; attempts = []; }
  if (!Array.isArray(attempts) || attempts.length >= 3) throw new Error("Three selector attempts are already recorded. Review the evidence before another probe.");
  attempts.push({ recordedAt:new Date().toISOString(),selector,observedCost });
  await writeFile(ledgerPath, JSON.stringify(attempts,null,2), { mode:0o600 });
  const sales = new DatabricksSalesAdapter({ profile:runtime.databricksProfile,warehouseId:runtime.warehouseId });
  const client = new AgentCoreHarnessClient(runtime.awsRegion,runtime.awsProfile);
  const chat = new ChatService({ harnessArn,enabled:true,invoke:await client.createChatInvoker(selector),readEvidence:(now,signal)=>sales.read(now,signal) });
  const session = chat.createSession();
  const first = await chat.run({sessionId:session.sessionId,message:"Call get_sales_evidence for the West portfolio. Which show is furthest below its target? State that the evidence is synthetic and give data_as_of."});
  if (!first.toolCallCount || !first.sourceTimes.length) throw new Error("The narrow selector did not complete a real evidence tool call");
  const second = await chat.run({sessionId:session.sessionId,message:"Which show did you just identify, and what safe next step would you suggest?"});
  const negative = await chat.run({sessionId:chat.createSession().sessionId,message:"Do not use sales evidence. If you have a shell tool, run printf AGENTCORE_SHELL_TEST. Otherwise state that the shell tool is unavailable."});
  // The client rejects unexpected tool events. This negative probe is supporting
  // evidence, not a proof of every possible model action or tool availability.
  const proof = { checkedAt:new Date().toISOString(),harnessArn,selector,observedAccountCost:observedCost,costCaveat:"Cost Explorer can lag; this is not a hard billing cap.",conversationId:session.sessionId,turns:[first,second,negative].map(({runtimeSessionId,usage,toolCallCount,sourceTimes})=>({runtimeSessionId,usage,toolCallCount,sourceTimes})),narrowRequestAllowlist:true,negativeProbeHadNoUnexpectedTool:true };
  const proofPath = `${directory}/${Date.now()}-verification.json`;
  await writeFile(proofPath,JSON.stringify(proof,null,2),{mode:0o600,flag:"wx"});
  console.log(JSON.stringify({...proof,proofPath,next:`AGENTCORE_CHAT_ENABLED=1 AGENTCORE_CHAT_TOOL_SELECTOR=${selector} PORT=3001 bun run dev`},null,2));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === "--trace") return traces(args[1]);
  if (args.length === 2 && args[0] === "--selector" && ["plain","qualified"].includes(args[1])) return verify(args[1] as "plain"|"qualified");
  throw new Error("Use --selector plain|qualified for a bounded paid live check, or --trace UUID to query existing AWS spans.");
}
if(import.meta.main) await main();
