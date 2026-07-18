import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export type CodexProfile = {
  displayName: string | null;
  imageUrl: string | null;
  username: string | null;
};

export type AccountIdentity = {
  type: "chatgpt" | "apiKey" | "amazonBedrock" | "unknown";
  displayName: string;
  imageUrl: string | null;
  email: string | null;
  planType: string | null;
  initials: string;
};

type AccountResponse = {
  account?: null | {
    type?: string;
    email?: string | null;
    planType?: string | null;
  };
  requiresOpenaiAuth?: boolean;
};

type FetchCodexProfileOptions = {
  authPath?: string;
  fetchImpl?: typeof fetch;
};

const CODEX_PROFILE_URL = "https://chatgpt.com/backend-api/wham/profiles/me";

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function profileInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "?";
}

export async function fetchCodexProfile(options: FetchCodexProfileOptions = {}): Promise<CodexProfile | null> {
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const authPath = options.authPath || process.env.CODEX_AUTH_PATH || join(codexHome, "auth.json");
  const fetchImpl = options.fetchImpl || fetch;
  const raw = JSON.parse(await readFile(authPath, "utf8"));
  const accessToken = cleanString(raw?.tokens?.access_token);
  const accountId = cleanString(raw?.tokens?.account_id);
  if (!accessToken) return null;

  const headers = new Headers({
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
    "user-agent": "Codex WebUI",
  });
  if (accountId) headers.set("chatgpt-account-id", accountId);

  const response = await fetchImpl(CODEX_PROFILE_URL, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Codex profile request failed (${response.status})`);
  const data = await response.json() as any;
  const profile = data?.profile;
  if (!profile || typeof profile !== "object") return null;
  return {
    displayName: cleanString(profile.display_name),
    imageUrl: cleanString(profile.profile_picture_url),
    username: cleanString(profile.username),
  };
}

export function buildAccountIdentity(accountResponse: AccountResponse | null | undefined, profile: CodexProfile | null): AccountIdentity {
  const account = accountResponse?.account;
  const rawType = cleanString(account?.type);
  const type: AccountIdentity["type"] = rawType === "chatgpt" || rawType === "apiKey" || rawType === "amazonBedrock" ? rawType : "unknown";
  const email = cleanString(account?.email);
  const planType = cleanString(account?.planType);
  const displayName = type === "chatgpt"
    ? profile?.displayName || email || "Profile"
    : type === "apiKey"
      ? "API key"
      : type === "amazonBedrock"
        ? "Amazon Bedrock"
        : "Settings";
  const imageUrl = type === "chatgpt" ? profile?.imageUrl || null : null;
  return { type, displayName, imageUrl, email, planType, initials: profileInitials(displayName) };
}

export async function resolveAccountIdentity(accountResponse: AccountResponse | null | undefined) {
  let profile: CodexProfile | null = null;
  if (accountResponse?.account?.type === "chatgpt") {
    try { profile = await fetchCodexProfile(); }
    catch (error) { console.warn("[codex-webui] profile request failed:", error instanceof Error ? error.message : String(error)); }
  }
  return buildAccountIdentity(accountResponse, profile);
}
