const node = (step: string, label: string, kind: string) => `
  <div class="flow-node ${kind}">
    <span class="step">${step}</span>
    <span>${label}</span>
  </div>`;

const arrow = `<div class="flow-arrow" aria-hidden="true">→</div>`;

export const FIGURE_CSS = `
  .flow-figure{margin:28px 0;border:1px solid var(--line);border-radius:22px;background:var(--card);padding:24px;box-shadow:0 14px 34px rgba(35,48,45,.06)}
  .flow-caption{display:flex;flex-direction:column;gap:5px;margin-bottom:19px}
  .figure-kicker{color:var(--accent);font:760 11px/1.2 var(--sans);letter-spacing:.12em;text-transform:uppercase}
  .figure-title{color:var(--ink);font:680 19px/1.3 var(--display)}
  .flow-lane{display:flex;align-items:stretch;min-width:max-content}
  .flow-lane+.flow-lane{margin-top:12px}
  .flow-scroll{max-width:100%;overflow-x:auto;padding:2px 2px 8px}
  .flow-node{position:relative;display:flex;align-items:center;justify-content:center;width:176px;min-height:82px;border:1px solid var(--line2);border-radius:14px;background:var(--paper2);padding:17px 13px;text-align:center;color:var(--ink);font:710 13px/1.35 var(--sans)}
  .flow-node .step{position:absolute;top:8px;left:10px;color:var(--muted);font:700 9px/1 var(--mono);letter-spacing:.08em}
  .flow-node.code{border-color:var(--accent-line);background:var(--accent-soft)}
  .flow-node.model{border-color:#abc3df;background:var(--blue-soft);color:#244f78}
  .flow-node.human{border-color:#a9cfbd;background:var(--green-soft);color:#245f45}
  .flow-node.sim{border-color:var(--warn-line);background:var(--warn-soft);color:#7b4a18}
  .flow-arrow{display:flex;align-items:center;padding:0 9px;color:var(--muted);font-size:22px}
  .flow-legend{display:flex;flex-wrap:wrap;gap:8px 15px;margin-top:16px;padding-top:15px;border-top:1px solid var(--line)}
  .legend-item{display:flex;align-items:center;gap:7px;color:var(--muted);font:620 11px/1.3 var(--sans)}
  .legend-swatch{width:10px;height:10px;border-radius:3px;background:var(--accent)}
  .legend-swatch.model{background:var(--blue)}
  .legend-swatch.human{background:var(--green)}
  .legend-swatch.sim{background:var(--warn)}
  .figure-foot{margin:14px 0 0;color:var(--ink);font:670 13px/1.5 var(--sans)}
  @media(max-width:680px){.flow-figure{padding:17px}.flow-node{width:150px}.flow-arrow{padding:0 6px}}
`;

export const FIGURES: Record<string, string> = {
  "west-sales-flow": `<figure class="flow-figure" aria-labelledby="west-sales-flow-title">
    <figcaption class="flow-caption">
      <span class="figure-kicker">Architecture</span>
      <span class="figure-title" id="west-sales-flow-title">The deterministic gate selects one alert before Kimi reasons.</span>
    </figcaption>
    <div class="flow-scroll">
      <div class="flow-lane">
        ${node("01", "Fixed Databricks query", "code")}
        ${arrow}
        ${node("02", "Deterministic detector", "code")}
        ${arrow}
        ${node("03", "One selected aggregate alert", "code")}
        ${arrow}
        ${node("04", "Kimi diagnosis through the managed Harness", "model")}
      </div>
      <div class="flow-lane">
        ${node("05", "Command-center UI", "code")}
        ${arrow}
        ${node("06", "Email, Social, or Dismiss choice", "code")}
        ${arrow}
        ${node("07", "Human approval", "human")}
        ${arrow}
        ${node("08", "Local simulated action and audit record", "sim")}
      </div>
    </div>
    <div class="flow-legend" aria-label="The diagram uses deterministic code, the Kimi model call, the human gate, and the simulation boundary as separate roles.">
      <span class="legend-item"><span class="legend-swatch"></span>Deterministic code</span>
      <span class="legend-item"><span class="legend-swatch model"></span>Kimi model call</span>
      <span class="legend-item"><span class="legend-swatch human"></span>Human gate</span>
      <span class="legend-item"><span class="legend-swatch sim"></span>Simulation boundary</span>
    </div>
    <p class="figure-foot">The human gate stays between every draft and every simulated action.</p>
  </figure>`,
};
