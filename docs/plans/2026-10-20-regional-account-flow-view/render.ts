import { FIGURES, FIGURE_CSS } from "./figures.ts";

type Section = { heading: string; body: string };
type Document = { title: string; preamble: string; sections: Section[] };
const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const inline = (value: string) => esc(value).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\(([^ )]+)\)/g, '<a href="$2">$1</a>');

function parse(markdown: string): Document {
  const lines = markdown.split("\n"); const title = lines.find((line) => line.startsWith("# "))?.slice(2) ?? "";
  const sections: Section[] = []; let preamble = ""; let current: Section | undefined;
  for (const line of lines.slice(lines.indexOf(`# ${title}`) + 1)) {
    if (line.startsWith("## ")) { current = { heading: line.slice(3), body: "" }; sections.push(current); }
    else if (current) current.body += `${line}\n`; else preamble += `${line}\n`;
  }
  return { title, preamble, sections };
}
function blocks(source: string): string {
  const lines = source.trim().split("\n"); const output: string[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!; const figure = line.match(/^<!-- fig:([\w-]+) -->$/);
    if (!line) { i++; continue; }
    if (figure) { output.push(FIGURES[figure[1]!] ?? ""); i++; continue; }
    if (line.startsWith("- ")) { const items: string[] = []; while (lines[i]?.startsWith("- ")) items.push(`<li>${inline(lines[i++]!.slice(2))}</li>`); output.push(`<ul>${items.join("")}</ul>`); continue; }
    if (/^\d+\. /.test(line)) { const items: string[] = []; while (/^\d+\. /.test(lines[i] ?? "")) items.push(`<li>${inline(lines[i++]!.replace(/^\d+\. /, ""))}</li>`); output.push(`<ol>${items.join("")}</ol>`); continue; }
    if (line.startsWith("### ")) { output.push(`<h3>${inline(line.slice(4))}</h3>`); i++; continue; }
    const words: string[] = []; while (lines[i] && !lines[i]!.startsWith("- ") && !/^\d+\. /.test(lines[i]!) && !lines[i]!.startsWith("### ") && !lines[i]!.startsWith("<!-- fig:")) words.push(lines[i++]!);
    output.push(`<p>${inline(words.join(" "))}</p>`);
  }
  return output.join("\n");
}
const section = (doc: Document, heading: string) => doc.sections.find((item) => item.heading === heading)?.body ?? "";
const page = (title: string, content: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title><style>${CSS}</style></head><body>${content}</body></html>`;
const CSS = `:root,:root[data-theme="dark"],:root[data-theme="light"]{color-scheme:light;--ink:#172129;--muted:#5d6972;--line:#d3dce1;--paper:#f4f7f7;--paper2:#fff;--accent:#006a68;--display:Georgia,serif;--sans:ui-sans-serif,system-ui,sans-serif;--mono:ui-monospace,monospace}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans)}main{width:min(1020px,100%);margin:auto;padding:48px 22px 72px}header{padding-bottom:24px;border-bottom:1px solid var(--line)}h1{max-width:20ch;margin:0;font:700 clamp(38px,6vw,64px)/1.03 var(--display);letter-spacing:-.035em}h2{margin:0 0 13px;font:700 24px/1.2 var(--display)}h3{margin:25px 0 8px;font-size:17px}p,li{font-size:15px;line-height:1.62}p{color:#334048}a{color:var(--accent);font-weight:700}code{padding:2px 5px;border-radius:4px;background:#e8eeee;color:#135b58;font:12px var(--mono)}.hero,.card,.full{margin-top:18px;padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--paper2)}.cards{display:grid;grid-template-columns:1fr 1fr;gap:16px}.open{border-color:#bbaeda;background:#faf7ff}.links{display:flex;gap:16px;flex-wrap:wrap;margin-top:18px}.full section+section{margin-top:34px;padding-top:30px;border-top:1px solid var(--line)}ul,ol{padding-left:21px}li+li{margin-top:7px}${FIGURE_CSS}@media(max-width:650px){main{padding:28px 15px 52px}.cards{grid-template-columns:1fr}.hero,.card,.full{padding:17px}}`;

export function digest(markdown: string): string { const doc = parse(markdown); const goal = section(doc, "Goal").replace(/^<!-- fig:regional-account-flow -->$/m, ""); return page(doc.title, `<main><header><h1>${inline(doc.title)}</h1>${blocks(doc.preamble)}</header><section class="hero"><h2>Goal</h2>${blocks(goal)}</section>${FIGURES["regional-account-flow"]}<div class="cards"><section class="card"><h2>Locked decisions</h2>${blocks(section(doc, "Locked decisions"))}</section><section class="card open"><h2>Open questions</h2>${blocks(section(doc, "Open questions"))}</section></div><nav class="links"><a href="/full">Full document</a><a href="/raw">Raw Markdown</a></nav></main>`); }
export function content(markdown: string): string { const doc = parse(markdown); return page(doc.title, `<main><header><h1>${inline(doc.title)}</h1>${blocks(doc.preamble)}</header><article class="full">${doc.sections.map((item) => `<section><h2>${inline(item.heading)}</h2>${blocks(item.body)}</section>`).join("")}</article></main>`); }
