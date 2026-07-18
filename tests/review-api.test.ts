import { describe, expect, test } from "bun:test";

const base = "http://127.0.0.1:8899";

describe("review patch HTTP API", () => {
  test("requires POST and validates its JSON payload", async () => {
    const get = await fetch(`${base}/api/review/patch`);
    expect(get.status).toBe(405);

    const invalid = await fetch(`${base}/api/review/patch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "Missing review patch parameters" });

    const injected = await fetch(`${base}/api/review/patch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cwd: "/tmp", diff: "diff --git a/a b/a", action: "reapply" }),
    });
    expect(injected.status).toBe(400);
    expect(await injected.json()).toMatchObject({ error: expect.stringMatching(/client-supplied/i) });
  });
});
