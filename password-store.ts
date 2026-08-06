import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { isStoredPassword } from "./server-security.js";

export type StoredPassword = {
  version: 1;
  algorithm: "scrypt";
  salt: string;
  hash: string;
};

export function passwordStorePath(env: NodeJS.ProcessEnv = process.env) {
  if (env.CODEX_WEBUI_AUTH_STORE) return resolve(env.CODEX_WEBUI_AUTH_STORE);
  const codexHome = env.CODEX_HOME || join(homedir(), ".codex");
  return join(codexHome, "codex-webui-auth.json");
}

export function loadStoredPassword(path: string): StoredPassword | null {
  let raw: string;
  try { raw = readFileSync(path, "utf8"); }
  catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  const credential = JSON.parse(raw);
  if (!isStoredPassword(credential)) throw new Error(`Invalid Codex WebUI password store: ${path}`);
  return credential;
}

export function saveStoredPassword(path: string, credential: StoredPassword) {
  if (!isStoredPassword(credential)) throw new Error("Invalid stored password credential");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(credential, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
}
