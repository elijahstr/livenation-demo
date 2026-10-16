export function initialRecoveryWorkflow() {
  return { stage: "agent", alert: null, route: null, approved: false };
}

export function presentTerminalResult(result) {
  if (result?.status === "error") return { kind: "error", message: result.message || "The portfolio check failed." };
  const presentations = {
    stale: { agentStatus: "STALE EVIDENCE", message: "The sales evidence is too old for a recovery recommendation." },
    empty: { agentStatus: "NO DATA", message: "No sales evidence is available for this recovery check." },
    healthy: { agentStatus: "PORTFOLIO ON TRACK", message: "No shows require a recovery route." },
  };
  return { kind: "complete", ...(presentations[result?.status] || { agentStatus: "CHECK COMPLETE", message: "The recovery check completed." }) };
}

export function reduceRecoveryWorkflow(state, event) {
  switch (event.type) {
    case "risk-identified":
      if (!event.alert) return state;
      return { ...state, stage: "at-risk", alert: event.alert, route: null, approved: false };
    case "recommendations-ready":
      return state.alert ? { ...state, stage: "recommendations" } : state;
    case "route-selected":
      return state.stage === "recommendations" || state.stage === "review"
        ? { ...state, stage: "review", route: event.route, approved: false }
        : state;
    case "approval-recorded":
      return state.route ? { ...state, approved: true } : state;
    case "reset":
      return initialRecoveryWorkflow();
    default:
      return state;
  }
}
