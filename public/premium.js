const $ = id => document.getElementById(id);
const chats = new Map();
const details = new Map();
let scan = null;
let selected = null;
let page = 0;
let detailGeneration = 0;
let pollTimer;
let scanRequest = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function notice(text) { $("notice").textContent = text; $("notice").hidden = !text; }
async function request(path, body) {
  const response = await fetch(path, body === undefined ? { headers: { "x-premium-request": "1" } } : { method: "POST", headers: { "content-type": "application/json", "x-premium-request": "1" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
const stateLabel = state => ({ assessed: "Assessed", deferred: "Deferred", unavailable: "Unavailable", pending: "Not yet assessed" }[state] || state);
const human = key => ({
  account_id: "Account ID", account_name: "Account", venue_name: "Venue", venue_id: "Venue ID",
  contract_end: "Contract end", latest_activity_at: "Latest activity", activity_at: "Activity date",
  activity_type: "Activity type", purchased_line_count: "Qualifying order lines", included_quantity: "Included quantity",
  accepted_ticket_uses: "Historical accepted ticket uses", net_amount: "Net amount (USD)",
  data_as_of: "Source cutoff", email: "Synthetic email", event_id: "Event", product_id: "Product",
}[key] || key.replaceAll("_", " "));

function updateUrl() {
  const url = new URL(location.href);
  if (scan) url.searchParams.set("scan", scan.id);
  if (selected) url.searchParams.set("account", selected); else url.searchParams.delete("account");
  history.pushState(null, "", url);
}
function chatState(id) {
  if (!chats.has(id)) chats.set(id, { sessionId: null, messages: [], busy: false, progress: "", error: "" });
  return chats.get(id);
}
function renderScan() {
  $("results").hidden = !scan;
  document.body.classList.toggle("has-results", !!scan);
  const running = scan?.status === "running";
  $("scan-now").disabled = running || scanRequest;
  const resumable = scan?.error === "The prior process ended before this batch completed." && Date.parse(scan.deadline_at) > Date.now();
  $("scan-now").textContent = running ? "Scan in progress…" : resumable ? "Resume scan" : "Scan now";
  $("scan-now").setAttribute("aria-busy", String(!!running));
  if (!scan) return;
  $("territory").textContent = scan.label;
  const coverage = scan.coverage;
  const elapsed = Math.round(((scan.ended_at ? Date.parse(scan.ended_at) : Date.now()) - Date.parse(scan.started_at)) / 1000);
  $("scan-status").textContent = `${running ? "In progress" : scan.status === "complete" ? "Fully assessed" : "Partial scan"} · ${elapsed}s`;
  $("coverage").textContent = `${coverage.assessed_count} assessed · ${coverage.deferred_count} deferred · ${coverage.unavailable_count} unavailable`;
  $("roster-count").textContent = coverage.authorized_count;
  if (running) {
    const phase = scan.phase.startsWith("fingerprint") ? "Check source versions"
      : scan.phase.startsWith("assessing") ? "Assess the current account group"
      : scan.phase === "loading-summary" ? "Read the approved account summaries" : "Prepare the account scan";
    $("empty-copy").textContent = `${phase}. ${coverage.assessed_count} of ${coverage.authorized_count} accounts assessed.`;
  } else $("empty-copy").textContent = "Open any account to review its evidence and start a separate conversation.";
  const search = $("search").value.trim().toLowerCase();
  const filter = $("status-filter").value;
  const accounts = scan.accounts.filter(item => (filter === "all" || item.state === filter) &&
    `${item.account.account_id} ${item.account.account_name}`.toLowerCase().includes(search));
  for (const item of scan.accounts) details.set(item.account.account_id, item);
  const pages = Math.max(1, Math.ceil(accounts.length / 50));
  page = Math.min(page, pages - 1);
  $("previous").disabled = page === 0;
  $("next").disabled = page + 1 >= pages;
  $("page-status").textContent = `${accounts.length} accounts · Page ${page + 1} of ${pages}`;
  const list = $("account-list");
  list.replaceChildren();
  for (const item of accounts.slice(page * 50, page * 50 + 50)) {
    const account = item.account;
    const button = element("button", undefined, "account-card");
    button.dataset.account = account.account_id;
    button.dataset.state = item.state;
    button.setAttribute("aria-expanded", String(account.account_id === selected));
    const initials = account.account_name.split(" ").slice(0, 2).map(word => word[0]).join("");
    button.append(element("span", initials, "initials"));
    const copy = element("span", undefined, "account-copy");
    copy.append(element("strong", account.account_name), element("small", `${account.account_id} · ${account.state}`), element("span", stateLabel(item.state), "due"));
    button.append(copy, element("span", "›", "open-arrow"));
    button.onclick = () => openAccount(account.account_id);
    list.append(button);
    if (item.summary) details.set(account.account_id, item);
  }
  $("scan-proof").hidden = false;
  const known = scan.invocations.filter(row => row.usage !== null);
  const sum = name => known.reduce((total, row) => total + (row.usage[name] ?? 0), 0);
  $("metrics").textContent = JSON.stringify({
    scan_id: scan.id, state: scan.status, consistency: scan.consistency, coverage,
    elapsed_seconds: elapsed, business_calls: scan.business_calls, model_invocations: scan.invocations.length,
    reported_input_tokens: known.length ? sum("inputTokens") : null,
    reported_output_tokens: known.length ? sum("outputTokens") : null,
    invocations_without_usage: scan.invocations.length - known.length,
    estimated_model_cost_usd: scan.invocations.length && scan.invocations.every(row => typeof row.estimated_cost_usd === "number")
      ? scan.invocations.reduce((total, row) => total + row.estimated_cost_usd, 0) : null,
    price_date: "2026-10-20", databricks_cost: "unavailable", provider_cache: "unknown",
    query_statements: scan.traces.filter(trace => trace.statementId).map(trace => trace.statementId),
    error: scan.error || null,
  }, null, 2);
  if (scan.status === "partial") notice(scan.error || "This scan is partial. Deferred and unavailable accounts remain in the list.");
  renderComposer();
}
function rowTable(row) {
  const table = element("table", undefined, "evidence-table");
  for (const [key, value] of Object.entries(row)) {
    const tr = element("tr");
    const display = value === null ? "Not supplied" : typeof value === "object" ? JSON.stringify(value) : String(value);
    tr.append(element("td", human(key)), element("td", display));
    table.append(tr);
  }
  return table;
}
function renderDetail(id) {
  if (id !== selected) return;
  const item = details.get(id) || scan?.accounts.find(value => value.account.account_id === id);
  const root = $("account-detail");
  root.replaceChildren();
  if (!item) { root.append(element("p", "Account evidence is unavailable. The account remains in the approved roster.")); return; }
  $("account-title").textContent = item.account.account_name;
  $("account-subtitle").textContent = `${id} · ${item.account.state} · ${stateLabel(item.state)}`;
  const intro = element("div", undefined, "detail-intro");
  if (item.state === "assessed" && item.result) {
    intro.append(element("div", `${item.result.state.toUpperCase()} · PROPOSED SELLER STEP`, "stage-header"), element("h3", item.result.seller_next_step),
      element("p", `Agent hypothesis: ${item.result.reason}`));
    const unknowns = [...item.result.unknowns, "Customer intent and current availability are not confirmed."];
    if (item.summary?.sections.activity?.reason?.includes("contact direction")) unknowns.push("The activity source has no message body or contact direction.");
    intro.append(element("p", `Unknowns: ${unknowns.join(" ")}`));
  } else {
    intro.append(element("h3", stateLabel(item.state)), element("p", item.reason || "The agent has not assessed this account yet."));
  }
  intro.append(element("p", "These synthetic records do not establish customer intent, future attendance, or current inventory availability.", "source-note"));
  if (scan && scan.consistency !== "stable") intro.append(element("p", "The scan did not verify final source consistency. Earlier assessments remain historical evidence.", "notice"));
  root.append(intro);
  if (item.summary) {
    const envelope = item.summary;
    root.append(element("p", `Source cutoff: ${envelope.data_as_of} · Retrieved: ${envelope.retrieved_at}`, "source-note"));
    const sections = element("div", undefined, "detail-sections");
    for (const [name, section] of Object.entries(envelope.sections)) {
      const panel = element("details");
      panel.append(element("summary", `${human(name)} · ${section.rows.length} records`));
      if (section.reason) panel.append(element("p", section.reason));
      if (!section.rows.length) panel.append(element("p", section.state === "evidence" ? "No matching records exist in this dated source result." : "This section is unavailable."));
      for (const row of section.rows) {
        const block = element("div", undefined, "evidence-row");
        block.append(rowTable(row)); panel.append(block);
      }
      sections.append(panel);
    }
    root.append(sections);
    root.append(citationPanel([envelope]));
  } else root.append(element("p", "Source details are not available yet. The account identity comes from the approved roster.", "source-note"));
}
function citationPanel(envelopes) {
  const panel = element("details", undefined, "citation");
  panel.append(element("summary", "Evidence and source records"));
  for (const envelope of envelopes) {
    panel.append(element("p", `${envelope.status} · ${envelope.data_as_of} · account ${envelope.account_id}`));
    if (envelope.error) panel.append(element("p", envelope.error));
    for (const ref of envelope.evidence) panel.append(element("p", `${ref.source_ref} · ${ref.unit} · query ${ref.query_id}`));
  }
  return panel;
}
function renderMessages(id) {
  if (id !== selected) return;
  const state = chatState(id);
  const root = $("messages");
  root.replaceChildren();
  for (const message of state.messages) {
    const wrapper = element("div", undefined, message.role === "user" ? "user-message" : "agent-message");
    if (message.role === "user") wrapper.append(element("p", message.text, "message-text"));
    else {
      wrapper.append(element("span", "✦", "message-avatar"));
      const body = element("div", undefined, "message-body");
      body.append(element("span", "ACCOUNT AGENT", "speaker"), element("p", message.text || "Response in progress…", "message-text"));
      if (message.citations?.length) body.append(citationPanel(message.citations));
      wrapper.append(body);
    }
    root.append(wrapper);
  }
  $("chat-progress").textContent = state.error || state.progress || (scan?.status === "running" ? "Chat is available after the regional scan finishes." : "");
  renderComposer();
}
function renderComposer() {
  const state = selected ? chatState(selected) : null;
  const disabled = !selected || !!state?.busy || scan?.status === "running";
  $("message").disabled = disabled;
  $("composer").querySelector("button").disabled = disabled;
  $("message").placeholder = selected ? `Ask about ${details.get(selected)?.account.account_name || selected}…` : "Select an account to start a conversation…";
  $("new-chat").hidden = !selected;
  $("new-chat").disabled = !!state?.busy || scan?.status === "running";
}
async function openAccount(id, navigate = true) {
  selected = id;
  const generation = ++detailGeneration;
  $("empty").hidden = true;
  $("account-detail").hidden = false;
  $("messages").hidden = false;
  $("account-navigation").hidden = false;
  notice("");
  if (navigate) updateUrl();
  renderScan(); renderDetail(id); renderMessages(id);
  try {
    const detail = await request(`/api/premium/accounts/${encodeURIComponent(id)}${scan ? `?scan=${encodeURIComponent(scan.id)}` : ""}`);
    details.set(id, detail);
    if (selected === id && generation === detailGeneration) renderDetail(id);
  } catch (error) { if (selected === id && generation === detailGeneration) notice(error.message); }
}
function closeAccount(navigate = true) {
  selected = null; ++detailGeneration;
  $("empty").hidden = false; $("account-detail").hidden = true; $("messages").hidden = true;
  $("account-navigation").hidden = true; $("account-title").textContent = "Your sales agent";
  $("account-subtitle").textContent = "Your region. Your accounts. One conversation."; $("chat-progress").textContent = "";
  if (navigate) updateUrl();
  renderScan(); renderComposer();
}
async function poll() {
  clearTimeout(pollTimer);
  if (!scan || scan.status !== "running") return;
  const id = scan.id;
  try {
    const next = await request(`/api/premium/scans/${encodeURIComponent(id)}`);
    if (scan?.id !== id) return;
    scan = next;
    renderScan();
    if (selected) { renderDetail(selected); renderMessages(selected); }
  } catch (error) { notice(`The scan status is unavailable: ${error.message}`); }
  if (scan?.id === id && scan.status === "running") pollTimer = setTimeout(poll, 2000);
}
$("scan-now").onclick = async () => {
  scanRequest = true; notice(""); renderScan();
  try {
    const resumeId = scan?.error === "The prior process ended before this batch completed." && Date.parse(scan.deadline_at) > Date.now() ? scan.id : undefined;
    scan = await request("/api/premium/scans", resumeId ? { resumeId } : {}); details.clear(); page = 0; closeAccount(); renderScan(); await poll();
  }
  catch (error) { notice(error.message); }
  finally { scanRequest = false; renderScan(); }
};
$("back").onclick = () => closeAccount();
$("search").oninput = () => { page = 0; renderScan(); };
$("status-filter").onchange = () => { page = 0; renderScan(); };
$("previous").onclick = () => { page--; renderScan(); };
$("next").onclick = () => { page++; renderScan(); };
$("new-chat").onclick = () => {
  if (!selected || chatState(selected).busy) return;
  chats.set(selected, { sessionId: null, messages: [], busy: false, progress: "", error: "" });
  renderMessages(selected);
};
$("composer").onsubmit = async event => {
  event.preventDefault();
  const id = selected;
  const text = $("message").value.trim();
  if (!id || !text) return;
  const state = chatState(id);
  if (state.busy) return;
  state.busy = true; state.error = ""; state.progress = "Connect to the account agent…";
  state.messages.push({ role: "user", text });
  const reply = { role: "assistant", text: "", citations: [] };
  state.messages.push(reply);
  $("message").value = ""; renderMessages(id);
  try {
    if (!state.sessionId) {
      const session = await request(`/api/premium/accounts/${encodeURIComponent(id)}/sessions`, {});
      if (session.accountId !== id) throw new Error("The server returned a different account.");
      state.sessionId = session.sessionId;
    }
    const response = await fetch(`/api/premium/accounts/${encodeURIComponent(id)}/chat`, {
      method: "POST", headers: { "content-type": "application/json", "x-premium-request": "1" },
      body: JSON.stringify({ sessionId: state.sessionId, message: text }),
    });
    if (!response.ok) { const value = await response.json(); throw new Error(value.error || "The account agent is unavailable."); }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "", finished = false;
    const consume = line => {
      if (!line.trim()) return;
      const value = JSON.parse(line);
      if (value.type === "error") throw new Error(value.message);
      if (value.type === "token") reply.text += value.text;
      if (value.type === "tool") state.progress = `${value.status === "started" ? "Read" : "Received"} ${human(value.toolName)}…`;
      if (value.type === "result") {
        const result = value.result;
        if (result.accountId !== id || result.sessionId !== state.sessionId) throw new Error("The response did not match this conversation.");
        reply.text = result.text; reply.citations = result.citations; finished = true;
        state.progress = `Response complete · ${result.toolCallCount} evidence calls`;
      }
      renderMessages(id);
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        if (pending.length > 1024 * 1024) throw new Error("The response exceeded the display limit.");
        const lines = pending.split("\n"); pending = lines.pop();
        for (const line of lines) consume(line);
      }
      if (pending.trim()) consume(pending);
      if (!finished) throw new Error("The response ended before completion. Start a new conversation.");
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } catch (error) {
    state.error = error.message;
    if (!reply.text) reply.text = "The response is unavailable. No evidence or action is confirmed.";
  } finally { state.busy = false; renderMessages(id); }
};
addEventListener("popstate", async () => {
  const params = new URL(location.href).searchParams;
  try {
    if (params.get("scan") && params.get("scan") !== scan?.id) {
      scan = await request(`/api/premium/scans/${encodeURIComponent(params.get("scan"))}`);
      details.clear(); renderScan(); void poll();
    }
    const id = params.get("account");
    if (id) await openAccount(id, false); else closeAccount(false);
  } catch (error) { notice(error.message); }
});
try {
  const params = new URL(location.href).searchParams;
  const value = await request(`/api/premium/scans/${encodeURIComponent(params.get("scan") || "latest")}`);
  if (value?.id) scan = value;
  renderScan();
  if (params.get("account")) await openAccount(params.get("account"), false);
  await poll();
} catch (error) { notice(error.message); }
