import { FIGURES, FIGURE_CSS } from "./figures.ts";

type Section = { heading: string; source: string };
type Document = { title: string; preamble: string; sections: Section[] };

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function inline(value: string) {
  const code: string[] = [];
  const start = String.fromCharCode(0xe000), end = String.fromCharCode(0xe001);
  let result = value.replace(/`([^`]+)`/g, (_m, item: string) => `${start}${code.push(`<code>${escape(item)}</code>`) - 1}${end}`);
  result = escape(result).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\.\.?\/[^)\s]+)\)/g, '<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return result.replace(new RegExp(`${start}(\\d+)${end}`, "g"), (_m, i: string) => code[Number(i)] ?? "");
}
function parse(markdown: string): Document {
  const lines = markdown.split("\n"), titleIndex = lines.findIndex((line) => line.startsWith("# "));
  const sections: Section[] = []; let preamble = ""; let current: Section | undefined;
  for (const line of lines.slice(titleIndex + 1)) {
    if (line.startsWith("## ")) { current = { heading: line.slice(3), source: "" }; sections.push(current); }
    else if (current) current.source += `${line}\n`; else preamble += `${line}\n`;
  }
  return { title: titleIndex >= 0 ? lines[titleIndex].slice(2) : "", preamble, sections };
}
function blocks(source: string): string {
  const lines = source.trim().split("\n"), output: string[] = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || /^<!--\s*digest:(start|end)\s*-->$/.test(line)) { i++; continue; }
    const fig = line.match(/^<!--\s*fig:([a-z0-9-]+)\s*-->$/); if (fig) { output.push(FIGURES[fig[1]] ?? ""); i++; continue; }
    const heading = line.match(/^###\s+(.+)$/); if (heading) { output.push(`<h3>${inline(heading[1])}</h3>`); i++; continue; }
    if (/^-\s+/.test(line)) { const items: string[] = []; while (i < lines.length && /^-\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].slice(2))}</li>`); output.push(`<ul>${items.join("")}</ul>`); continue; }
    if (/^\d+\.\s+/.test(line)) { const items: string[] = []; while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\d+\.\s+/, ""))}</li>`); output.push(`<ol>${items.join("")}</ol>`); continue; }
    const paragraph: string[] = []; while (i < lines.length && lines[i].trim() && !/^(<!--|###\s|[-]\s|\d+\.\s)/.test(lines[i])) paragraph.push(lines[i++]); output.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return output.join("\n");
}
const section = (document: Document, name: string) => document.sections.find((item) => item.heading === name)?.source ?? "";
const CSS = `:root,:root[data-theme="dark"],:root[data-theme="light"]{color-scheme:light;--ink:#191919;--muted:#626262;--line:#d9d9d9;--paper:#f7f7f5;--red:#ed1c24;--display:Arial,Helvetica,sans-serif;--sans:Arial,Helvetica,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;font-family:var(--sans)}*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:var(--paper);color:var(--ink)}main{width:min(1050px,100%);margin:auto;padding:48px 24px 72px}header.masthead{border-bottom:5px solid var(--red);padding-bottom:22px}h1{max-width:18ch;margin:0;font:800 clamp(40px,7vw,70px)/.96 var(--display);letter-spacing:-.055em}h2{font:800 25px/1.1 var(--display);letter-spacing:-.025em}h3{margin:27px 0 8px;font:800 16px/1.2 var(--sans)}p,li{color:#333;font-size:15px;line-height:1.6}p{margin:0 0 13px}a{color:#a30007;font-weight:750;text-underline-offset:3px}code{padding:2px 5px;border-radius:4px;background:#e9e9e9;font:12px var(--mono)}.hero,.card,.full{margin-top:22px;border:1px solid var(--line);border-radius:16px;background:#fff;padding:22px}.hero{border-top:6px solid var(--red)}.grid{display:grid;grid-template-columns:1.4fr .9fr;gap:18px}.open{background:#fff5e8;border-color:#edc787}.links{display:flex;flex-wrap:wrap;gap:13px;margin-top:21px}.full{margin-top:20px}.full summary{cursor:pointer;font-weight:800}.full article{margin-top:22px}.full section+section{margin-top:28px;padding-top:25px;border-top:1px solid var(--line)}ul,ol{padding-left:22px}li+li{margin-top:7px}@media(max-width:700px){main{padding:30px 16px 52px}.grid{grid-template-columns:1fr}.hero,.card,.full{padding:17px}}${FIGURE_CSS}`;
function shell(title: string, body: string) { return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><link rel="icon" href="data:,"><title>${escape(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`; }
export function renderDigest(markdown: string) { const doc = parse(markdown); return shell(doc.title, `<main><header class="masthead"><h1>${inline(doc.title)}</h1></header><section class="hero"><h2>Goal</h2>${blocks(section(doc, "Goal"))}</section>${FIGURES["deck-flow"]}<div class="grid"><section class="card"><h2>Decisions</h2>${blocks(section(doc, "Decisions"))}</section><section class="card open"><h2>Open questions</h2>${blocks(section(doc, "Risks and open questions"))}</section></div><nav class="links" aria-label="Document links"><a href="/full">Full plan</a><a href="/raw">Raw Markdown</a></nav></main>`); }
export function renderFull(markdown: string) { const doc = parse(markdown); return shell(doc.title, `<main><header class="masthead"><h1>${inline(doc.title)}</h1></header><article class="full">${blocks(doc.preamble)}${doc.sections.map((item) => `<section><h2>${inline(item.heading)}</h2>${blocks(item.source)}</section>`).join("")}</article></main>`); }
