export const DEFAULT_TURN_PAGE_SIZE = 20;

export function createLatestRequestGate() {
  let generation = 0;
  return {
    next() { generation += 1; return generation; },
    isCurrent(value) { return value === generation; },
  };
}

export function createTurnWindow(turns, pageSize = DEFAULT_TURN_PAGE_SIZE, currentStart, loadMore = 0) {
  const total = Array.isArray(turns) ? turns.length : 0;
  const safePage = Math.max(1, pageSize);
  const baseStart = currentStart == null ? Math.max(0, total - safePage) : Math.max(0, Math.min(currentStart, total));
  const start = Math.max(0, baseStart - Math.max(0, loadMore));
  return { visible: turns.slice(start), hiddenCount: start, start, total };
}

export function selectModelState(models, requestedModel) {
  const catalog = Array.isArray(models) ? models : [];
  const selected = catalog.find((item) => item.model === requestedModel)
    || catalog.find((item) => item.isDefault)
    || catalog[0]
    || { model: "", defaultReasoningEffort: "medium", supportedReasoningEfforts: [] };
  const efforts = (selected.supportedReasoningEfforts || []).map((item) => item.reasoningEffort).filter(Boolean);
  const effort = efforts.includes(selected.defaultReasoningEffort)
    ? selected.defaultReasoningEffort
    : (efforts[0] || selected.defaultReasoningEffort || "medium");
  return { model: selected.model, effort, efforts: efforts.length ? efforts : [effort] };
}

export function resolveComposerPlaceholder({
  followUpType,
  composerMode = "local",
  cloudStartingState,
  isBackgroundSubagentsPanelVisible = false,
  isGoalModeActive = false,
  isPlanModeActive = false,
  placeholderText,
  isHome = false,
} = {}) {
  if (isGoalModeActive) return "Describe your goal, define measurable outcomes for best results";
  if (isPlanModeActive) return "Describe your task to generate a plan...";
  if (placeholderText != null) return placeholderText;
  if (followUpType === "cloud") {
    if (composerMode === "local") return "Create a new local task that references this cloud task";
    if (cloudStartingState === "working-tree") return "Create a new cloud task that includes your current code and will reference this task";
    return "Follow-up to this cloud task";
  }
  if (followUpType === "local") {
    if (composerMode === "cloud") return "Follow-up in a new cloud task";
    return isBackgroundSubagentsPanelVisible
      ? "Ask for follow up changes or @ to tag an agent"
      : "Ask for follow-up changes";
  }
  if (isHome && composerMode === "local") return "Do anything";
  return composerMode === "cloud"
    ? "Ask Codex to do anything in the cloud"
    : "Ask ChatGPT anything. @ to use plugins or mention files";
}

export function getComposerAutocomplete(text, cursor = text.length) {
  const value = String(text || "");
  const end = Math.max(0, Math.min(Number.isFinite(cursor) ? cursor : value.length, value.length));
  const before = value.slice(0, end);
  const slash = before.match(/^\s*\/([^\s/]*)$/);
  if (slash) {
    const start = before.indexOf("/");
    return { type: "slash", query: slash[1], start, end };
  }
  const mention = before.match(/(?:^|\s)@([^\s@]*)$/);
  if (!mention) return null;
  const start = before.lastIndexOf("@");
  return { type: "mention", query: mention[1], start, end };
}

export function applyComposerSuggestion(text, match, replacement) {
  const value = String(text || "");
  if (!match || match.start < 0 || match.end < match.start) return { text: value, cursor: value.length };
  const before = value.slice(0, match.start);
  const after = value.slice(match.end);
  const needsSpace = after.length === 0 || !/^\s/.test(after);
  const inserted = String(replacement || "") + (needsSpace ? " " : "");
  return { text: before + inserted + after, cursor: before.length + inserted.length };
}
