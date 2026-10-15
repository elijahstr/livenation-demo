import { FIGURES, FIGURE_CSS, POSITION_CSS, drawErd } from "./figures.ts";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
function blocks(source: string, digest = false) {
  const lines = source.split("\n"), output: string[] = []; let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || line.startsWith("<!-- digest")) { index++; continue; }
    const figure = line.match(/^<!-- fig:([\w-]+) -->/);
    if (figure) { output.push(FIGURES[figure[1]] ?? ""); index++; continue; }
    if (line.startsWith("### ")) { output.push(`<h3>${inline(line.slice(4))}</h3>`); index++; continue; }
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) {
      const rows = [line, lines[++index]];
      while ((lines[index + 1] ?? "").includes("|") && (lines[index + 1] ?? "").trim()) rows.push(lines[++index]);
      const cells = (value: string) => value.trim().replace(/^\||\|$/g, "").split("|");
      const table = `<div class="table"><table><thead><tr>${cells(rows[0]).map(value => `<th>${inline(value)}</th>`).join("")}</tr></thead><tbody>${rows.slice(2).map(row => `<tr>${cells(row).map(value => `<td>${inline(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      output.push(digest ? `<details class="table-detail"><summary>Show field and rule table</summary>${table}</details>` : table); index++; continue;
    }
    if (/^[-*] /.test(line)) { const items: string[] = []; while (/^[-*] /.test(lines[index] ?? "")) items.push(`<li>${inline(lines[index++].slice(2))}</li>`); output.push(`<ul>${items.join("")}</ul>`); continue; }
    if (/^\d+\. /.test(line)) { const items: string[] = []; while (/^\d+\. /.test(lines[index] ?? "")) items.push(`<li>${inline(lines[index++].replace(/^\d+\. /, ""))}</li>`); output.push(`<ol>${items.join("")}</ol>`); continue; }
    const paragraph: string[] = [];
    while ((lines[index] ?? "").trim() && !/^### |^<!-- fig:|^<!-- digest|^[-*] |^\d+\. /.test(lines[index]) && !((lines[index] ?? "").includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? ""))) paragraph.push(lines[index++]);
    output.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return output.join("");
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
function section(name: string, body: string, digest: boolean) { return `<section id="${slug(name)}"><h2>${inline(name)}</h2>${blocks(body, digest)}</section>`; }
export function page(md: string, digest = false) {
  const title = md.match(/^# (.+)$/m)?.[1] ?? "Proposal";
  const parts = md.split(/^## /m), lead = parts[0].replace(/^# .+\n/, "").trim();
  const sections = parts.slice(1).map(part => ({ name: part.split("\n")[0], body: part.split("\n").slice(1).join("\n") }));
  const selected = digest ? sections.filter(({ name }) => /^(Goal|Decisions|1\.|2\.|3\.|4\.|5\.|6\.|Open questions)/.test(name)) : sections;
  const content = selected.map(({ name, body }) => section(name, digest && /^1\./.test(name) ? body.replace(/<!-- fig:pipeline -->/, "") : body, digest)).join("");
  const links = digest ? '<a href="/full">Read full proposal</a><a href="/raw">Markdown source</a>' : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title><style>:root,:root[data-theme="dark"],:root[data-theme="light"]{color-scheme:light;--ink:#182522;--ink2:#42514d;--muted:#65736f;--line:#d5ddd6;--card:#fffefa;--paper:#f5f3ec;--accent:#14665c;--accent-line:#9ccabc;--disp:Georgia,serif;--sans:system-ui,sans-serif;--mono:ui-monospace,monospace}*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 var(--sans)}main{max-width:1150px;margin:auto;padding:48px 22px 76px}header{border-bottom:1px solid var(--line);padding-bottom:22px}h1{font:700 clamp(38px,6vw,64px)/1 var(--disp);max-width:18ch;margin:0 0 16px}h2{font:700 27px/1.2 var(--disp);margin:38px 0 14px}h3{font:700 18px/1.25 var(--sans)}p{color:var(--ink2)}a{color:var(--accent)}code{font:12px var(--mono);background:#e9eeea;padding:2px 4px;border-radius:4px}.stat-panel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;max-width:780px}.stat-panel p{margin:0;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--card);font-size:13px}.table{overflow:auto;border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%;min-width:680px;background:var(--card)}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top}th{background:#edf2ed}section{border-top:1px solid var(--line)}.table-detail{margin:14px 0;border:1px solid var(--line);border-radius:10px;background:var(--card)}.table-detail summary{padding:10px 12px;cursor:pointer;font-weight:700}.table-detail .table{border:0;border-top:1px solid var(--line);border-radius:0}.nav{display:flex;flex-wrap:wrap;gap:16px;margin-top:24px;font-weight:700}${FIGURE_CSS}${POSITION_CSS}@media(max-width:520px){main{padding:30px 14px 50px}.stat-panel{grid-template-columns:1fr}.fig{border-radius:12px}}</style></head><body><main><header><h1>${esc(title)}</h1><div class="stat-panel">${blocks(lead)}</div><nav class="nav"><a href="#architecture">Architecture</a><a href="#2-a-relational-core-prevents-false-customer-evidence">Relationship diagram</a><a href="#open-questions">Open questions</a>${links}</nav></header><section id="architecture"><h2>Architecture</h2>${FIGURES.pipeline}</section>${content}<nav class="nav"><a href="#architecture">Back to architecture</a>${links}</nav></main>${drawErd()}</body></html>`;
}
