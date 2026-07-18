export class ReviewDiffStore {
  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  record({ threadId, turnId, diff }) {
    if (typeof threadId !== "string" || typeof turnId !== "string" || typeof diff !== "string" || !threadId || !turnId || !diff) return;
    const key = `${threadId}\0${turnId}`;
    this.entries.delete(key);
    this.entries.set(key, { threadId, turnId, diff, state: "ready", busy: false });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }

  get(threadId, turnId) {
    const entry = this.entries.get(`${threadId}\0${turnId}`);
    return entry ? { threadId: entry.threadId, turnId: entry.turnId, diff: entry.diff } : null;
  }

  begin(threadId, turnId, action) {
    const entry = this.entries.get(`${threadId}\0${turnId}`);
    if (!entry) throw new Error("Review diff is unavailable or expired");
    if (entry.busy) throw new Error("Review operation is already in progress");
    if (action === "undo" && entry.state !== "ready") throw new Error("Undo is not available for this review diff");
    if (action === "reapply" && entry.state !== "undone") throw new Error("Reapply is not available for this review diff");
    entry.busy = true;
    return { threadId: entry.threadId, turnId: entry.turnId, diff: entry.diff };
  }

  finish(threadId, turnId, action, success) {
    const entry = this.entries.get(`${threadId}\0${turnId}`);
    if (!entry) return;
    entry.busy = false;
    if (success) entry.state = action === "undo" ? "undone" : "ready";
  }

  clear() {
    this.entries.clear();
  }
}

export function parseReviewPatchRequest(value) {
  if (!value || typeof value !== "object") throw new Error("Missing review patch parameters");
  if (Object.prototype.hasOwnProperty.call(value, "cwd") || Object.prototype.hasOwnProperty.call(value, "diff")) {
    throw new Error("Client-supplied cwd and diff are not allowed");
  }
  const { threadId, turnId, action } = value;
  if (typeof threadId !== "string" || !threadId || threadId.length > 256 || typeof turnId !== "string" || !turnId || turnId.length > 256) {
    throw new Error("Missing review patch parameters");
  }
  if (action !== "undo" && action !== "reapply") throw new Error("Unsupported review action");
  return { threadId, turnId, action };
}
