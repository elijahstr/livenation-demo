import { FIGURES, FIGURE_CSS, POSITION_CSS, drawErd } from "./figures.ts";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
type PageOptions = { figures?: Record<string, string>; extraCss?: string; nav?: string[]; links?: string };
function blocks(source: string, digest = false, figures = FIGURES) {
  const lines = source.split("\n"), output: string[] = []; let index = 0, showNextTable = false;
  while (index < lines.length) {
    const line = lines[index];
    if (line === "<!-- digest:show-table -->") { showNextTable = true; index++; continue; }
    if (!line.trim() || line.startsWith("<!-- digest")) { index++; continue; }
    const figure = line.match(/^<!-- fig:([\w-]+) -->/);
    if (figure) { output.push(figures[figure[1]] ?? ""); index++; continue; }
    const detail = line.match(/^::: details (.+)$/);
    if (detail) { const body: string[] = []; index++; while (index < lines.length && lines[index] !== ":::") body.push(lines[index++]); if (lines[index] === ":::") index++; output.push(`<details class="reference" ontoggle="window.dispatchEvent(new Event('resize'))"><summary>${inline(detail[1])}</summary>${blocks(body.join("\n"), false, figures)}</details>`); continue; }
    const level = line.match(/^### (🎓 High School|🏛️ College|🔬 Pro)$/);
    if (level) {
      const tone = level[1].startsWith("🎓") ? "school" : level[1].startsWith("🏛️") ? "college" : "pro";
      const body: string[] = [];
      index++;
      while (index < lines.length && !/^### (🎓 High School|🏛️ College|🔬 Pro)$/.test(lines[index])) body.push(lines[index++]);
      output.push(`<article id="${tone === "school" ? "high-school" : tone}" class="level-card ${tone}"><p class="level-cue">Level ${tone === "school" ? "1" : tone === "college" ? "2" : "3"}</p><h3>${inline(level[1])}</h3>${blocks(body.join("\n"), false, figures)}</article>`);
      continue;
    }
    if (line.startsWith("### ")) { output.push(`<h3>${inline(line.slice(4))}</h3>`); index++; continue; }
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) {
      const rows = [line, lines[++index]];
      while ((lines[index + 1] ?? "").includes("|") && (lines[index + 1] ?? "").trim()) rows.push(lines[++index]);
      const cells = (value: string) => value.trim().replace(/^\||\|$/g, "").split("|");
      const table = `<div class="table"><table><thead><tr>${cells(rows[0]).map(value => `<th>${inline(value)}</th>`).join("")}</tr></thead><tbody>${rows.slice(2).map(row => `<tr>${cells(row).map(value => `<td>${inline(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      output.push(digest && !showNextTable ? `<details class="table-detail"><summary>Show field and rule table</summary>${table}</details>` : table); showNextTable = false; index++; continue;
    }
    if (/^[-*] /.test(line)) { const items: string[] = []; while (/^[-*] /.test(lines[index] ?? "")) items.push(`<li>${inline(lines[index++].slice(2))}</li>`); output.push(`<ul>${items.join("")}</ul>`); continue; }
    if (/^\d+\. /.test(line)) { const items: string[] = []; while (/^\d+\. /.test(lines[index] ?? "")) items.push(`<li>${inline(lines[index++].replace(/^\d+\. /, ""))}</li>`); output.push(`<ol>${items.join("")}</ol>`); continue; }
    const paragraph: string[] = [];
    while ((lines[index] ?? "").trim() && !/^### |^<!-- fig:|^<!-- digest|^[-*] |^\d+\. /.test(lines[index]) && !((lines[index] ?? "").includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? ""))) paragraph.push(lines[index++]);
    if (paragraph.length === 0) {
      output.push(`<p>${inline(line)}</p>`);
      index++;
      continue;
    }
    output.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return output.join("");
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
function section(name: string, body: string, digest: boolean, figures: Record<string, string>) {
  const source = body.trim().replace(/^<details>\n<summary>[^\n]*<\/summary>\n?/, "").replace(/\n<\/details>\s*$/, "");
  const content = blocks(source, digest, figures);
  if (name === "Technical reference") return `<section id="${slug(name)}"><details class="reference" ontoggle="if(this.open)window.dispatchEvent(new Event('resize'))"><summary>${inline(name)}</summary>${content}</details></section>`;
  return `<section id="${slug(name)}"><h2>${inline(name)}</h2>${content}</section>`;
}
export function page(md: string, digest = false, options: PageOptions = {}) {
  const figures = options.figures ?? FIGURES;
  const title = md.match(/^# (.+)$/m)?.[1] ?? "Proposal";
  const chipMatch = md.match(/<!-- chips:([^>]+) -->/);
  const chips = (chipMatch?.[1] ?? "").split("|").filter(Boolean).map(chip => `<span>${esc(chip)}</span>`).join("");
  const rawLead = md.split(/^## /m)[0].replace(/^# .+\n/, "").replace(/<!-- chips:[^>]+ -->/, "").trim();
  const firstLevel = rawLead.indexOf("### ");
  const lead = (firstLevel < 0 ? rawLead : rawLead.slice(0, firstLevel)).trim();
  const levels = firstLevel < 0 ? "" : rawLead.slice(firstLevel);
  const parts = md.split(/^## /m);
  const sections = parts.slice(1).map(part => ({ name: part.split("\n")[0], body: part.split("\n").slice(1).join("\n") }));
  const selected = sections;
  const content = `${blocks(levels, digest, figures)}${selected.map(({ name, body }) => section(name, body, digest, figures)).join("")}`;
  const links = digest ? (options.links ?? '<a href="/full">Read full proposal</a><a href="/raw">Markdown source</a>') : "";
  const nav = options.nav ?? ["High School", "College", "Pro", "Technical reference"];
  const navLinks = nav.map(item => `<a href="#${slug(item)}">${esc(item)}</a>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title><style>:root,:root[data-theme="dark"],:root[data-theme="light"]{color-scheme:light;--ink:#182522;--ink2:#42514d;--muted:#65736f;--line:#d5ddd6;--card:#fffefa;--paper:#f5f3ec;--accent:#14665c;--accent-line:#9ccabc;--disp:Georgia,serif;--sans:system-ui,sans-serif;--mono:ui-monospace,monospace}*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 var(--sans)}main{max-width:1150px;margin:auto;padding:48px 22px 76px}header{border-bottom:1px solid var(--line);padding-bottom:22px}h1{font:700 clamp(38px,6vw,64px)/1 var(--disp);max-width:18ch;margin:0 0 16px}h2{font:700 27px/1.2 var(--disp);margin:38px 0 14px}h3{font:700 18px/1.25 var(--sans)}p{color:var(--ink2)}a{color:var(--accent)}code{font:12px var(--mono);background:#e9eeea;padding:2px 4px;border-radius:4px}.stat-panel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;max-width:780px}.stat-panel p{margin:0;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--card);font-size:13px}.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.chips span{padding:5px 9px;border:1px solid var(--accent-line);border-radius:999px;background:#edf5f1;color:#245c52;font-size:12px;font-weight:800}.table{overflow:auto;border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%;min-width:680px;background:var(--card)}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top}th{background:#edf2ed}section{border-top:1px solid var(--line)}.table-detail{margin:14px 0;border:1px solid var(--line);border-radius:10px;background:var(--card)}.table-detail summary{padding:10px 12px;cursor:pointer;font-weight:700}.table-detail .table{border:0;border-top:1px solid var(--line);border-radius:0}.nav{display:flex;flex-wrap:wrap;gap:16px;margin-top:24px;font-weight:700}.level-card{margin:20px 0;padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--card)}.level-card.school{border-left:6px solid #b88945;background:#fff9ed}.level-card.college{border-left:6px solid #4f8c7b;background:#f0faf5}.level-card.pro{border-left:6px solid #527ba5;background:#f1f6fc}.level-card h3{margin:2px 0 10px;font:700 22px/1.2 var(--disp)}.level-card p{margin:10px 0}.level-card .level-cue{margin:0;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.reference{margin:28px 0;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}.reference>summary{cursor:pointer;font:700 22px/1.2 var(--disp)}.reference[open]>summary{margin-bottom:14px}${FIGURE_CSS}${POSITION_CSS}${options.extraCss ?? ""}@media(max-width:520px){main{padding:30px 14px 50px}.stat-panel{grid-template-columns:1fr}.fig{border-radius:12px}.level-card{padding:14px}}</style></head><body><main><header><h1>${esc(title)}</h1><div class="stat-panel">${blocks(lead, false, figures)}</div><div class="chips">${chips}</div><nav class="nav">${navLinks}${links}</nav></header>${content}<nav class="nav"><a href="#high-school">Back to High School</a>${links}</nav></main>${drawErd()}</body></html>`;
}
