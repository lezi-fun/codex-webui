import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildAccountIdentity, fetchCodexProfile, profileInitials } from "../profile-service.js";

const temporaryDirectories: string[] = [];
afterEach(() => {
  while (temporaryDirectories.length) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
});

describe("Codex account profile", () => {
  test("uses the same authenticated profile endpoint as Codex Desktop without exposing tokens", async () => {
    const directory = mkdtempSync(join(tmpdir(), "codex-webui-profile-"));
    temporaryDirectories.push(directory);
    const authPath = join(directory, "auth.json");
    writeFileSync(authPath, JSON.stringify({
      tokens: {
        access_token: "test-access-token",
        account_id: "account-123",
        refresh_token: "must-not-leak",
      },
    }));

    let request: Request | undefined;
    const profile = await fetchCodexProfile({
      authPath,
      fetchImpl: async (input, init) => {
        request = new Request(input, init);
        return Response.json({
          profile: {
            username: "zimu",
            display_name: "Zimu Yang",
            profile_picture_url: "https://cdn.example/avatar.png",
          },
          stats: {},
          metadata: {},
        });
      },
    });

    expect(request?.url).toBe("https://chatgpt.com/backend-api/wham/profiles/me");
    expect(request?.headers.get("authorization")).toBe("Bearer test-access-token");
    expect(request?.headers.get("chatgpt-account-id")).toBe("account-123");
    expect(profile).toEqual({
      displayName: "Zimu Yang",
      imageUrl: "https://cdn.example/avatar.png",
      username: "zimu",
    });
    expect(JSON.stringify(profile)).not.toContain("test-access-token");
    expect(JSON.stringify(profile)).not.toContain("must-not-leak");
  });

  test("follows the Desktop fallback order for account labels", () => {
    expect(buildAccountIdentity(
      { account: { type: "chatgpt", email: "person@example.com", planType: "plus" }, requiresOpenaiAuth: true },
      { displayName: "Profile Name", imageUrl: "https://cdn.example/avatar.png", username: "profile" },
    )).toEqual({
      type: "chatgpt",
      displayName: "Profile Name",
      imageUrl: "https://cdn.example/avatar.png",
      email: "person@example.com",
      planType: "plus",
      initials: "PN",
    });

    expect(buildAccountIdentity(
      { account: { type: "chatgpt", email: "person@example.com", planType: "plus" }, requiresOpenaiAuth: true },
      null,
    ).displayName).toBe("person@example.com");
    expect(buildAccountIdentity({ account: { type: "apiKey" }, requiresOpenaiAuth: true }, null).displayName).toBe("API key");
    expect(buildAccountIdentity({ account: null, requiresOpenaiAuth: true }, null).displayName).toBe("Settings");
  });

  test("creates the same compact two-letter fallback used by the sidebar avatar", () => {
    expect(profileInitials("Zimu Yang")).toBe("ZY");
    expect(profileInitials(" Codex ")).toBe("CO");
    expect(profileInitials("")).toBe("?");
  });
});
