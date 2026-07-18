import { describe, expect, test } from "bun:test";
import {
  buildAccountIdentity,
  createAccountIdentityLoader,
  fetchProfileAvatar,
  isAllowedProfileAvatarUrl,
  isLocalAccountRequest,
  toPublicAccountIdentity,
} from "../profile-service.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
}

describe("account profile security", () => {
  test("publishes only same-origin display fields", () => {
    const result = toPublicAccountIdentity({
      type: "chatgpt",
      displayName: "Profile Name",
      imageUrl: "https://cdn.auth0.com/avatars/pn.png",
      email: "private@example.com",
      planType: "plus",
      initials: "PN",
    });
    expect(result).toEqual({
      type: "chatgpt",
      displayName: "Profile Name",
      avatarUrl: "/api/account/avatar",
      planType: "plus",
      initials: "PN",
    });
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(JSON.stringify(result)).not.toContain("cdn.auth0.com");
    expect(toPublicAccountIdentity({
      type: "chatgpt",
      displayName: "private@example.com",
      imageUrl: null,
      email: "private@example.com",
      planType: "plus",
      initials: "PR",
    }).displayName).toBe("Profile");
  });

  test("allows account identity only for direct localhost requests", () => {
    expect(isLocalAccountRequest("127.0.0.1", "127.0.0.1", "same-origin")).toBe(true);
    expect(isLocalAccountRequest("::1", "localhost", "none")).toBe(true);
    expect(isLocalAccountRequest("::ffff:127.0.0.1", "127.0.0.1")).toBe(true);
    expect(isLocalAccountRequest("198.51.100.20", "127.0.0.1", "same-origin")).toBe(false);
    expect(isLocalAccountRequest("127.0.0.1", "codex.example.com", "same-origin")).toBe(false);
    expect(isLocalAccountRequest("127.0.0.1", "127.0.0.1", "cross-site")).toBe(false);
  });

  test("bounds public account strings from upstream data", () => {
    const displayName = "A".repeat(500);
    const result = buildAccountIdentity(
      { account: { type: "chatgpt", email: `${"b".repeat(400)}@example.com`, planType: "p".repeat(100) } },
      { displayName, imageUrl: null, username: null },
    );
    expect(result.displayName).toHaveLength(160);
    expect(result.email).toHaveLength(320);
    expect(result.planType).toHaveLength(64);
  });

  test("accepts only known public avatar hosts", () => {
    expect(isAllowedProfileAvatarUrl("https://cdn.auth0.com/avatars/pn.png")).toBe(true);
    expect(isAllowedProfileAvatarUrl("https://files.oaiusercontent.com/file-avatar.png")).toBe(true);
    expect(isAllowedProfileAvatarUrl("https://evil.example/avatar.png")).toBe(false);
    expect(isAllowedProfileAvatarUrl("http://cdn.auth0.com/avatar.png")).toBe(false);
    expect(isAllowedProfileAvatarUrl("https://cdn.auth0.com.evil.example/avatar.png")).toBe(false);
  });

  test("proxies avatars without redirects and rejects non-image content", async () => {
    let init: RequestInit | undefined;
    const avatar = await fetchProfileAvatar("https://cdn.auth0.com/avatars/pn.png", async (_input, options) => {
      init = options;
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png", "content-length": "4" } });
    });
    expect(init?.redirect).toBe("error");
    expect(avatar.contentType).toBe("image/png");
    expect([...avatar.body]).toEqual([137, 80, 78, 71]);

    await expect(fetchProfileAvatar("https://evil.example/avatar.png", fetch)).rejects.toThrow("Avatar URL is not allowed");
    await expect(fetchProfileAvatar("https://cdn.auth0.com/avatar.txt", async () => new Response("hello", { headers: { "content-type": "text/plain" } }))).rejects.toThrow("Unsupported avatar content type");
  });

  test("does not let stale account loads replace the current cache", async () => {
    const first = deferred<{ displayName: string }>();
    const second = deferred<{ displayName: string }>();
    let calls = 0;
    const loader = createAccountIdentityLoader(async () => (++calls === 1 ? first.promise : second.promise), 60_000);

    const oldRequest = loader.get();
    loader.invalidate();
    const currentRequest = loader.get();
    second.resolve({ displayName: "Current" });
    expect(await currentRequest).toEqual({ displayName: "Current" });
    first.resolve({ displayName: "Old" });
    expect(await oldRequest).toEqual({ displayName: "Old" });
    expect(await loader.get()).toEqual({ displayName: "Current" });
  });
});
