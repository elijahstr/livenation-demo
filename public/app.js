import { initialRecoveryWorkflow, presentTerminalResult, reduceRecoveryWorkflow } from "./recovery-workflow.js";
import { initialStreamState, readNdjsonResponse, reduceStreamState } from "./stream-client.js";

const get = (selector) => document.querySelector(selector);
const workflow = get("[data-recovery-workflow]");
const run = get("#run-check");
const checkStatus = get("#check-status");
const agentStatus = get("#agent-status");
const activity = get("#agent-activity");
const rationale = get("#rationale");
const draft = get("#draft");
const approve = get("#approve");
const execute = get("#execute");
const actionLog = get("#action-log");
const approvalStream = get("#approval-stream");
const actionButtons = [...document.querySelectorAll("[data-action]")];
let state = initialRecoveryWorkflow();
let actionId = null;
let activeCheckController = null;

const actionCopy = {
  email: {
    channel: "OUTLOOK · SUITE OUTREACH",
    guidance: "Review the account offer before approval.",
    content: (event) => `Subject: Private suite opportunity for ${event.event_name}\n\nHello [Account contact],\n\nWe have a limited suite opportunity for ${event.event_name} at ${event.venue_name}. Reply for package details and current availability.\n\nLive Nation Premium Sales\nWest Region\n\nThis local draft is not sent.`,
  },
  social: {
    channel: "META · SEAT CAMPAIGN",
    guidance: "Review the audience, timing, and budget before approval.",
    content: (event) => `Campaign: ${event.event_name} premium inventory\nObjective: Sell remaining individual premium seats\nAudience: Approved ${event.city} market event-intent segment\nInventory: 128 premium seats\nBudget cap: $2,500\nFlight: 10 days, ending 48 hours before the show\nApproval owner: West Region Marketing\n\nThis local proposal does not create or fund a campaign.`,
  },
  dismiss: {
    channel: "DISMISSAL RECORD",
    guidance: "Review the closure record before approval.",
    content: "Decision: Dismiss the premium inventory alert\n\nReason: Add the reviewer reason here.\n\nThis creates a local audit record only.",
  },
};

function formatNumber(value) {
  return typeof value === "number" ? new Intl.NumberFormat("en-US").format(value) : "—";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed with status ${response.status}`);
  return payload;
}

function setLog(message, isError = false) {
  actionLog.textContent = message;
  actionLog.classList.toggle("is-error", isError);
}

function replacePlaceholder(feed, message) {
  const item = document.createElement("li");
  item.className = "activity-empty";
  item.textContent = message;
  feed.replaceChildren(item);
}

function appendMessage(feed, message, elapsedMs) {
  const item = document.createElement("li");
  const elapsed = typeof elapsedMs === "number" ? `${(elapsedMs / 1000).toFixed(1)}s · ` : "";
  item.textContent = `${elapsed}${message}`;
  feed.querySelector(".activity-empty")?.remove();
  feed.append(item);
}

function renderStages() {
  workflow.dataset.recoveryState = state.stage;
  document.querySelectorAll("[data-stage]").forEach((section) => {
    const stage = section.dataset.stage;
    section.hidden = (stage === "at-risk" && !state.alert)
      || (stage === "recommendations" && !["recommendations", "review"].includes(state.stage))
      || (stage === "review" && state.stage !== "review");
  });
}

function dispatch(event) {
  state = reduceRecoveryWorkflow(state, event);
  renderStages();
}

function resetApproval() {
  actionId = null;
  draft.value = "";
  draft.disabled = true;
  get("#draft-guidance").textContent = "Review the selected route before approval.";
  get("#draft-channel").textContent = "NOT SELECTED";
  get("#approval-state").textContent = "OWNER DECISION";
  approve.disabled = true;
  execute.disabled = true;
  replacePlaceholder(approvalStream, "The selected route will appear here.");
  setLog("No external email or advertising action occurs in this demo.");
}

function isCurrentAction(expectedActionId, expectedAlert) {
  return actionId === expectedActionId && state.alert === expectedAlert;
}

function resetCase() {
  dispatch({ type: "reset" });
  resetApproval();
  replacePlaceholder(activity, "The recovery agent is working.");
  activity.hidden = false;
  rationale.textContent = "The recovery agent is waiting for verified evidence.";
  actionButtons.forEach((button) => {
    button.disabled = true;
    button.classList.remove("is-selected");
  });
}

function renderAlert(alert) {
  const row = alert.evidence;
  const percent = Math.round(alert.ratio * 100);
  get("#event-name").textContent = row.event_name;
  get("#event-meta").textContent = `${row.venue_name} · ${row.city}, ${row.state} · ${formatDate(`${row.show_date}T12:00:00Z`)}`;
  get("#target-percent").textContent = `${percent}%`;
  get("#target-progress").style.width = `${Math.min(100, Math.max(0, percent))}%`;
  get("#tickets-sold").textContent = formatNumber(row.tickets_sold_cumulative);
  get("#tickets-target").textContent = formatNumber(row.tickets_target_cumulative);
  get("#alert-state").textContent = "SALES EVIDENCE";
}

function handleStreamEvent(event, streamState) {
  if (event.type === "phase" || event.type === "tool") {
    const message = typeof event.message === "string" ? event.message : "The recovery agent updated its status.";
    appendMessage(activity, message, event.elapsedMs);
    checkStatus.textContent = message;
  }
  if (event.type === "token") rationale.textContent = streamState.rationale;
  if (event.type === "risk-identified" && event.alert) {
    dispatch({ type: "risk-identified", alert: event.alert });
    renderAlert(event.alert);
    const message = typeof event.message === "string" ? event.message : "Verified risk identified.";
    appendMessage(activity, message, event.elapsedMs);
    checkStatus.textContent = message;
  }
  if (event.type === "recommendations-ready") {
    const wasReady = state.stage === "recommendations" || state.stage === "review";
    dispatch({ type: "recommendations-ready" });
    if (state.stage === "recommendations") {
      if (!wasReady) appendMessage(activity, typeof event.message === "string" ? event.message : "Verified recovery recommendation completed.", event.elapsedMs);
      actionButtons.forEach((button) => { button.disabled = false; });
      agentStatus.textContent = "ROUTE READY";
      checkStatus.textContent = "Recovery routes are ready for owner review.";
    }
  }
}

run.addEventListener("click", async () => {
  run.disabled = true;
  run.textContent = "Recovery agent active";
  agentStatus.textContent = "ACTIVE";
  checkStatus.textContent = "Reading West Region sales evidence.";
  resetCase();
  const controller = new AbortController();
  activeCheckController = controller;
  let streamState = initialStreamState();
  try {
    const response = await fetch("/api/sales-check/stream", { method: "POST", signal: controller.signal });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Request failed with status ${response.status}`);
    }
    const terminal = await readNdjsonResponse(response, (event) => {
      streamState = reduceStreamState(streamState, event);
      handleStreamEvent(event, streamState);
    });
    if (terminal.type === "error") throw new Error(streamState.error || "The portfolio check failed.");
    if (terminal.type !== "result") throw new Error("Sales-check stream ended without a result.");
    rationale.textContent = streamState.rationale || terminal.result?.rationale || rationale.textContent;
    if (terminal.result?.status !== "alert") {
      const presentation = presentTerminalResult(terminal.result);
      if (presentation.kind === "error") throw new Error(presentation.message);
      checkStatus.textContent = presentation.message;
      agentStatus.textContent = presentation.agentStatus;
    }
  } catch (error) {
    if (!controller.signal.aborted) controller.abort();
    const message = error instanceof Error ? error.message : "The portfolio check failed.";
    appendMessage(activity, message);
    checkStatus.textContent = message;
    agentStatus.textContent = "CHECK FAILED";
  } finally {
    if (activeCheckController === controller) activeCheckController = null;
    run.disabled = false;
    run.textContent = "Run recovery agent";
  }
});

window.addEventListener("pagehide", () => activeCheckController?.abort());

draft.addEventListener("input", () => {
  execute.disabled = true;
  approve.disabled = !draft.value.trim();
  get("#approval-state").textContent = draft.value.trim() ? "DRAFT EDITED" : "DRAFT EMPTY";
});

async function saveDraft(actionId, content) {
  if (!actionId || !content.trim()) throw new Error("Draft content is required.");
  appendMessage(approvalStream, "Saving local draft edits.");
  return requestJson(`/api/actions/${encodeURIComponent(actionId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

actionButtons.forEach((button) => button.addEventListener("click", async () => {
  if (!state.alert || button.disabled) return;
  const requestedAlert = state.alert;
  const type = button.dataset.action;
  const copy = actionCopy[type];
  actionButtons.forEach((choice) => { choice.disabled = true; });
  resetApproval();
  appendMessage(approvalStream, `Creating the ${copy.channel.toLowerCase()} draft.`);
  try {
    const action = await requestJson("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        alertSnapshotHash: requestedAlert.snapshotHash,
        actionType: type,
        content: typeof copy.content === "function" ? copy.content(requestedAlert.evidence) : copy.content,
      }),
    });
    if (state.alert !== requestedAlert) return;
    actionId = action.action_id;
    dispatch({ type: "route-selected", route: type });
    draft.value = action.content;
    draft.disabled = false;
    get("#draft-guidance").textContent = copy.guidance;
    get("#draft-channel").textContent = copy.channel;
    get("#approval-state").textContent = "AWAITING APPROVAL";
    actionButtons.forEach((choice) => choice.classList.toggle("is-selected", choice === button));
    approve.disabled = !draft.value.trim();
    appendMessage(approvalStream, "The local draft is ready for review.");
    setLog(`The ${copy.channel.toLowerCase()} draft is ready for review.`);
    draft.focus();
  } catch (error) {
    if (state.alert !== requestedAlert) return;
    appendMessage(approvalStream, "The local draft could not be created.");
    setLog(error instanceof Error ? error.message : "The local draft could not be created.", true);
  } finally {
    if (state.alert === requestedAlert) actionButtons.forEach((choice) => { choice.disabled = !["recommendations", "review"].includes(state.stage); });
  }
}));

approve.addEventListener("click", async () => {
  if (!actionId) return;
  const approvedActionId = actionId;
  const approvedAlert = state.alert;
  const content = draft.value;
  approve.disabled = true;
  execute.disabled = true;
  draft.disabled = true;
  try {
    await saveDraft(approvedActionId, content);
    if (!isCurrentAction(approvedActionId, approvedAlert)) return;
    const action = await requestJson(`/api/actions/${encodeURIComponent(approvedActionId)}/approve`, { method: "POST" });
    if (!isCurrentAction(approvedActionId, approvedAlert)) return;
    dispatch({ type: "approval-recorded" });
    get("#approval-state").textContent = "APPROVED";
    appendMessage(approvalStream, "The local approval was recorded.");
    setLog(`Local ${action.action_type} simulation is approved. No external action has occurred.`);
    execute.disabled = action.status !== "approved";
  } catch (error) {
    if (!isCurrentAction(approvedActionId, approvedAlert)) return;
    approve.disabled = false;
    setLog(error instanceof Error ? error.message : "The draft could not be approved.", true);
  } finally {
    if (isCurrentAction(approvedActionId, approvedAlert)) draft.disabled = false;
  }
});

execute.addEventListener("click", async () => {
  if (!actionId) return;
  const executedActionId = actionId;
  const executedAlert = state.alert;
  execute.disabled = true;
  try {
    const action = await requestJson(`/api/actions/${encodeURIComponent(executedActionId)}/execute`, { method: "POST" });
    if (!isCurrentAction(executedActionId, executedAlert)) return;
    get("#approval-state").textContent = "SIMULATION COMPLETE";
    appendMessage(approvalStream, "The local simulation is complete.");
    setLog(`Local ${action.action_type} simulation is complete. No external system changed.`);
    draft.disabled = true;
    approve.disabled = true;
  } catch (error) {
    if (!isCurrentAction(executedActionId, executedAlert)) return;
    execute.disabled = false;
    setLog(error instanceof Error ? error.message : "The local simulation could not complete.", true);
  }
});
