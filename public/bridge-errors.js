export const THREAD_ACTIVE_WRITER = "thread_active_writer";
export const THREAD_NOT_FOUND = "thread_not_found";

export function bridgeErrorMessage(value, fallback = "Codex request failed") {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.message === "string" && value.message.trim()) return value.message.trim();
  return fallback;
}

export function bridgeErrorCode(value) {
  if (value && typeof value === "object" && typeof value.code === "string" && value.code) return value.code;
  const message = bridgeErrorMessage(value, "");
  if (/thread-store conflict|already has an active writer/i.test(message)) return THREAD_ACTIVE_WRITER;
  if (/\bthread(?:\s+[0-9a-f-]+)?\s+(?:was\s+)?not found\b/i.test(message)) return THREAD_NOT_FOUND;
  return "codex_error";
}

export function createBridgeError(value, code = "") {
  const error = new Error(bridgeErrorMessage(value));
  error.code = code || bridgeErrorCode(value);
  return error;
}

export function rpcErrorPayload(id, value) {
  return {
    type: "rpc/error",
    id,
    error: bridgeErrorMessage(value),
    code: bridgeErrorCode(value),
  };
}

export function threadInputErrorMessage(value) {
  const code = bridgeErrorCode(value);
  if (code === THREAD_ACTIVE_WRITER) return "This task is currently running in another Codex app or CLI. Close it there, then try again.";
  if (code === THREAD_NOT_FOUND) return "This task could not be found. Refresh the task list and try again.";
  return bridgeErrorMessage(value);
}
