import { readNdjsonResponse } from "./stream-client.js";

const form = document.querySelector("#chat-form");
const message = document.querySelector("#chat-message");
const transcript = document.querySelector("#chat-transcript");
const status = document.querySelector("#chat-status");
const send = document.querySelector("#chat-send");
const stop = document.querySelector("#chat-stop");
const fresh = document.querySelector("#chat-new");
const traceTurns = document.querySelector("#chat-trace-turns");
let sessionId = null;
let active = null;
let needsNewChat = false;

function bubble(role, text) {
  transcript.querySelector(".chat-empty")?.remove();
  const item = document.createElement("li");
  item.className = `chat-message chat-message-${role}`;
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "YOU" : "RECOVERY AGENT";
  const content = document.createElement("p");
  content.textContent = text;
  item.append(label, content);
  transcript.append(item);
  return content;
}
function busy(value) {
  send.disabled = value || needsNewChat;
  fresh.disabled = value;
  message.disabled = value;
  stop.hidden = !value;
}
async function checked(response) {
  if (response.ok) return response;
  const result = await response.json().catch(() => ({}));
  const error = new Error(result.error || "The request failed. Try again.");
  error.status = response.status;
  throw error;
}
async function ensureSession(signal) {
  if (sessionId) return;
  const response = await checked(await fetch("/api/chat/sessions", { method: "POST", headers: { "content-type": "application/json" }, signal }));
  const result = await response.json();
  sessionId = result.sessionId;
}
function addTrace(event) {
  if (typeof event.runtimeSessionId !== "string") return;
  const item = document.createElement("li");
  const code = document.createElement("code");
  code.textContent = event.runtimeSessionId;
  item.append(document.createTextNode(`Turn ${traceTurns.children.length + 1}: `), code);
  traceTurns.append(item);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = message.value.trim();
  if (!text || active || needsNewChat) return;
  const controller = new AbortController();
  active = controller;
  busy(true);
  status.textContent = "The agent will reply here.";
  let answer;
  let terminal = false;
  let turnRequested = false;
  try {
    await ensureSession(controller.signal);
    turnRequested = true;
    const response = await checked(await fetch("/api/chat/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, message: text }), signal: controller.signal }));
    bubble("user", text);
    message.value = "";
    answer = bubble("assistant", "");
    await readNdjsonResponse(response, (item) => {
      if (item.type === "session") {
        document.querySelector("#chat-conversation").textContent = `Conversation: ${item.sessionId}`;
        addTrace(item);
      }
      if (item.type === "token") answer.textContent += item.text;
      if (item.type === "tool") status.textContent = item.status === "completed" ? "The evidence is ready." : "The agent requested sales evidence.";
      if (item.type === "result") {
        terminal = true;
        answer.textContent = item.result.text;
        status.textContent = "Reply complete. Ask a follow-up.";
        const sources = [...new Set(item.result.sourceTimes ?? [])];
        if (sources.length && traceTurns.lastElementChild) {
          const detail = document.createElement("span");
          detail.textContent = ` · Data as of ${sources.join(", ")}`;
          traceTurns.lastElementChild.append(detail);
        }
      }
      if (item.type === "error") {
        terminal = true;
        status.textContent = item.message;
        if (!answer.textContent) answer.textContent = item.message;
        answer.parentElement.classList.add("chat-message-error");
        if (item.newChatRequired) { sessionId = null; needsNewChat = true; }
      }
    });
    if (!terminal) throw new Error("The response ended early. Start a new chat.");
  } catch (error) {
    const interrupted = controller.signal.aborted;
    const explanation = interrupted ? "Stopped locally. AWS may finish its current request. Start a new chat." : error.message;
    status.textContent = explanation;
    if (answer) {
      if (!answer.textContent) answer.textContent = explanation;
      const note = document.createElement("small");
      note.textContent = interrupted ? "STOPPED" : "NOT COMPLETE";
      answer.parentElement.append(note);
    }
    if (turnRequested && (interrupted || !error.status || error.status === 404 || error.message.includes("new chat"))) {
      sessionId = null;
      needsNewChat = true;
    }
  } finally {
    active = null;
    busy(false);
    message.focus();
  }
});
message.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
});
stop.addEventListener("click", () => active?.abort());
fresh.addEventListener("click", () => {
  if (active) return;
  sessionId = null;
  needsNewChat = false;
  send.disabled = false;
  transcript.replaceChildren();
  traceTurns.replaceChildren();
  document.querySelector("#chat-conversation").textContent = "";
  message.value = "";
  status.textContent = "New chat. Ask about the West portfolio.";
  message.focus();
});
