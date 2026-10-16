import { page } from "../../design/databricks-layout/render.ts";
import { FIGURES, FIGURE_CSS } from "./figures.ts";

const repositoryRoot = "https://github.com/elijahstr/livenation-demo/blob/main/";
const planDirectory = `${repositoryRoot}docs/plans/`;

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}\n`);
  if (start < 0) return "";
  const end = markdown.indexOf("\n## ", start + heading.length + 4);
  return markdown.slice(start, end < 0 ? markdown.length : end).trimEnd() + "\n";
}

function canonicalizeLinks(markdown: string): string {
  return markdown.replace(/\]\((?!https?:\/\/)([^)#\s]+)(#[^)\s]+)?\)/g, (_whole, pathname: string, anchor = "") => {
    const url = new URL(pathname, planDirectory);
    return `](${url.toString()}${anchor})`;
  });
}

function digestSource(markdown: string): string {
  const preamble = markdown.split(/^## /m)[0].trim();
  return `${preamble}\n\n${section(markdown, "Goal")}\n${section(markdown, "Verified context")}\n${section(markdown, "Locked decisions")}\n${section(markdown, "Risks and open questions")}\n${section(markdown, "Review record")}`;
}

const options = {
  figures: FIGURES,
  extraCss: FIGURE_CSS,
  nav: ["Goal", "Verified context", "Locked decisions", "Risks and open questions", "Review record"],
  links: '<a href="/full">Full plan</a><a href="/raw">Raw Markdown source</a>',
};

function replaceBackLink(html: string): string {
  return html.replace('<a href="#high-school">Back to High School</a>', '<a href="#goal">Back to Goal</a>');
}

export function renderDigest(markdown: string): string {
  return replaceBackLink(page(canonicalizeLinks(digestSource(markdown)), true, options));
}

export function renderFull(markdown: string): string {
  return replaceBackLink(page(canonicalizeLinks(markdown), false, options));
}
