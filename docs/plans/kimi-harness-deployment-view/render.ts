import { FIGURES, FIGURE_CSS } from "./figures.ts";

type Section = { heading: string; source: string };

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inline = (value: string) => {
  const code: string[] = [];
  const start = String.fromCharCode(0xe000);
  const end = String.fromCharCode(0xe001);
  let output = value.replace(/`([^`]+)`/g, (_match, value) => {
    code.push(`<code>${esc(value)}</code>`);
    return `${start}${code.length - 1}${end}`;
  });
  output = esc(output)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return output.replace(new RegExp(`${start}(\\d+)${end}`, "g"), (_match, index) => code[Number(index)] ?? "");
};

function parse(markdown: string): { title: string; sections: Section[] } {
  const lines = markdown.split("\n");
  const title = lines.find((line) => line.startsWith("# "))?.slice(2) ?? "";
  const sections: Section[] = [];
  let current: Section | undefined;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      current = { heading: line.slice(3), source: "" };
      sections.push(current);
      continue;
    }
    if (current) current.source += `${line}\n`;
  }
  return { title, sections };
}

function section(sections: Section[], heading: string): string {
  return sections.find((item) => item.heading === heading)?.source.trim() ?? "";
}

function renderBlocks(source: string, figures: Record<string, string> = FIGURES): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const figure = line.match(/^<!--\s*fig:([a-z-]+)\s*-->\s*$/);
    if (figure) {
      output.push(figures[figure[1]] ?? `<!-- unknown figure: ${esc(figure[1])} -->`);
      index++;
      continue;
    }
    if (!line.trim()) {
      index++;
      continue;
    }
    const unordered = line.match(/^-\s+(.*)$/);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^-\s+(.*)$/);
        if (!item) break;
        items.push(`<li>${inline(item[1])}</li>`);
        index++;
      }
      output.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\d+\.\s+(.*)$/);
        if (!item) break;
        items.push(`<li>${inline(item[1])}</li>`);
        index++;
      }
      output.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(<!--\s*fig:|[-]\s+|\d+\.\s+)/.test(lines[index])) {
      paragraph.push(lines[index]);
      index++;
    }
    output.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return output.join("\n");
}

const css = `
  :root,:root[data-theme="dark"],:root[data-theme="light"]{color-scheme:light;--paper:#f5f6f2;--card:#fffefa;--ink:#17302e;--muted:#526764;--line:#d5ddd6;--accent:#126d69;--accent-soft:#dcefeb;--model:#365f91;--model-soft:#e9f0fa;--tool:#79561d;--tool-soft:#fbf1dc;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  *{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:var(--paper);color:var(--ink)}main{width:100%;min-width:0;max-width:1000px;margin:auto;padding:48px 24px 72px}.eyebrow{color:var(--accent);font-size:12px;font-weight:750;letter-spacing:.11em;text-transform:uppercase}h1{max-width:14ch;margin:10px 0 18px;font:700 clamp(38px,7vw,64px)/1.03 ui-serif,Georgia,serif;letter-spacing:-.035em}h2{margin:0 0 12px;font:650 20px/1.2 ui-serif,Georgia,serif}.hero,.card,.full{min-width:0;border:1px solid var(--line);border-radius:18px;background:var(--card);padding:24px}.hero{border-color:var(--accent);box-shadow:0 16px 34px #17302e0d}.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-top:16px}.card.open{border-color:var(--model);background:var(--model-soft)}p,li{overflow-wrap:anywhere;color:var(--muted);font-size:15px;line-height:1.62}p{margin:0 0 12px}p:last-child{margin-bottom:0}ul,ol{margin:0;padding-left:20px}li+li{margin-top:7px}a{color:var(--accent);font-weight:650}code{border-radius:4px;background:#edf0ed;padding:2px 4px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink)}.source-link{margin:20px 0 0}.full{margin-top:26px}.full>summary{cursor:pointer;font:650 20px/1.2 ui-serif,Georgia,serif}.full-content{margin-top:22px}.full-content section+section{border-top:1px solid var(--line);margin-top:22px;padding-top:22px}.full-content h2{font-size:23px}@media(max-width:680px){main{padding:32px 16px 52px}.grid{grid-template-columns:minmax(0,1fr)}.hero,.card,.full{padding:18px}}
  ${FIGURE_CSS}
`;

export function renderDigest(markdown: string): string {
  const document = parse(markdown);
  const goal = section(document.sections, "Goal");
  const locked = section(document.sections, "Locked decisions");
  const open = section(document.sections, "Open questions");
  const figure = FIGURES["kimi-harness-flow"];

  return `<main>
    <div class="eyebrow">Deployment plan</div>
    <h1>${inline(document.title)}</h1>
    <section class="hero" aria-labelledby="goal"><h2 id="goal">Goal</h2>${renderBlocks(goal.replace(/^<!--\s*fig:kimi-harness-flow\s*-->\s*$/m, ""))}</section>
    ${figure}
    <div class="grid">
      <section class="card" aria-labelledby="locked"><h2 id="locked">Locked decisions</h2>${renderBlocks(locked)}</section>
      <section class="card open" aria-labelledby="open"><h2 id="open">Open questions</h2>${renderBlocks(open)}</section>
    </div>
    <p class="source-link"><a href="#full-plan">Read the full plan</a> · <a href="../2026-09-25-kimi-harness-deployment.md">Read the Markdown source</a></p>
    <details class="full" id="full-plan"><summary>Full plan</summary>${renderContent(markdown, false)}</details>
  </main>`;
}

export function renderContent(markdown: string, includeMain = true): string {
  const document = parse(markdown);
  const content = document.sections
    .map((item) => `<section><h2>${inline(item.heading)}</h2>${renderBlocks(item.source)}</section>`)
    .join("\n");
  return includeMain
    ? `<main><div class="eyebrow">Deployment plan</div><h1>${inline(document.title)}</h1><article class="full-content">${content}</article></main>`
    : `<article class="full-content">${content}</article>`;
}

export function standalone(markdown: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Kimi managed harness deployment</title><style>${css}</style></head><body>${renderDigest(markdown)}</body></html>`;
}
