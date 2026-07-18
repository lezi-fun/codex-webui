import { describe, expect, test } from "bun:test";
import { ReviewDiffStore, parseReviewPatchRequest } from "../review-state.js";

describe("server-owned review state", () => {
  test("stores app-server diff notifications by thread and turn", () => {
    const store = new ReviewDiffStore(2);
    store.record({ threadId: "thread-1", turnId: "turn-1", diff: "diff one" });
    store.record({ threadId: "thread-2", turnId: "turn-2", diff: "diff two" });
    expect(store.get("thread-1", "turn-1")).toEqual({ threadId: "thread-1", turnId: "turn-1", diff: "diff one" });
    store.record({ threadId: "thread-3", turnId: "turn-3", diff: "diff three" });
    expect(store.get("thread-1", "turn-1")).toBeNull();
  });

  test("enforces undo then reapply without replay", () => {
    const store = new ReviewDiffStore();
    store.record({ threadId: "thread-1", turnId: "turn-1", diff: "diff one" });
    expect(() => store.begin("thread-1", "turn-1", "reapply")).toThrow(/not available/i);
    expect(store.begin("thread-1", "turn-1", "undo").diff).toBe("diff one");
    expect(() => store.begin("thread-1", "turn-1", "undo")).toThrow(/in progress/i);
    store.finish("thread-1", "turn-1", "undo", true);
    expect(() => store.begin("thread-1", "turn-1", "undo")).toThrow(/not available/i);
    expect(store.begin("thread-1", "turn-1", "reapply").diff).toBe("diff one");
    store.finish("thread-1", "turn-1", "reapply", false);
    expect(store.begin("thread-1", "turn-1", "reapply").diff).toBe("diff one");
  });

  test("rejects client-supplied cwd and diff", () => {
    expect(() => parseReviewPatchRequest({ cwd: "/tmp", diff: "malicious", action: "reapply" })).toThrow(/client-supplied/i);
    expect(() => parseReviewPatchRequest({ threadId: "thread-1", turnId: "turn-1", action: "reapply" })).not.toThrow();
    expect(parseReviewPatchRequest({ threadId: "thread-1", turnId: "turn-1", action: "undo" })).toEqual({ threadId: "thread-1", turnId: "turn-1", action: "undo" });
  });
});
