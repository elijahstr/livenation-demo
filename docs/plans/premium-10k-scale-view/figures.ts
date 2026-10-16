const node = (text: string, tone: string) => `<div class="scale-node ${tone}">${text}</div>`;
const arrow = `<span class="scale-arrow" aria-hidden="true">→</span>`;

export const FIGURE_CSS = `
.scale-figure{margin:24px 0;border:1px solid var(--line);border-radius:18px;background:var(--card);padding:20px}.scale-figure figcaption{display:grid;gap:5px;margin-bottom:16px}.scale-kicker{color:var(--accent);font:800 11px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase}.scale-title{font:760 20px/1.2 var(--display)}.scale-scroll{overflow-x:auto;padding:2px 2px 8px}.scale-flow{display:flex;align-items:stretch;min-width:max-content}.scale-node{display:flex;align-items:center;justify-content:center;width:168px;min-height:78px;border:1px solid var(--line);border-radius:12px;padding:12px;text-align:center;font:720 13px/1.35 var(--sans)}.foundation{background:#f3f4f1}.generate{background:#fff2e3;border-color:#d9ad76}.verify{background:#edf8f2;border-color:#9bc8b7}.gold{background:#e6f3ed;border-color:#86bda9}.scale-arrow{display:flex;align-items:center;padding:0 9px;color:var(--muted);font-size:23px}@media(max-width:680px){.scale-figure{padding:16px}.scale-node{width:145px}.scale-arrow{padding:0 6px}}
`;

export const FIGURES: Record<string, string> = {
  "scale-flow": `<figure class="scale-figure" aria-labelledby="scale-figure-title"><figcaption><span class="scale-kicker">Bounded data path</span><span class="scale-title" id="scale-figure-title">One verified scale batch at a time</span></figcaption><div class="scale-scroll"><div class="scale-flow">${node("Foundation: 28 Bronze / 27 Silver", "foundation")}${arrow}${node("Bundle 0001 applied: 36 records", "generate")}${arrow}${node("Current: 64 Bronze / 63 Silver", "verify")}${arrow}${node("Gold proof: $490 / $75 / 11 / 2", "gold")}</div></div></figure>`,
};
