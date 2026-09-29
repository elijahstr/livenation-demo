const terminalTypes = new Set(["result", "error"]);

export function createNdjsonParser(onEvent) {
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = null;

  function consume(line) {
    if (!line.trim()) return;
    if (terminal) throw new Error("Sales-check stream sent data after its final event");
    const event = JSON.parse(line);
    if (!event || typeof event !== "object" || typeof event.type !== "string") throw new Error("Sales-check stream sent an invalid event");
    if (terminalTypes.has(event.type)) terminal = event;
    onEvent(event);
  }

  function flushLines() {
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consume);
  }

  return {
    write(chunk) {
      buffer += decoder.decode(chunk, { stream: true });
      flushLines();
    },
    end() {
      buffer += decoder.decode();
      if (buffer) consume(buffer);
      if (!terminal) throw new Error("Sales-check stream ended without a result or error");
      return terminal;
    },
  };
}

export async function readNdjsonResponse(response, onEvent) {
  if (!response.body) throw new Error("Sales-check response did not include a stream");
  const parser = createNdjsonParser(onEvent);
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.write(value);
  }
  return parser.end();
}

export function initialStreamState() {
  return { rationale: "", error: null };
}

export function reduceStreamState(state, event) {
  if (event.type === "token") return { ...state, rationale: state.rationale + (event.text ?? "") };
  if (event.type === "error") return { ...state, error: event.message ?? "The portfolio check failed." };
  if (event.type === "result") {
    const result = event.result ?? {};
    return { ...state, rationale: result.rationale ?? state.rationale, error: null };
  }
  return state;
}
