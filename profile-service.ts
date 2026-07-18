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

export type PublicAccountIdentity = {
  type: AccountIdentity["type"];
  displayName: string;
  avatarUrl: string | null;
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
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);
const ALLOWED_AVATAR_HOSTS = new Set(["cdn.auth0.com", "files.oaiusercontent.com"]);

function cleanString(value: unknown, maxLength = 512) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

export function profileInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "?";
}

export function isAllowedProfileAvatarUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_AVATAR_HOSTS.has(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isLocalAccountRequest(remoteAddress: string | undefined, hostHeader: string | undefined, fetchSite?: string) {
  const remote = (remoteAddress || "").replace(/^::ffff:/, "");
  const remoteIsLoopback = remote === "127.0.0.1" || remote === "::1";
  if (!remoteIsLoopback || !hostHeader || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) return false;
  try {
    const hostname = new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
  } catch {
    return false;
  }
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

  const response = await fetchImpl(CODEX_PROFILE_URL, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Codex profile request failed (${response.status})`);
  const data = await response.json() as any;
  const profile = data?.profile;
  if (!profile || typeof profile !== "object") return null;
  return {
    displayName: cleanString(profile.display_name, 160),
    imageUrl: cleanString(profile.profile_picture_url, 2_048),
    username: cleanString(profile.username, 160),
  };
}

export async function fetchProfileAvatar(imageUrl: string, fetchImpl: typeof fetch = fetch) {
  if (!isAllowedProfileAvatarUrl(imageUrl)) throw new Error("Avatar URL is not allowed");
  const response = await fetchImpl(imageUrl, {
    headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Avatar request failed (${response.status})`);
  const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (!ALLOWED_AVATAR_TYPES.has(contentType)) throw new Error("Unsupported avatar content type");
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_AVATAR_BYTES) throw new Error("Avatar response is too large");

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Avatar response has no body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_AVATAR_BYTES) {
      await reader.cancel();
      throw new Error("Avatar response is too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, contentType };
}

export function buildAccountIdentity(accountResponse: AccountResponse | null | undefined, profile: CodexProfile | null): AccountIdentity {
  const account = accountResponse?.account;
  const rawType = cleanString(account?.type);
  const type: AccountIdentity["type"] = rawType === "chatgpt" || rawType === "apiKey" || rawType === "amazonBedrock" ? rawType : "unknown";
  const email = cleanString(account?.email, 320);
  const planType = cleanString(account?.planType, 64);
  const profileDisplayName = cleanString(profile?.displayName, 160);
  const displayName = type === "chatgpt"
    ? profileDisplayName || email || "Profile"
    : type === "apiKey"
      ? "API key"
      : type === "amazonBedrock"
        ? "Amazon Bedrock"
        : "Settings";
  const imageUrl = type === "chatgpt" && isAllowedProfileAvatarUrl(profile?.imageUrl) ? profile!.imageUrl : null;
  return { type, displayName, imageUrl, email, planType, initials: profileInitials(displayName) };
}

export function toPublicAccountIdentity(identity: AccountIdentity): PublicAccountIdentity {
  const displayName = identity.email && identity.displayName.toLowerCase() === identity.email.toLowerCase()
    ? "Profile"
    : identity.displayName;
  return {
    type: identity.type,
    displayName,
    avatarUrl: identity.imageUrl ? "/api/account/avatar" : null,
    planType: identity.planType,
    initials: profileInitials(displayName),
  };
}

export function createAccountIdentityLoader<T>(load: (refresh: boolean) => Promise<T>, ttlMs = 5 * 60_000) {
  let generation = 0;
  let cache: { generation: number; expiresAt: number; value: T } | null = null;
  let inFlight: { generation: number; promise: Promise<T> } | null = null;

  const invalidate = () => {
    generation += 1;
    cache = null;
    inFlight = null;
  };

  const get = (refresh = false) => {
    if (refresh) invalidate();
    const currentGeneration = generation;
    if (cache && cache.generation === currentGeneration && cache.expiresAt > Date.now()) return Promise.resolve(cache.value);
    if (inFlight?.generation === currentGeneration) return inFlight.promise;
    const promise = load(refresh).then(value => {
      if (generation === currentGeneration) cache = { generation: currentGeneration, expiresAt: Date.now() + ttlMs, value };
      return value;
    }).finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { generation: currentGeneration, promise };
    return promise;
  };

  return { get, invalidate };
}

export async function resolveAccountIdentity(accountResponse: AccountResponse | null | undefined) {
  let profile: CodexProfile | null = null;
  if (accountResponse?.account?.type === "chatgpt") {
    try { profile = await fetchCodexProfile(); }
    catch (error) { console.warn("[codex-webui] profile request failed:", error instanceof Error ? error.message : String(error)); }
  }
  return buildAccountIdentity(accountResponse, profile);
}
