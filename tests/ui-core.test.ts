import { describe, expect, test } from "bun:test";
import { DEFAULT_TURN_PAGE_SIZE, createTurnWindow, selectModelState } from "../public/ui-core.js";

describe("conversation turn window", () => {
  test("uses a small default page for fast first paint", () => {
    expect(DEFAULT_TURN_PAGE_SIZE).toBe(20);
  });

  test("opens a long conversation with only the newest turns", () => {
    const turns = Array.from({ length: 2693 }, (_, i) => ({ id: `turn-${i}` }));
    const view = createTurnWindow(turns, 80);
    expect(view.visible).toHaveLength(80);
    expect(view.visible[0].id).toBe("turn-2613");
    expect(view.hiddenCount).toBe(2613);
  });

  test("loads an older page without losing the newest turns", () => {
    const turns = Array.from({ length: 200 }, (_, i) => ({ id: `turn-${i}` }));
    const first = createTurnWindow(turns, 80);
    const second = createTurnWindow(turns, 80, first.start, 80);
    expect(second.visible).toHaveLength(160);
    expect(second.visible[0].id).toBe("turn-40");
    expect(second.visible.at(-1)?.id).toBe("turn-199");
    expect(second.hiddenCount).toBe(40);
  });
});

describe("model selection", () => {
  test("selects a model and its advertised default effort", () => {
    const models = [
      { model: "gpt-5.5", defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium" }] },
      { model: "gpt-5.6-sol", defaultReasoningEffort: "xhigh", supportedReasoningEfforts: [{ reasoningEffort: "high" }, { reasoningEffort: "xhigh" }] },
    ];
    expect(selectModelState(models, "gpt-5.6-sol")).toEqual({ model: "gpt-5.6-sol", effort: "xhigh", efforts: ["high", "xhigh"] });
  });

  test("falls back to the catalog default when saved model is missing", () => {
    const models = [
      { model: "gpt-5.5", isDefault: true, defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium" }] },
    ];
    expect(selectModelState(models, "removed-model").model).toBe("gpt-5.5");
  });
});
