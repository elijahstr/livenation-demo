const node = (label: string, tone: string) => `<div class="foundation-node ${tone}">${label}</div>`;
const arrow = `<span class="foundation-arrow" aria-hidden="true">→</span>`;

export const FIGURE_CSS = `
  .foundation-figure{margin:24px 0;border:1px solid var(--line);border-radius:18px;background:var(--card);padding:20px}
  .foundation-figure figcaption{display:grid;gap:5px;margin-bottom:16px}.figure-kicker{color:var(--accent);font:800 11px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase}.figure-title{font:760 20px/1.2 var(--display)}
  .foundation-scroll{overflow-x:auto;padding:2px 2px 8px}.foundation-flow{display:flex;align-items:stretch;min-width:max-content}.foundation-node{display:flex;align-items:center;justify-content:center;width:158px;min-height:76px;border:1px solid var(--line);border-radius:12px;padding:12px;text-align:center;font:720 13px/1.35 var(--sans)}.foundation-node.source{background:#f3f4f1}.foundation-node.bronze{border-color:#d9ad76;background:#fff2e3}.foundation-node.silver{border-color:#9bc8b7;background:#edf8f2}.foundation-node.gold{border-color:#86bda9;background:#e6f3ed}.foundation-arrow{display:flex;align-items:center;padding:0 9px;color:var(--muted);font-size:23px}
  @media(max-width:680px){.foundation-figure{padding:16px}.foundation-node{width:142px}.foundation-arrow{padding:0 6px}}
`;

export const FIGURES: Record<string, string> = {
  "foundation-flow": `<figure class="foundation-figure" aria-labelledby="foundation-figure-title"><figcaption><span class="figure-kicker">Plan architecture</span><span class="figure-title" id="foundation-figure-title">Premium Databricks foundation</span></figcaption><div class="foundation-scroll"><div class="foundation-flow">${node("Synthetic Harbor Works source records", "source")}${arrow}${node("Five Bronze tables", "bronze")}${arrow}${node("17 Silver tables", "silver")}${arrow}${node("Five ordinary Gold views and sales_metrics", "gold")}</div></div></figure>`,
};
