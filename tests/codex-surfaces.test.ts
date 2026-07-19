import { describe, expect, test } from "bun:test";
import {
  buildApprovalModel,
  parseUnifiedDiff,
  summarizeActivity,
  createReviewPreferences,
  splitDiffHunk,
} from "../public/codex-surfaces.js";

describe("Codex approval surfaces", () => {
  test("models command approval with ordered Codex decisions", () => {
    const model = buildApprovalModel({
      method: "item/commandExecution/requestApproval",
      params: {
        command: "bun test tests/ui.test.ts",
        cwd: "/home/test-user/projects/codex-webui",
        reason: "Run the focused test suite",
        proposedExecpolicyAmendment: ["bun", "test"],
        availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
      },
    });
    expect(model.kind).toBe("exec");
    expect(model.identity).toBe("Terminal");
    expect(model.title).toBe("Allow ChatGPT to run this command?");
    expect(model.primary.label).toBe("Allow once");
    expect(model.scoped?.label).toBe("Allow similar commands");
    expect(model.scoped?.decision).toEqual({
      acceptWithExecpolicyAmendment: { execpolicy_amendment: ["bun", "test"] },
    });
    expect(model.deny.decision).toBe("decline");
    expect(model.cancel).toBeNull();
  });

  test("models file approval with conversation scope", () => {
    const model = buildApprovalModel({
      method: "item/fileChange/requestApproval",
      params: { reason: "Write the generated files", grantRoot: "/home/test-user/projects/codex-webui" },
    });
    expect(model.kind).toBe("patch");
    expect(model.identity).toBe("Edit files");
    expect(model.title).toBe("Allow ChatGPT to edit the following files?");
    expect(model.scoped?.label).toBe("Allow all edits");
    expect(model.scoped?.decision).toBe("acceptForSession");
  });

  test("returns the exact permissions object and selected scope", () => {
    const permissions = { network: { enabled: true }, fileSystem: { read: ["/tmp"] } };
    const model = buildApprovalModel({
      method: "item/permissions/requestApproval",
      params: { reason: "Access network and temporary files", permissions },
    });
    expect(model.kind).toBe("permission");
    expect(model.identity).toBe("Permissions");
    expect(model.title).toBe("Allow ChatGPT to connect to the internet and view the contents of /tmp?");
    expect(model.primary.decision).toEqual({ permissions, scope: "turn", strictAutoReview: false });
    expect(model.scoped?.decision).toEqual({ permissions, scope: "session", strictAutoReview: false });
    expect(model.deny.decision).toEqual({ permissions: {}, scope: "turn" });
  });

  test("keeps persistent network policy separate from the session scope action", () => {
    const amendment = { action: "allow", host: "registry.npmjs.org" };
    const model = buildApprovalModel({
      method: "item/commandExecution/requestApproval",
      params: {
        networkApprovalContext: { host: amendment.host },
        proposedNetworkPolicyAmendments: [amendment],
      },
    });
    expect(model.title).toBe("Allow ChatGPT to connect to registry.npmjs.org?");
    expect(model.leading?.label).toBe("Always allow registry.npmjs.org");
    expect(model.leading?.decision).toEqual({ applyNetworkPolicyAmendment: { network_policy_amendment: amendment } });
    expect(model.scoped?.decision).toBe("acceptForSession");
  });
});

describe("Codex review surfaces", () => {
  test("parses aggregated unified diffs into changed files and lines", () => {
    const review = parseUnifiedDiff(`diff --git a/src/a.ts b/src/a.ts\nindex 111..222 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n const a = 1;\n-const old = true;\n+const next = true;\n+export { next };\ndiff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n`);
    expect(review.fileCount).toBe(2);
    expect(review.linesAdded).toBe(3);
    expect(review.linesDeleted).toBe(2);
    expect(review.files[0].path).toBe("src/a.ts");
    expect(review.files[0].hunks[0].lines[1].type).toBe("delete");
    expect(review.files[0].hunks[0].lines[2].type).toBe("add");
  });
});

describe("Codex review controls", () => {
  test("restores only supported review preferences", () => {
    expect(createReviewPreferences({ mode: "split", wrap: true, expanded: false })).toEqual({ mode: "split", wrap: true, expanded: false });
    expect(createReviewPreferences({ mode: "broken", wrap: "yes" })).toEqual({ mode: "unified", wrap: false, expanded: true });
  });

  test("aligns deletion and insertion blocks for split diff", () => {
    const rows = splitDiffHunk({ lines: [
      { type: "context", text: "same" },
      { type: "delete", text: "old one" },
      { type: "delete", text: "old two" },
      { type: "add", text: "new one" },
      { type: "context", text: "after" },
    ] });
    expect(rows).toEqual([
      { left: { type: "context", text: "same" }, right: { type: "context", text: "same" } },
      { left: { type: "delete", text: "old one" }, right: { type: "add", text: "new one" } },
      { left: { type: "delete", text: "old two" }, right: null },
      { left: { type: "context", text: "after" }, right: { type: "context", text: "after" } },
    ]);
  });
});

describe("Codex execution state", () => {
  test("uses active and completed copy driven by item status", () => {
    expect(summarizeActivity({ type: "commandExecution", status: "inProgress", command: "bun test" })).toMatchObject({ label: "Running command", active: true, animation: "run-command" });
    expect(summarizeActivity({ type: "fileChange", status: "completed", changes: [{ path: "a.ts" }] })).toMatchObject({ label: "Edited a file", active: false, animation: "edit-files" });
    expect(summarizeActivity({ type: "webSearch", status: "failed", query: "Codex" })).toMatchObject({ label: "Search failed", active: false, tone: "error" });
  });

  test("uses native exploration verbs for file commands", () => {
    expect(summarizeActivity({ type: "commandExecution", status: "inProgress", command: "cat public/app.js" })).toMatchObject({ label: "Reading", detail: "public/app.js", category: "read", active: true });
    expect(summarizeActivity({ type: "commandExecution", status: "completed", command: "cat public/app.js" })).toMatchObject({ label: "Read", detail: "public/app.js", category: "read", active: false });
    expect(summarizeActivity({ type: "commandExecution", status: "inProgress", command: "rg -n native public" })).toMatchObject({ label: "Searching", category: "search", active: true });
    expect(summarizeActivity({ type: "commandExecution", status: "completed", command: "ls public" })).toMatchObject({ label: "Listed", detail: "public", category: "list", active: false });
  });

  test("does not disguise compound or mutating commands as exploration", () => {
    expect(summarizeActivity({ type: "commandExecution", status: "inProgress", command: "cat public/app.js && rm public/app.js" })).toMatchObject({ label: "Running command", detail: "cat public/app.js && rm public/app.js", category: "command" });
    expect(summarizeActivity({ type: "commandExecution", status: "completed", command: "find . -delete" })).toMatchObject({ label: "Ran command", detail: "find . -delete", category: "command" });
    expect(summarizeActivity({ type: "commandExecution", status: "completed", command: "fd native public --exec rm {}" })).toMatchObject({ label: "Ran command", detail: "fd native public --exec rm {}", category: "command" });
    expect(summarizeActivity({ type: "commandExecution", status: "completed", command: "find . -fprint /tmp/out" })).toMatchObject({ label: "Ran command", detail: "find . -fprint /tmp/out", category: "command" });
    expect(summarizeActivity({ type: "commandExecution", status: "completed", command: "find . -fls /tmp/out" })).toMatchObject({ label: "Ran command", detail: "find . -fls /tmp/out", category: "command" });
    expect(summarizeActivity({ type: "commandExecution", status: "completed", command: "fd native public --exec=rm {}" })).toMatchObject({ label: "Ran command", detail: "fd native public --exec=rm {}", category: "command" });
  });
});


describe("Codex motion constants", () => {
  test("matches animation timing extracted from Codex.app", async () => {
    const { CODEX_MOTION } = await import("../public/codex-surfaces.js");
    expect(CODEX_MOTION.shimmer).toEqual({ durationMs: 2000, steps: 48, from: "-100%", to: "250%" });
    expect(CODEX_MOTION.approvalEnter).toBeNull();
    expect(CODEX_MOTION.accordion).toEqual({ durationMs: 300, easing: "cubic-bezier(.19,1,.22,1)" });
  });
});
