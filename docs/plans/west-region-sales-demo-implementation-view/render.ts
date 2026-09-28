import { FIGURES, FIGURE_CSS } from "./figures.ts";

type Section = { heading: string; source: string };
type ParsedDocument = { title: string; preamble: string; sections: Section[] };

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(value: string): string {
  const code: string[] = [];
  const start = String.fromCharCode(0xe000);
  const end = String.fromCharCode(0xe001);
  let output = value.replace(/`([^`]+)`/g, (_match, content: string) => {
    code.push(`<code>${escapeHtml(content)}</code>`);
    return `${start}${code.length - 1}${end}`;
  });
  output = escapeHtml(output)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\.\.?\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return output.replace(new RegExp(`${start}(\\d+)${end}`, "g"), (_match, index: string) => code[Number(index)] ?? "");
}

function parse(markdown: string): ParsedDocument {
  const lines = markdown.split("\n");
  const titleIndex = lines.findIndex((line) => line.startsWith("# "));
  const title = titleIndex >= 0 ? lines[titleIndex].slice(2) : "";
  const sections: Section[] = [];
  let preamble = "";
  let current: Section | undefined;
  for (const line of lines.slice(titleIndex + 1)) {
    if (line.startsWith("## ")) {
      current = { heading: line.slice(3), source: "" };
      sections.push(current);
    } else if (current) current.source += `${line}\n`;
    else preamble += `${line}\n`;
  }
  return { title, preamble: preamble.trim(), sections };
}

function section(document: ParsedDocument, heading: string): string {
  return document.sections.find((item) => item.heading === heading)?.source.trim() ?? "";
}

function renderTable(lines: string[]): string {
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  const headers = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return `<div class="table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderBlocks(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || /^<!--\s*digest:(start|end)\s*-->$/.test(line)) { index += 1; continue; }
    const figure = line.match(/^<!--\s*fig:([a-z0-9-]+)\s*-->\s*$/);
    if (figure) { output.push(FIGURES[figure[1]] ?? `<!-- missing figure ${escapeHtml(figure[1])} -->`); index += 1; continue; }
    const fence = line.match(/^```([^\s`]*)\s*$/);
    if (fence) {
      const content: string[] = []; index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) content.push(lines[index++]);
      if (index < lines.length) index += 1;
      output.push(`<pre><code>${escapeHtml(content.join("\n"))}</code></pre>`); continue;
    }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const table = [line, lines[index + 1]]; index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) table.push(lines[index++]);
      output.push(renderTable(table)); continue;
    }
    if (line.startsWith("> ")) {
      const quote: string[] = []; while (index < lines.length && lines[index].startsWith("> ")) quote.push(lines[index++].slice(2));
      output.push(`<aside class="warning">${quote.map((item) => `<p>${inline(item)}</p>`).join("")}</aside>`); continue;
    }
    const heading = line.match(/^###\s+(.*)$/);
    if (heading) { output.push(`<h3>${inline(heading[1])}</h3>`); index += 1; continue; }
    if (/^-\s+/.test(line)) {
      const items: string[] = []; while (index < lines.length) { const item = lines[index].match(/^-\s+(.*)$/); if (!item) break; items.push(`<li>${inline(item[1])}</li>`); index += 1; }
      output.push(`<ul>${items.join("")}</ul>`); continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []; while (index < lines.length) { const item = lines[index].match(/^\d+\.\s+(.*)$/); if (!item) break; items.push(`<li>${inline(item[1])}</li>`); index += 1; }
      output.push(`<ol>${items.join("")}</ol>`); continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(<!--\s*(?:fig:|digest:)|```|###\s+|>\s+|-\s+|\d+\.\s+)/.test(lines[index]) && !(lines[index].includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1]))) paragraph.push(lines[index++]);
    output.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return output.join("\n");
}

const CSS = `
  :root,:root[data-theme="dark"],:root[data-theme="light"]{color-scheme:light;--ink:#1d2927;--ink2:#31413e;--muted:#65736f;--faint:#eef1ec;--line:#d9ded7;--line2:#c8d0c8;--paper:#f4f2eb;--paper2:#faf9f4;--card:#fffef9;--accent:#0f6b62;--accent2:#174c48;--accent-soft:#e0f0eb;--accent-line:#99c9be;--green:#2c7552;--green-soft:#e8f3ec;--warn:#ad6726;--warn-soft:#fff3df;--warn-line:#e3bc83;--purple:#66519a;--blue:#3f6f9e;--blue-soft:#e8f0f8;--display:Georgia,"Times New Roman",serif;--sans:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;font-family:var(--sans)}
  *{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:var(--paper);color:var(--ink)}main{width:min(1060px,100%);min-width:0;margin:0 auto;padding:54px 28px 78px}.masthead{padding-bottom:26px;border-bottom:1px solid var(--line)}h1{max-width:19ch;margin:0;font:720 clamp(40px,6.4vw,68px)/1.01 var(--display);letter-spacing:-.036em}h2{margin:0 0 13px;font:690 23px/1.2 var(--display);letter-spacing:-.012em}h3{margin:27px 0 10px;font:710 17px/1.25 var(--sans)}p,li,td,th{overflow-wrap:anywhere;font-size:15px;line-height:1.62}p{margin:0 0 13px;color:var(--ink2)}p:last-child{margin-bottom:0}a{color:var(--accent);font-weight:690;text-underline-offset:3px}code{border-radius:5px;background:#e9ece7;padding:2px 5px;color:var(--accent2);font:12px/1.4 var(--mono)}pre{max-width:100%;overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#f0f1ed;padding:16px}pre code{padding:0;background:none;color:var(--ink)}ul,ol{margin:0;padding-left:21px;color:var(--ink2)}li+li{margin-top:7px}.warning{margin:22px 0;border:1px solid var(--warn-line);border-radius:14px;background:var(--warn-soft);padding:15px 17px}.warning p{color:#70451f;font-weight:620}.hero{min-width:0;max-width:100%;margin-top:24px;border:1px solid var(--accent-line);border-radius:20px;background:var(--card);padding:25px;box-shadow:0 18px 44px rgba(35,48,45,.06)}.architecture{min-width:0;max-width:100%;margin-top:6px}.decision-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,.8fr);gap:18px;margin-top:18px}.card{min-width:0;border:1px solid var(--line);border-radius:20px;background:var(--card);padding:23px}.card.locked ul{columns:2;column-gap:32px}.card.locked li{break-inside:avoid;margin-bottom:8px}.card.open{border-color:#c7bbe3;background:#f5f0ff}.source-links{display:flex;flex-wrap:wrap;gap:9px 18px;margin:22px 0;color:var(--muted)}.full{margin-top:18px;border:1px solid var(--line);border-radius:20px;background:var(--card);padding:22px}.full>summary{cursor:pointer;font:700 18px/1.3 var(--display)}.full-content{margin-top:24px}.full-content>section+section{margin-top:34px;padding-top:31px;border-top:1px solid var(--line)}.table-wrap{max-width:100%;overflow-x:auto;margin:16px 0 20px;border:1px solid var(--line);border-radius:13px}table{width:100%;min-width:680px;border-collapse:collapse;background:var(--card)}th,td{padding:11px 13px;text-align:left;border-bottom:1px solid var(--line)}th{background:var(--faint);color:var(--ink);font-weight:750}tr:last-child td{border-bottom:0}@media(max-width:760px){main{padding:34px 16px 58px}.decision-grid{grid-template-columns:minmax(0,1fr)}.card.locked ul{columns:1}.hero,.card,.full{padding:18px}}${FIGURE_CSS}`;

function renderSections(document: ParsedDocument): string {
  return document.sections.map((item) => `<section><h2>${inline(item.heading)}</h2>${renderBlocks(item.source)}</section>`).join("\n");
}

export function renderContent(markdown: string, includeMain = true): string {
  const document = parse(markdown);
  const body = `<article class="full-content">${renderBlocks(document.preamble)}${renderSections(document)}</article>`;
  return includeMain ? `<main><header class="masthead"><h1>${inline(document.title)}</h1></header>${body}</main>` : body;
}

export function renderDigest(markdown: string): string {
  const document = parse(markdown);
  return `<main><header class="masthead"><h1>${inline(document.title)}</h1>${renderBlocks(document.preamble)}</header><section class="hero"><h2>Goal</h2>${renderBlocks(section(document, "Goal"))}</section><section class="architecture">${FIGURES.architecture}</section><div class="decision-grid"><section class="card locked"><h2>Decisions</h2>${renderBlocks(section(document, "Decisions"))}</section><section class="card open"><h2>Open questions</h2>${renderBlocks(section(document, "Risks and open questions"))}</section></div><nav class="source-links" aria-label="Document links"><a href="/full">Full document</a><a href="/raw">Raw Markdown source</a></nav></main>`;
}

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><link rel="icon" href="data:,"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

export function standaloneDigest(markdown: string): string { return shell(parse(markdown).title, renderDigest(markdown)); }
export function standaloneContent(markdown: string): string { return shell(parse(markdown).title, renderContent(markdown)); }
