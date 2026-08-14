import { describe, expect, test } from "bun:test";
import { agentMessageText, isImageReference, itemImageReferences, localDownloadUrl, localImageUrl, parseFileReference, renderAssistantMarkdown, renderItemImages } from "../public/rendering.js";

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

  test("normalizes structured agent output without changing streamed text", () => {
    expect(agentMessageText({ text: "Direct message" })).toBe("Direct message");
    expect(agentMessageText({ content: [{ type: "text", text: "Part one" }, { type: "output_text", text: " and two" }] })).toBe("Part one and two");
    expect(agentMessageText({ content: [{ type: "text", value: "Fallback" }] }, "Previous output")).toBe("Fallback");
  });

  test("renders file citations separately from external links", () => {
    const html = renderAssistantMarkdown("Changed [app.js](/Users/home/Projects/codex-webui/public/app.js:186-199) and [docs](https://example.com/docs).");
    expect(parseFileReference("/Users/home/Projects/codex-webui/public/app.js:186-199")).toEqual({ path: "/Users/home/Projects/codex-webui/public/app.js", lineStart: 186, lineEnd: 199 });
    expect(parseFileReference("https://example.com/docs")).toBeNull();
    expect(html).toContain('class="file-citation"');
    expect(html).toContain('data-file-reference="/Users/home/Projects/codex-webui/public/app.js"');
    expect(html).toContain('data-file-line-start="186"');
    expect(html).toContain('data-file-line-end="199"');
    expect(html).toContain('href="https://example.com/docs" target="_blank" rel="noopener noreferrer"');
  });

  test("downloads local files without line numbers and preserves sandbox links", () => {
    const html = renderAssistantMarkdown("[report](sandbox:/tmp/generated%20report.pdf) [source](/tmp/source.ts:12)", { cwd: "/tmp/project" });
    expect(parseFileReference("sandbox:/tmp/generated%20report.pdf")).toEqual({ path: "/tmp/generated%20report.pdf", lineStart: null, lineEnd: null });
    expect(localDownloadUrl("/tmp/generated%20report.pdf", "/tmp/project")).toBe("/api/files/download?path=%2Ftmp%2Fgenerated%2520report.pdf&cwd=%2Ftmp%2Fproject");
    expect(html).toContain('class="file-citation file-download"');
    expect(html).toContain('data-file-download="/tmp/generated%20report.pdf"');
    expect(html).toContain('href="/api/files/download?path=%2Ftmp%2Fgenerated%2520report.pdf&amp;cwd=%2Ftmp%2Fproject"');
    expect(html).toContain('download="generated report.pdf"');
    expect(html).toContain('class="file-citation" href="#file-reference" data-file-reference="/tmp/source.ts" data-file-line-start="12"');
  });

  test("routes local Markdown images through the authenticated image endpoint", () => {
    const html = renderAssistantMarkdown("![Screenshot](/tmp/codex-preview.png)", { cwd: "/tmp/project" });
    expect(isImageReference("/tmp/codex-preview.png")).toBe(true);
    expect(localImageUrl("/tmp/codex-preview.png", "/tmp/project")).toBe("/api/images/local?path=%2Ftmp%2Fcodex-preview.png&cwd=%2Ftmp%2Fproject");
    expect(html).toContain('class="message-image-button"');
    expect(html).toContain('data-image-path="/tmp/codex-preview.png"');
    expect(html).toContain('src="/api/images/local?path=%2Ftmp%2Fcodex-preview.png&amp;cwd=%2Ftmp%2Fproject"');
    expect(html).not.toContain('src="/tmp/codex-preview.png"');
  });

  test("makes local and remote image citations viewable while normal local files are downloadable", () => {
    const html = renderAssistantMarkdown("[local](/tmp/result.webp) [remote](https://example.com/result.jpg) [code](/tmp/result.ts)", { cwd: "/tmp" });
    expect(html).toContain('class="file-citation image-citation"');
    expect(html).toContain('data-image-src="/api/images/local?path=%2Ftmp%2Fresult.webp&amp;cwd=%2Ftmp"');
    expect(html).toContain('href="https://example.com/result.jpg" target="_blank" rel="noopener noreferrer" class="image-citation"');
    expect(html).toContain('class="file-citation file-download" href="/api/files/download?path=%2Ftmp%2Fresult.ts&amp;cwd=%2Ftmp"');
  });

  test("extracts structured agent and generated-image references", () => {
    const item = {
      type: "agentMessage",
      content: [
        { type: "output_text", text: "Rendered result" },
        { type: "output_image", image_url: { url: "/tmp/result.png" }, alt: "Result" },
        { type: "image", path: "/tmp/second.webp" },
      ],
    };
    expect(itemImageReferences(item)).toEqual([
      { source: "/tmp/result.png", title: "Result" },
      { source: "/tmp/second.webp", title: "second.webp" },
    ]);
    expect(renderItemImages({ type: "imageGeneration", src: "https://example.com/generated" })).toContain('data-image-src="https://example.com/generated"');
  });
});
