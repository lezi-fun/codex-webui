import { describe, expect, test } from "bun:test";
import { THREAD_ACTIVE_WRITER, THREAD_NOT_FOUND, bridgeErrorCode, createBridgeError, rpcErrorPayload, threadInputErrorMessage } from "../public/bridge-errors.js";

describe("Codex bridge errors", () => {
  test("distinguishes an active thread writer from a missing thread", () => {
    const conflict = "failed to initialize thread persistence: thread-store conflict: thread 019fffa7 already has an active writer";
    expect(bridgeErrorCode(conflict)).toBe(THREAD_ACTIVE_WRITER);
    expect(threadInputErrorMessage(conflict)).toContain("another Codex app or CLI");
    expect(bridgeErrorCode("Thread not found")).toBe(THREAD_NOT_FOUND);
    expect(threadInputErrorMessage("Thread not found")).toContain("could not be found");
  });

  test("preserves the structured code across RPC payloads and browser errors", () => {
    const payload = rpcErrorPayload(7, new Error("thread abc already has an active writer"));
    expect(payload).toEqual({ type: "rpc/error", id: 7, error: "thread abc already has an active writer", code: THREAD_ACTIVE_WRITER });
    const error = createBridgeError(payload.error, payload.code);
    expect(error.message).toBe(payload.error);
    expect(error.code).toBe(THREAD_ACTIVE_WRITER);
  });
});
