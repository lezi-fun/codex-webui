import { marked } from "marked";
import katex from "katex";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

const stash = (store, html) => {
  const token = `\u0000CODEX${store.length}\u0000`;
  store.push(html);
  return token;
};

function renderMath(source) {
  const protectedBlocks = [];
  let text = source.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, lang, code) => stash(
    protectedBlocks,
    `<pre><code class="language-${escapeHtml(lang || "text")}">${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`,
  ));
  text = text.replace(/`([^`\n]+)`/g, (_, code) => stash(protectedBlocks, `<code>${escapeHtml(code)}</code>`));
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => stash(protectedBlocks, katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false, strict: "ignore" })));
  text = text.replace(/(^|[^\\\w])\$([^$\n]+?)\$(?!\d)/g, (whole, prefix, formula) => {
    if (/^\d+(?:\.\d+)?(?:\s|$)/.test(formula.trim())) return whole;
    return prefix + stash(protectedBlocks, katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false, strict: "ignore" }));
  });
  return { text, protectedBlocks };
}

function sanitizeHtml(html) {
  if (typeof window !== "undefined" && globalThis.DOMPurify) {
    return globalThis.DOMPurify.sanitize(html, { ADD_ATTR: ["target", "rel"], FORBID_TAGS: ["style", "script", "iframe", "object", "embed"] });
  }
  return html
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, (value) => escapeHtml(value))
    .replace(/\s(?:on\w+|style)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "href=\"#\"");
}

export function renderAssistantMarkdown(source = "") {
  const { text, protectedBlocks } = renderMath(String(source));
  marked.setOptions({ gfm: true, breaks: true });
  let html = marked.parse(text, { async: false });
  html = sanitizeHtml(html).replace(/javascript\s*:/gi, "");
  html = html.replace(/\u0000CODEX(\d+)\u0000/g, (_, index) => protectedBlocks[Number(index)] || "");
  return html.replace(/<a\s+href="(https?:\/\/[^" ]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"');
}

export { escapeHtml };
