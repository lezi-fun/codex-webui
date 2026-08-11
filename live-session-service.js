import { closeSync, fstatSync, openSync, readSync } from "node:fs";

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(part => part?.text || part?.input_text || part?.output_text || "").filter(Boolean).join("\n");
}

function quotedProperty(source, name) {
  const match = String(source || "").match(new RegExp(`(?:^|[,\\s{])${name}\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`));
  if (!match) return "";
  try { return JSON.parse(match[1]); }
  catch { return ""; }
}

function commandFromToolInput(input) {
  if (!String(input || "").includes("tools.exec_command")) return "";
  return quotedProperty(input, "cmd");
}

function outputDetails(raw) {
  const text = contentText(raw);
  const marker = text.lastIndexOf("\nOutput:\n");
  let output = marker >= 0 ? text.slice(marker + 9) : "";
  let exitCode = null;
  const lines = output.trimEnd().split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed.output === "string") output = parsed.output;
      if (Number.isInteger(parsed.exit_code)) exitCode = parsed.exit_code;
      break;
    } catch { /* The visible output can contain non-JSON lines. */ }
  }
  const running = /Script running with (?:cell|session) ID/i.test(text);
  const failed = /Script (?:failed|error)/i.test(text) || (exitCode !== null && exitCode !== 0);
  return { output, exitCode, running, failed };
}

function messageItem(payload) {
  if (payload?.type !== "message" || payload.role !== "assistant") return null;
  const text = contentText(payload.content);
  if (!text) return null;
  return { id: payload.id || `host-message-${Date.now()}`, type: "agentMessage", text, phase: payload.phase || "final_answer" };
}

function reasoningItem(payload) {
  if (payload?.type !== "reasoning") return null;
  const summary = contentText(payload.summary);
  if (!summary) return null;
  return { id: payload.id || `host-reasoning-${Date.now()}`, type: "reasoning", summary: [summary], status: "completed" };
}

function newState() {
  return { active: false, turn: null, itemIndex: new Map(), commandCalls: new Map(), activeCommandId: null, lastEventAt: null };
}

function upsertItem(state, item) {
  if (!state.turn || !item?.id) return;
  const index = state.itemIndex.get(item.id);
  if (index === undefined) {
    state.itemIndex.set(item.id, state.turn.items.length);
    state.turn.items.push(item);
  } else state.turn.items[index] = { ...state.turn.items[index], ...item };
}

function finishActiveCommand(state, raw) {
  if (!state.turn || !state.activeCommandId) return;
  const index = state.itemIndex.get(state.activeCommandId);
  if (index === undefined) return;
  const current = state.turn.items[index];
  const details = outputDetails(raw);
  state.turn.items[index] = {
    ...current,
    status: details.running ? "inProgress" : details.failed ? "failed" : "completed",
    aggregatedOutput: details.output || current.aggregatedOutput || "",
    ...(details.exitCode === null ? {} : { exitCode: details.exitCode }),
  };
  if (!details.running) state.activeCommandId = null;
}

export function applyRolloutEvent(state, event) {
  if (!event || typeof event !== "object") return state;
  if (typeof event.timestamp === "string") state.lastEventAt = event.timestamp;
  const payload = event.payload || {};
  if (event.type === "event_msg" && payload.type === "task_started") {
    state.active = true;
    state.itemIndex.clear();
    state.commandCalls.clear();
    state.activeCommandId = null;
    state.turn = {
      id: payload.turn_id,
      status: "inProgress",
      itemsView: "full",
      items: [],
      ...(Number.isFinite(payload.started_at) ? { startedAt: payload.started_at } : {}),
    };
    return state;
  }
  if (!state.turn) return state;
  if (event.type === "event_msg" && payload.type === "task_complete" && payload.turn_id === state.turn.id) {
    state.active = false;
    state.turn.status = "completed";
    if (Number.isFinite(payload.completed_at)) state.turn.completedAt = payload.completed_at;
    for (const item of state.turn.items) if (item.status === "inProgress") item.status = "completed";
    state.activeCommandId = null;
    return state;
  }
  if (event.type !== "response_item") return state;
  const message = messageItem(payload);
  if (message) { upsertItem(state, message); return state; }
  const reasoning = reasoningItem(payload);
  if (reasoning) { upsertItem(state, reasoning); return state; }
  if (payload.type === "custom_tool_call") {
    const command = commandFromToolInput(payload.input);
    if (command) {
      const id = payload.id || payload.call_id;
      upsertItem(state, { id, type: "commandExecution", command, status: "inProgress", aggregatedOutput: "" });
      if (payload.call_id) state.commandCalls.set(payload.call_id, id);
      state.activeCommandId = id;
    }
    return state;
  }
  if (payload.type === "custom_tool_call_output") {
    const commandId = state.commandCalls.get(payload.call_id);
    if (commandId) state.activeCommandId = commandId;
    finishActiveCommand(state, payload.output);
    return state;
  }
  if (payload.type === "function_call_output") finishActiveCommand(state, payload.output);
  return state;
}

export function parseRollout(text) {
  const state = newState();
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    try { applyRolloutEvent(state, JSON.parse(line)); }
    catch { /* A partially-written final line is retried on the next read. */ }
  }
  return state;
}

export class LiveSessionStore {
  #entries = new Map();

  read(path) {
    let entry = this.#entries.get(path);
    const fd = openSync(path, "r");
    try {
      const size = fstatSync(fd).size;
      if (!entry || size < entry.offset) entry = { offset: 0, remainder: "", state: newState() };
      if (size > entry.offset) {
        const bytes = Buffer.allocUnsafe(size - entry.offset);
        readSync(fd, bytes, 0, bytes.length, entry.offset);
        entry.offset = size;
        const lines = (entry.remainder + bytes.toString("utf8")).split("\n");
        entry.remainder = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try { applyRolloutEvent(entry.state, JSON.parse(line)); }
          catch { /* Ignore malformed historical records. */ }
        }
      }
      this.#entries.set(path, entry);
      return {
        active: entry.state.active,
        lastEventAt: entry.state.lastEventAt,
        turn: entry.state.active && entry.state.turn ? structuredClone(entry.state.turn) : null,
      };
    } finally { closeSync(fd); }
  }

  clear() { this.#entries.clear(); }
}
