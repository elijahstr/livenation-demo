const node = (label: string, kind: string) => `
  <div class="flow-node ${kind}">${label}</div>`;

export const FIGURE_CSS = `
  .flow-figure{width:100%;min-width:0;margin:24px 0;border:1px solid var(--line);border-radius:18px;padding:22px;background:var(--card)}
  .flow-caption{margin:0 0 16px;font:600 17px/1.35 ui-serif,Georgia,serif;color:var(--ink)}
  .flow-scroll{width:100%;min-width:0;max-width:100%;overflow-x:auto;padding-bottom:4px}
  .flow{display:flex;align-items:center;min-width:max-content}
  .flow-node{width:164px;min-height:72px;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--paper);font-size:13px;font-weight:700;line-height:1.35;color:var(--ink)}
  .flow-node.profile{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
  .flow-node.model{border-color:var(--model);background:var(--model-soft);color:var(--model)}
  .flow-node.tool{border-color:var(--tool);background:var(--tool-soft);color:var(--tool)}
  .flow-arrow{padding:0 10px;color:var(--muted);font-size:22px;line-height:1}
  @media(max-width:640px){.flow-figure{padding:16px}.flow-node{width:144px}.flow-arrow{padding:0 7px}}
`;

export const FIGURES: Record<string, string> = {
  "kimi-harness-flow": `<figure class="flow-figure" aria-labelledby="kimi-harness-flow-title">
    <figcaption class="flow-caption" id="kimi-harness-flow-title">Kimi managed harness deployment</figcaption>
    <div class="flow-scroll"><div class="flow">
      ${node("livenation-demo AWS profile", "profile")}
      <div class="flow-arrow" aria-hidden="true">→</div>
      ${node("AgentCore Harness", "harness")}
      <div class="flow-arrow" aria-hidden="true">→</div>
      ${node("moonshotai.kimi-k2.5", "model")}
      <div class="flow-arrow" aria-hidden="true">→</div>
      ${node("get_sales_evidence", "tool")}
    </div></div>
  </figure>`,
};
