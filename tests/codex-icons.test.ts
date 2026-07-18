import { describe, expect, test } from "bun:test";
import { codexIcon, codexIconNodes, hydrateCodexIcons } from "../public/codex-icons.js";

describe("Codex icon assets", () => {
  test("uses the exact Lucide 0.456 paths extracted from Codex.app", () => {
    expect(codexIconNodes.paperclip).toContain("m21.44 11.05-9.19 9.19");
    expect(codexIconNodes.panelLeft).toContain('width="18" height="18" x="3" y="3" rx="2"');
    expect(codexIconNodes.refreshCw).toContain("M3 12a9 9 0 0 1 9-9");
    expect(codexIconNodes.folderOpen).toContain("m6 14 1.5-2.9");
  });

  test("renders a standard icon slot", () => {
    const html = codexIcon("arrowUp", "send-icon");
    expect(html).toContain('class="icon-slot send-icon"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain("M12 19V5");
  });

  test("hydrates static placeholders", () => {
    const nodes = [{ dataset: { icon: "plus" }, innerHTML: "" }];
    hydrateCodexIcons({ querySelectorAll: () => nodes });
    expect(nodes[0].innerHTML).toContain("M5 12h14");
  });
});
