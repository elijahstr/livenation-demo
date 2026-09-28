const get = (selector) => document.querySelector(selector);
const run = get("#run-check");
const checkStatus = get("#check-status");
const workArea = get(".work-area");
const evidence = get("#evidence");
const marketSignal = get("#market-signal");
const venueRail = get("#venue-rail");
const showCount = get("#show-count");
const rationale = get("#rationale");
const draft = get("#draft");
const draftGuidance = get("#draft-guidance");
const draftChannel = get("#draft-channel");
const approve = get("#approve");
const execute = get("#execute");
const actionLog = get("#action-log");
const actionButtons = [...document.querySelectorAll("[data-action]")];

const actionCopy = {
  email: {
    channel: "OUTLOOK DRAFT",
    guidance: "Review the corporate account offer before local approval.",
    content: (event) => `Subject: Private suite opportunity for ${event.event_name}

Hello [Account contact],

We have a limited suite opportunity for ${event.event_name} at ${event.venue_name}. The synthetic account-fit review identified your company as a suitable match for client or employee hosting.

Reply to this draft for package details, capacity, and current availability.

Live Nation Premium Sales
West Region

Demo note: Synthetic accounts and inventory. This draft is not sent.`,
  },
  social: {
    channel: "CAMPAIGN PROPOSAL",
    guidance: "Review the audience, timing, and budget before local approval.",
    content: (event) => `Campaign: ${event.event_name} premium inventory
Objective: Sell remaining individual premium seats
Audience: Approved ${event.city} market event-intent segment
Inventory: 128 synthetic premium seats
Budget cap: $2,500 synthetic demo value
Flight: 10 days, ending 48 hours before the show
Placement: Ticket marketplace promoted inventory and paid social
Approval owner: West Region Marketing

Demo note: This proposal does not create or fund a campaign.`,
  },
  dismiss: {
    channel: "AUDIT RECORD",
    guidance: "Record the reason that no recovery action is required.",
    content: `Decision: Dismiss the premium inventory alert

Reason: Add the reviewer reason here.

Demo note: This creates a local audit record only.`,
  },
};

let snapshotHash = null;
let actionId = null;
let selectedEvidence = null;
function formatNumber(value) {
  return typeof value === "number" ? new Intl.NumberFormat("en-US").format(value) : "—";
}

function formatDate(value, options = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", options).format(parsed);
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

function resetAction() {
  actionId = null;
  draft.value = "";
  draft.disabled = true;
  draftGuidance.textContent = "Select a recovery route to create a local draft.";
  draftChannel.textContent = "NOT SELECTED";
  get("#approval-state").textContent = "NO DRAFT";
  get("#approval-state").className = "task-state";
  actionButtons.forEach((button) => button.classList.remove("is-selected"));
  approve.disabled = true;
  execute.disabled = true;
  setLog("No external email or advertising action occurs in this demo.");
}

function setActionsEnabled(enabled) {
  actionButtons.forEach((button) => { button.disabled = !enabled; });
}

function renderPortfolio(rows = [], alert) {
  venueRail.replaceChildren();
  showCount.textContent = `${rows.length} ${rows.length === 1 ? "SHOW" : "SHOWS"}`;
  if (!rows.length) {
    const item = document.createElement("li");
    item.className = "venue-empty";
    item.textContent = "No portfolio evidence is available.";
    venueRail.append(item);
    return;
  }

  rows.forEach((venue) => {
    const ratio = venue.tickets_target_cumulative > 0 ? venue.tickets_sold_cumulative / venue.tickets_target_cumulative : 0;
    const isAlert = alert?.evidence?.event_id === venue.event_id;
    const date = new Date(`${venue.show_date}T12:00:00Z`);
    const item = document.createElement("li");
    item.className = `venue-item${isAlert ? " is-alert" : ""}`;

    const dateBlock = document.createElement("span");
    dateBlock.className = "venue-date";
    const month = document.createElement("span");
    month.textContent = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
    const day = document.createElement("strong");
    day.textContent = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date);
    dateBlock.append(month, day);

    const copy = document.createElement("span");
    copy.className = "venue-copy";
    const eventName = document.createElement("strong");
    eventName.textContent = venue.event_name;
    const venueName = document.createElement("span");
    venueName.textContent = `${venue.venue_name} · ${venue.city}, ${venue.state}`;
    copy.append(eventName, venueName);
    if (isAlert) {
      const flag = document.createElement("em");
      flag.className = "venue-flag";
      flag.textContent = "PREMIUM INVENTORY ALERT";
      copy.append(flag);
    }

    const score = document.createElement("span");
    score.className = "venue-score";
    if (ratio < 0.75) score.classList.add("is-below");
    score.textContent = `${Math.round(ratio * 100)}%`;
    item.append(dateBlock, copy, score);
    venueRail.append(item);
  });
}

function renderAlert(result) {
  const { alert } = result;
  const row = alert.evidence;
  const percent = Math.round(alert.ratio * 100);

  get("#event-name").textContent = row.event_name;
  get("#event-meta").textContent = `${row.venue_name} · ${row.city}, ${row.state} · ${formatDate(`${row.show_date}T12:00:00Z`)}`;
  get("#target-percent").textContent = `${percent}%`;
  get("#target-progress").style.width = `${Math.min(100, Math.max(0, percent))}%`;
  get("#tickets-sold").textContent = formatNumber(row.tickets_sold_cumulative);
  get("#tickets-target").textContent = formatNumber(row.tickets_target_cumulative);
  get("#venue-capacity").textContent = formatNumber(row.public_capacity);
  get("#data-as-of").textContent = formatDate(row.data_as_of, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  evidence.textContent = `${row.venue_name} is at ${percent}% of its cumulative ticket-sales target.`;
  marketSignal.textContent = row.market_signals.join(" ");
  rationale.textContent = result.rationale || "No model rationale is available.";
  get("#alert-placeholder").hidden = true;
  get("#combined-alert").hidden = false;
  get("#alert-state").textContent = "ACTION REQUIRED";
  get("#alert-state").className = "task-state is-alert";
  checkStatus.textContent = `1 of ${result.evidence.length} shows needs action.`;
  snapshotHash = alert.snapshotHash;
  selectedEvidence = row;
  setActionsEnabled(true);
}

function clearAlertEvidence() {
  get("#event-name").textContent = "No show selected";
  get("#event-meta").textContent = "Run the portfolio check to select the show that needs action.";
  get("#target-percent").textContent = "—";
  get("#target-progress").style.width = "0%";
  ["#tickets-sold", "#tickets-target", "#venue-capacity", "#data-as-of"].forEach((selector) => {
    get(selector).textContent = "—";
  });
}

function renderNoAlert(result) {
  clearAlertEvidence();
  const stateCopy = {
    healthy: ["PORTFOLIO ON TRACK", "No shows fall below the approved sales threshold."],
    empty: ["NO DATA", "The portfolio returned no sales evidence."],
    stale: ["STALE DATA", "The sales evidence is too old for an action recommendation."],
    error: ["CHECK FAILED", result.message || "The portfolio check could not complete."],
  };
  const [label, message] = stateCopy[result.status] || ["NO ALERT", "No action is available."];
  get("#alert-state").textContent = label;
  get("#alert-state").className = result.status === "healthy" ? "task-state is-success" : "task-state is-alert";
  get("#alert-placeholder").hidden = false;
  get("#placeholder-title").textContent = label;
  get("#placeholder-message").textContent = message;
  get("#combined-alert").hidden = true;
  rationale.textContent = message;
  checkStatus.textContent = message;
  snapshotHash = null;
  selectedEvidence = null;
  setActionsEnabled(false);
}

run.addEventListener("click", async () => {
  run.disabled = true;
  run.textContent = "Checking portfolio…";
  checkStatus.textContent = "Checking six West Region shows.";
  workArea.setAttribute("aria-busy", "true");
  resetAction();
  setActionsEnabled(false);
  try {
    const result = await requestJson("/api/sales-check", { method: "POST" });
    renderPortfolio(result.evidence || [], result.alert);
    if (result.status === "alert" && result.alert) renderAlert(result);
    else renderNoAlert(result);
  } catch (error) {
    renderPortfolio([]);
    renderNoAlert({ status: "error", message: error instanceof Error ? error.message : "The request failed." });
  } finally {
    workArea.setAttribute("aria-busy", "false");
    run.disabled = false;
    run.textContent = "Run portfolio check";
  }
});

draft.addEventListener("input", () => {
  execute.disabled = true;
  approve.disabled = !draft.value.trim();
  get("#approval-state").textContent = draft.value.trim() ? "DRAFT EDITED" : "DRAFT EMPTY";
  get("#approval-state").className = "task-state";
});

async function saveDraft() {
  if (!actionId || !draft.value.trim()) throw new Error("Draft content is required.");
  return requestJson(`/api/actions/${encodeURIComponent(actionId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: draft.value }),
  });
}

actionButtons.forEach((button) => button.addEventListener("click", async () => {
  if (!snapshotHash || !selectedEvidence || button.disabled) return;
  const type = button.dataset.action;
  const copy = actionCopy[type];
  const content = typeof copy.content === "function" ? copy.content(selectedEvidence) : copy.content;
  setActionsEnabled(false);
  setLog("Creating the local action draft.");
  try {
    const action = await requestJson("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alertSnapshotHash: snapshotHash, actionType: type, content }),
    });
    actionId = action.action_id;
    draft.value = action.content;
    draft.disabled = false;
    draftGuidance.textContent = copy.guidance;
    draftChannel.textContent = copy.channel;
    actionButtons.forEach((choice) => choice.classList.toggle("is-selected", choice === button));
    get("#approval-state").textContent = "AWAITING APPROVAL";
    get("#approval-state").className = "task-state is-alert";
    approve.disabled = !draft.value.trim();
    execute.disabled = true;
    setLog(`Local ${type === "email" ? "Outlook" : type === "social" ? "campaign" : "dismissal"} draft is ready for review.`);
    draft.focus();
  } catch (error) {
    setLog(error instanceof Error ? error.message : "The action draft could not be created.", true);
  } finally {
    setActionsEnabled(Boolean(snapshotHash));
  }
}));

approve.addEventListener("click", async () => {
  if (!actionId) return;
  approve.disabled = true;
  execute.disabled = true;
  setLog("Saving and approving the local draft.");
  try {
    await saveDraft();
    const action = await requestJson(`/api/actions/${encodeURIComponent(actionId)}/approve`, { method: "POST" });
    get("#approval-state").textContent = "APPROVED";
    get("#approval-state").className = "task-state is-success";
    setLog(`Local ${action.action_type} simulation is approved. No external action has occurred.`);
    execute.disabled = action.status !== "approved";
  } catch (error) {
    approve.disabled = false;
    setLog(error instanceof Error ? error.message : "The draft could not be approved.", true);
  }
});

execute.addEventListener("click", async () => {
  if (!actionId) return;
  execute.disabled = true;
  setLog("Executing the local simulation.");
  try {
    const action = await requestJson(`/api/actions/${encodeURIComponent(actionId)}/execute`, { method: "POST" });
    get("#approval-state").textContent = "SIMULATION COMPLETE";
    get("#approval-state").className = "task-state is-success";
    setLog(`Local ${action.action_type} simulation is complete. No external system changed.`);
    draft.disabled = true;
    approve.disabled = true;
  } catch (error) {
    execute.disabled = false;
    setLog(error instanceof Error ? error.message : "The local simulation could not complete.", true);
  }
});
