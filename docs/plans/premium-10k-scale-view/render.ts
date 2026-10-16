import { page } from "../../design/databricks-layout/render.ts";
import { FIGURES, FIGURE_CSS } from "./figures.ts";

const root = "https://github.com/elijahstr/livenation-demo/blob/main/docs/plans/";
function section(markdown: string, heading: string) {
  const start = markdown.indexOf(`## ${heading}\n`);
  if (start < 0) return "";
  const end = markdown.indexOf("\n## ", start + heading.length + 4);
  return `${markdown.slice(start, end < 0 ? markdown.length : end).trimEnd()}\n`;
}
function links(markdown: string) {
  return markdown.replace(/\]\((?!https?:\/\/)([^)#\s]+)(#[^)\s]+)?\)/g, (_all, path: string, hash = "") => `](${new URL(path, root).toString()}${hash})`);
}
const options = { figures: FIGURES, extraCss: FIGURE_CSS, nav: ["Goal", "Locked decisions", "Risks and open questions"], links: '<a href="/full">Full plan</a><a href="/raw">Raw Markdown source</a>' };
function source(markdown: string) {
  const preamble = markdown.split(/^## /m)[0].trim();
  return `${preamble}\n\n${section(markdown, "Goal")}${section(markdown, "Locked decisions")}${section(markdown, "Risks and open questions")}`;
}
function replaceBackLink(html: string) {
  return html.replace('<a href="#high-school">Back to High School</a>', '<a href="#goal">Back to Goal</a>');
}
export function renderDigest(markdown: string) { return replaceBackLink(page(links(source(markdown)), true, options)); }
export function renderFull(markdown: string) { return replaceBackLink(page(links(markdown), false, options)); }
