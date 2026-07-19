export const CODEX_MOTION = Object.freeze({
  shimmer: Object.freeze({ durationMs: 2000, steps: 48, from: "-100%", to: "250%" }),
  approvalEnter: null,
  accordion: Object.freeze({ durationMs: 300, easing: "cubic-bezier(.19,1,.22,1)" }),
});

const hasDecision = (available, name) => !Array.isArray(available) || available.some((decision) => {
  if (typeof decision === "string") return decision === name;
  return decision && typeof decision === "object" && name in decision;
});

export function buildApprovalModel(request) {
  const method = request.method;
  const params = request.params || {};
  const available = params.availableDecisions;
  const base = {
    reason: params.reason || null,
    cwd: params.cwd || null,
    command: params.command || null,
    primary: { label: "Allow once", decision: "accept" },
    deny: { label: "Deny", decision: "decline" },
    cancel: null,
    leading: null,
    scoped: null,
  };

  if (method === "item/commandExecution/requestApproval") {
    let scoped = hasDecision(available, "acceptForSession")
      ? { label: "Allow this conversation", decision: "acceptForSession" }
      : null;
    if (params.proposedExecpolicyAmendment?.length && params.proposedExecpolicyAmendment.every((line) => !/[\r\n]/.test(line))) {
      scoped = {
        label: "Allow similar commands",
        decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: params.proposedExecpolicyAmendment } },
      };
    }
    const network = params.networkApprovalContext;
    if (params.proposedNetworkPolicyAmendments?.length && hasDecision(available, "applyNetworkPolicyAmendment")) {
      const amendment = params.proposedNetworkPolicyAmendments.find((entry) => entry.action === "allow") || params.proposedNetworkPolicyAmendments[0];
      const leading = {
        label: amendment?.host ? `Always allow ${amendment.host}` : "Always allow",
        decision: { applyNetworkPolicyAmendment: { network_policy_amendment: amendment } },
      };
      return {
        ...base,
        kind: "network",
        identity: "Internet access",
        title: `Allow ChatGPT to connect to ${network?.host || amendment?.host || "the internet"}?`,
        subtitle: `${network?.host || amendment?.host} isn't on the current network allowlist`,
        scoped: hasDecision(available, "acceptForSession") ? { label: "Allow this conversation", decision: "acceptForSession" } : null,
        leading,
      };
    }
    return {
      ...base,
      kind: network ? "network" : "exec",
      identity: network ? "Internet access" : "Terminal",
      title: network ? `Allow ChatGPT to connect to ${network.host || "the internet"}?` : "Allow ChatGPT to run this command?",
      subtitle: network?.host ? `${network.host} isn't on the current network allowlist` : params.cwd || null,
      scoped,
    };
  }

  if (method === "item/fileChange/requestApproval") {
    return {
      ...base,
      kind: "patch",
      identity: "Edit files",
      title: `Allow ChatGPT to edit the following ${params.fileCount === 1 ? "file" : "files"}?`,
      subtitle: params.grantRoot || null,
      scoped: hasDecision(available, "acceptForSession")
        ? { label: "Allow all edits", decision: "acceptForSession" }
        : null,
    };
  }

  if (method === "item/permissions/requestApproval") {
    const permissions = params.permissions || {};
    const rows = permissionRows(permissions);
    const network = permissions.network?.enabled;
    const reads = rows.filter((row) => row.label === "Read").map((row) => row.value);
    const writes = rows.filter((row) => row.label === "Write").map((row) => row.value);
    const paths = [...new Set([...reads, ...writes])].join(", ");
    let action = network ? "connect to the internet" : "";
    const fileAction = reads.length && writes.length ? `view and edit the contents of ${paths}` : writes.length ? `edit the contents of ${paths}` : reads.length ? `view the contents of ${paths}` : "";
    if (action && fileAction) action += ` and ${fileAction}`; else action ||= fileAction || "use additional permissions";
    const decision = (scope) => ({ permissions, scope, strictAutoReview: false });
    return {
      ...base,
      kind: "permission",
      identity: network && !fileAction ? "Internet access" : "Permissions",
      title: `Allow ChatGPT to ${action}?`,
      subtitle: params.reason || null,
      reason: null,
      primary: { label: "Allow once", decision: decision("turn") },
      scoped: { label: "Allow this conversation", decision: decision("session") },
      deny: { label: "Deny", decision: { permissions: {}, scope: "turn" } },
      cancel: null,
      permissions,
    };
  }

  throw new Error(`Unsupported approval request: ${method}`);
}

function cleanDiffPath(value = "") {
  return value.replace(/^[ab]\//, "").replace(/\t.*$/, "");
}

export function parseUnifiedDiff(diff = "") {
  const files = [];
  let file = null;
  let hunk = null;
  let linesAdded = 0;
  let linesDeleted = 0;
  for (const raw of String(diff).split("\n")) {
    const git = raw.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (git) {
      file = { path: git[2], oldPath: git[1], linesAdded: 0, linesDeleted: 0, hunks: [] };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file && raw.startsWith("+++ ")) {
      file = { path: cleanDiffPath(raw.slice(4)), oldPath: "", linesAdded: 0, linesDeleted: 0, hunks: [] };
      files.push(file);
    }
    if (!file) continue;
    if (raw.startsWith("--- ")) { file.oldPath = cleanDiffPath(raw.slice(4)); continue; }
    if (raw.startsWith("+++ ")) { file.path = cleanDiffPath(raw.slice(4)); continue; }
    if (raw.startsWith("@@")) {
      hunk = { header: raw, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    let type = "context";
    if (raw.startsWith("+") && !raw.startsWith("+++")) { type = "add"; file.linesAdded++; linesAdded++; }
    else if (raw.startsWith("-") && !raw.startsWith("---")) { type = "delete"; file.linesDeleted++; linesDeleted++; }
    else if (raw.startsWith("\\ No newline")) type = "meta";
    hunk.lines.push({ type, text: raw.slice(type === "add" || type === "delete" || type === "context" ? 1 : 0) });
  }
  return { hasChanges: files.length > 0 && (linesAdded + linesDeleted > 0), fileCount: files.length, linesAdded, linesDeleted, files };
}

function shellWords(command = "") {
  return String(command).match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+/g)?.map((word) => word.replace(/^(['"])(.*)\1$/, "$2")) || [];
}

function hasShellControl(command = "") {
  let quote = null;
  const value = String(command);
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "\\" && quote !== "'") { index++; continue; }
    if (char === "'" || char === '"') {
      if (quote === char) quote = null;
      else if (quote == null) quote = char;
      continue;
    }
    if (quote !== "'" && (char === "`" || (char === "$" && value[index + 1] === "("))) return true;
    if (quote == null && (";&|<>\n\r".includes(char))) return true;
  }
  return false;
}

function explorationCommand(command = "") {
  if (hasShellControl(command)) return null;
  const words = shellWords(command);
  const name = words[0]?.split("/").at(-1);
  const hasOption = (options) => words.some((word) => options.some((option) => word === option || word.startsWith(`${option}=`)));
  if (name === "find" && hasOption(["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"])) return null;
  if (name === "fd" && hasOption(["-x", "-X", "--exec", "--exec-batch"])) return null;
  if (["cat", "head", "tail", "bat", "less"].includes(name)) {
    const target = [...words.slice(1)].reverse().find((word) => !word.startsWith("-")) || "file";
    return { category: "read", detail: target, activeLabel: "Reading", completedLabel: "Read", animation: "local-context" };
  }
  if (["rg", "grep", "ag", "ack"].includes(name)) {
    const values = words.slice(1).filter((word) => !word.startsWith("-"));
    const query = values[0];
    return { category: "search", detail: query ? `for ${query}` : "files", activeLabel: "Searching", completedLabel: "Searched", animation: "searching" };
  }
  if (["ls", "find", "fd"].includes(name)) {
    const target = words.slice(1).find((word) => !word.startsWith("-")) || "files";
    return { category: "list", detail: target, activeLabel: "Listing", completedLabel: "Listed", animation: "local-context" };
  }
  return null;
}

export function summarizeActivity(item) {
  const status = item.status || "completed";
  const active = status === "inProgress";
  const failed = status === "failed" || status === "declined";
  if (item.type === "commandExecution") {
    const exploration = explorationCommand(item.command);
    if (exploration && !failed) return {
      label: active ? exploration.activeLabel : exploration.completedLabel,
      detail: exploration.detail,
      category: exploration.category,
      animation: exploration.animation,
      active,
      tone: active ? "active" : "success",
    };
    return {
      label: active ? "Running command" : failed ? "Command failed" : "Ran command",
      detail: item.command || "",
      category: "command",
      animation: "run-command",
      active,
      tone: failed ? "error" : active ? "active" : "success",
    };
  }
  if (item.type === "fileChange") {
    const count = item.changes?.length || 0;
    return {
      label: active ? "Editing files" : failed ? "File edit failed" : count === 1 ? "Edited a file" : "Edited files",
      detail: (item.changes || []).map((change) => change.path || change.filePath).filter(Boolean).join(", "),
      animation: "edit-files",
      active,
      tone: failed ? "error" : active ? "active" : "success",
    };
  }
  if (item.type === "webSearch") return {
    label: active ? "Searching the web" : failed ? "Search failed" : "Searched the web",
    detail: item.query || "",
    animation: "searching",
    active,
    tone: failed ? "error" : active ? "active" : "success",
  };
  if (item.type === "reasoning") return { label: active ? "Thinking" : "Thought", detail: "", animation: "local-context", active, tone: failed ? "error" : active ? "active" : "success" };
  return { label: active ? "Working" : failed ? "Tool failed" : "Completed", detail: item.tool || item.type || "", animation: "local-context", active, tone: failed ? "error" : active ? "active" : "success" };
}

export function createReviewPreferences(value = {}) {
  return {
    mode: value.mode === "split" ? "split" : "unified",
    wrap: value.wrap === true,
    expanded: value.expanded !== false,
  };
}

export function splitDiffHunk(hunk = { lines: [] }) {
  const rows = [];
  const lines = hunk.lines || [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line.type !== "delete" && line.type !== "add") {
      rows.push({ left: line, right: line });
      index++;
      continue;
    }
    const deletes = [];
    const adds = [];
    while (index < lines.length && lines[index].type === "delete") deletes.push(lines[index++]);
    while (index < lines.length && lines[index].type === "add") adds.push(lines[index++]);
    const count = Math.max(deletes.length, adds.length);
    for (let row = 0; row < count; row++) rows.push({ left: deletes[row] || null, right: adds[row] || null });
  }
  return rows;
}

export function permissionRows(permissions = {}) {
  const rows = [];
  if (permissions.network?.enabled) rows.push({ label: "Network", value: "Allow network access" });
  const fs = permissions.fileSystem || {};
  for (const path of fs.read || []) rows.push({ label: "Read", value: path });
  for (const path of fs.write || []) rows.push({ label: "Write", value: path });
  for (const entry of fs.entries || []) {
    const path = entry.path?.path || entry.path?.pattern || entry.path?.value?.kind || "File system";
    rows.push({ label: entry.access?.[0]?.toUpperCase() + entry.access?.slice(1) || "Access", value: path });
  }
  return rows;
}
