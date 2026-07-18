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
