import { guide } from "./render.ts";

const root = new URL(".", import.meta.url);
const read = (path: string) => Bun.file(new URL(path, root)).text();
const files: Array<[string, string, string, boolean?]> = [
  ["appendix-plan", "Complete implementation plan", "../../plans/2026-10-20-regional-account-flow.md"],
  ["appendix-architecture", "Earlier architecture decisions", "architecture-decisions.md"],
  ["appendix-contracts", "Retrieval contracts", "retrieval-contracts.md"],
  ["appendix-talk-track", "Demo talk track", "demo-talk-track.md"],
  ["appendix-regional-sales-review", "Regional sales review skill", "skills/regional-sales-review/SKILL.md"],
  ["appendix-sales-evidence-judgment", "Sales evidence judgment skill", "skills/sales-evidence-judgment/SKILL.md"],
  ["appendix-system-prompt", "System prompt", "system-prompt.md"],
  ["appendix-genie-context", "Earlier Genie context", "genie-context.md"],
  ["appendix-tool-definitions", "Tool definitions JSON", "tool-definitions.json", true],
  ["appendix-response-schemas", "Response schemas JSON", "response-schemas.json", true],
  ["appendix-evaluation-cases", "Evaluation cases JSON", "evaluation-cases.json", true],
  ["appendix-contract-examples", "Contract examples JSON", "contract-examples.json", true],
  ["appendix-scale-evidence", "Scale evidence JSON", "scale-evidence-2026-10-19.json", true],
  ["appendix-live-verification", "Live browser verification JSON", "live-verification-2026-10-20.json", true],
];
const appendices = await Promise.all(files.map(async ([id, title, path, json]) => ({id, title, text: await read(path), json})));
await Bun.write(new URL("regional-scan-review.html", root), guide(await read("guide.md"), await read("architecture-decisions.md"), appendices));
console.log("regional-scan-review.html");
