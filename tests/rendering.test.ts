import { describe, expect, test } from "bun:test";
import { renderAssistantMarkdown } from "../public/rendering.js";

describe("assistant Markdown and LaTeX rendering", () => {
  test("renders headings, lists and fenced code blocks", () => {
    const html = renderAssistantMarkdown("## Result\n\n- one\n- two\n\n```ts\nconst x = 1 < 2;\n```");
    expect(html).toContain("<h2>Result</h2>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain('class="language-ts"');
    expect(html).toContain("const x = 1 &lt; 2;");
  });

  test("renders inline and display LaTeX with KaTeX markup", () => {
    const html = renderAssistantMarkdown("Inline $E=mc^2$ and display:\n\n$$\\int_0^1 x^2 dx$$");
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
  });

  test("does not allow raw script or javascript links", () => {
    const html = renderAssistantMarkdown('<script>alert(1)</script> [bad](javascript:alert(1))');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;");
  });

  test("keeps dollar amounts as text rather than math", () => {
    const html = renderAssistantMarkdown("The price is $5 and the total is $10.");
    expect(html).not.toContain('class="katex"');
    expect(html).toContain("$5");
  });
});
