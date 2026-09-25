const planUrl = new URL("../2026-09-25-managed-harness-setup.md", import.meta.url);

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inline = (value: string) =>
  esc(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');

const section = (markdown: string, heading: string) => {
  const parts = markdown.split(/^## /m);
  const part = parts.find((value) => value.startsWith(`${heading}\n`));
  return part?.slice(heading.length).trim() ?? "";
};

const paragraphs = (source: string) =>
  source
    .split(/\n\s*\n/)
    .filter((part) => part && !part.startsWith("<!--") && !part.startsWith("```") && !part.startsWith("|"))
    .filter((part) => !part.includes("\n```"))
    .map((part) => `<p>${inline(part.replace(/\n/g, " "))}</p>`)
    .join("\n");

const list = (source: string) => {
  const items = source
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => `<li>${inline(line.slice(2))}</li>`)
    .join("\n");
  return items ? `<ul>${items}</ul>` : "";
};

export const render = async () => {
  const markdown = await Bun.file(planUrl).text();
  const goal = section(markdown, "Goal");
  const locked = section(markdown, "Locked decisions");
  const staged = section(markdown, "Staged local bundle");
  const blocks = section(markdown, "Deployment blocks");
  const open = section(markdown, "Open questions");
  const stages = markdown.match(/<!-- digest:stages (.+) -->/)?.[1].split(" | ") ?? [];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Managed harness setup bundle</title>
<style>
:root,:root[data-theme="dark"],:root[data-theme="light"]{color-scheme:light;--paper:#f8f7f2;--card:#fffefa;--ink:#17302e;--muted:#526764;--line:#d5ddd6;--accent:#126d69;--accent-soft:#dcefeb;--warn:#9a4d20;--warn-soft:#fff0e6;--future:#6c5ca8;--future-soft:#eeeafb;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink)}main{max-width:960px;margin:auto;padding:52px 24px 72px}.eyebrow{color:var(--accent);font-size:12px;font-weight:750;letter-spacing:.12em;text-transform:uppercase}h1{font-family:ui-serif,Georgia,serif;font-size:clamp(38px,7vw,64px);line-height:1.02;max-width:12ch;margin:12px 0 20px}h2{font-size:17px;margin:0 0 12px}.hero,.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px}.hero{border-color:var(--accent);box-shadow:0 14px 38px #17302e12}.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:16px;margin-top:16px}.card p,.hero p{line-height:1.58;color:var(--muted)}.card ul{padding-left:18px;margin:0}.card li{padding:6px 0;line-height:1.45;color:var(--muted)}.stage{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}.stage div{padding:14px;border-radius:12px;background:var(--accent-soft);font-weight:700;text-align:center}.stage div:last-child{background:var(--future-soft);color:var(--future)}.warn{background:var(--warn-soft);border-color:#efc6ac}.open{border-color:var(--future);background:var(--future-soft)}a{color:var(--accent)}code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:#eef2ee;padding:2px 4px;border-radius:4px}@media(max-width:700px){main{padding:32px 16px 48px}.grid{grid-template-columns:1fr}.stage{grid-template-columns:1fr}}
</style>
</head>
<body><main>
<div class="eyebrow">Local configuration plan</div>
<h1>Managed harness setup bundle</h1>
<section class="hero">${paragraphs(goal)}</section>
<section class="stage" aria-label="Staged local bundle">${stages.map((stage) => `<div>${inline(stage)}</div>`).join("")}</section>
<div class="grid"><section class="card"><h2>Locked decisions</h2>${list(locked)}</section><section class="card warn"><h2>Deployment blocks</h2>${list(blocks)}</section></div>
<div class="grid"><section class="card"><h2>Staged local bundle</h2>${staged.split("\n").filter((line) => /^\d+\. /.test(line)).map((line) => `<p>${inline(line)}</p>`).join("")}</section><section class="card open"><h2>Open questions</h2>${list(open)}</section></div>
<p><a href="../2026-09-25-managed-harness-setup.md">Read the full plan</a></p>
</main></body></html>`;
};
