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

const decodeAttribute = (value = "") => String(value)
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

export function agentMessageText(item = {}, fallback = "") {
  let text;
  if (typeof item.text === "string") text = item.text;
  else if (typeof item.content === "string") text = item.content;
  else if (!Array.isArray(item.content)) text = fallback;
  else text = item.content.map((part) => {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    return typeof part.text === "string" ? part.text
      : typeof part.content === "string" ? part.content
        : typeof part.value === "string" ? part.value : "";
  }).join("") || fallback;
  return stripAgentInternalMarkup(text);
}

export function stripAgentInternalMarkup(value = "") {
  const source = String(value || "");
  const cleaned = source.replace(/\n*<oai-mem-citation>\s*[\s\S]*?<\/oai-mem-citation>\s*/gi, "");
  return cleaned === source ? source : cleaned.trimEnd();
}

export function parseFileReference(href = "") {
  const value = decodeAttribute(href);
  if (!value || /^(?:https?:|mailto:|#)/i.test(value)) return null;
  const path = value.replace(/^file:\/\//i, "").replace(/^sandbox:/i, "");
  const match = path.match(/^((?:\/|~\/|\.{1,2}\/|[A-Za-z]:[\\/])[^?#]*?)(?::(\d+)(?:-(\d+))?)?$/);
  if (!match) return null;
  return {
    path: match[1],
    lineStart: match[2] ? Number(match[2]) : null,
    lineEnd: match[3] ? Number(match[3]) : null,
  };
}

function citationSuffix(reference) {
  if (reference.lineStart == null) return "";
  return `:${reference.lineStart}${reference.lineEnd == null ? "" : `-${reference.lineEnd}`}`;
}

const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|webp)(?:$|[?#])/i;
const SAFE_DATA_IMAGE = /^data:image\/(?:avif|bmp|gif|jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i;

export function isImageReference(value = "") {
  const source = decodeAttribute(value).trim();
  if (SAFE_DATA_IMAGE.test(source) || /^blob:/i.test(source)) return true;
  const reference = parseFileReference(source);
  return IMAGE_EXTENSION.test(reference?.path || source);
}

export function localImageUrl(path, cwd = "") {
  const query = new URLSearchParams({ path: String(path || "") });
  if (cwd) query.set("cwd", String(cwd));
  return `/api/images/local?${query}`;
}

export function localDownloadUrl(path, cwd = "") {
  const query = new URLSearchParams({ path: String(path || "") });
  if (cwd) query.set("cwd", String(cwd));
  return `/api/files/download?${query}`;
}

function imageSource(source, cwd = "", explicit = false) {
  const value = decodeAttribute(source).trim();
  if (/^https?:\/\//i.test(value) || /^blob:/i.test(value) || SAFE_DATA_IMAGE.test(value)) return value;
  const reference = parseFileReference(value);
  if (!reference || (!explicit && !isImageReference(reference.path))) return null;
  return localImageUrl(reference.path, cwd);
}

function imageTitle(source = "") {
  const reference = parseFileReference(source);
  const value = reference?.path || source;
  const name = String(value).split(/[\\/]/).filter(Boolean).at(-1) || "Image";
  try { return decodeURIComponent(name); }
  catch { return name; }
}

export function renderImagePreview(source, { cwd = "", title = "", className = "" } = {}) {
  const src = imageSource(source, cwd, true);
  if (!src) return "";
  const reference = parseFileReference(source);
  const label = title || imageTitle(source);
  return `<button type="button" class="message-image-button${className ? ` ${escapeHtml(className)}` : ""}" data-image-src="${escapeHtml(src)}" data-image-title="${escapeHtml(label)}"${reference ? ` data-image-path="${escapeHtml(reference.path)}"` : ""} aria-label="View image: ${escapeHtml(label)}"><img class="message-image" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async"></button>`;
}

function attributeValue(attributes, name) {
  const match = String(attributes).match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeAttribute(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function renderImages(html, cwd) {
  return html.replace(/<img\b([^>]*)>/gi, (_, attributes) => {
    const source = attributeValue(` ${attributes}`, "src");
    const alt = attributeValue(` ${attributes}`, "alt");
    return renderImagePreview(source, { cwd, title: alt || imageTitle(source) })
      || `<span class="message-image-unavailable">${escapeHtml(alt || "Image unavailable")}</span>`;
  });
}

function renderLinks(html, cwd) {
  return html.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (match, rawHref, label) => {
    const href = decodeAttribute(rawHref);
    const reference = parseFileReference(href);
    if (reference) return renderFileReference(reference, label, cwd);
    if (/^https?:\/\//i.test(href)) {
      const image = isImageReference(href);
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${image ? ` class="image-citation" data-image-src="${escapeHtml(href)}" data-image-title="${escapeHtml(imageTitle(href))}"` : ""}>${label}</a>`;
    }
    return match;
  });
}

function renderFileReference(reference, label, cwd) {
  const suffix = citationSuffix(reference);
  const image = isImageReference(reference.path);
  if (image) {
    const title = `View ${reference.path}${suffix}`;
    return `<a class="file-citation image-citation" href="#file-reference" data-file-reference="${escapeHtml(reference.path)}" data-image-src="${escapeHtml(localImageUrl(reference.path, cwd))}" data-image-title="${escapeHtml(imageTitle(reference.path))}" data-image-path="${escapeHtml(reference.path)}"${reference.lineStart == null ? "" : ` data-file-line-start="${reference.lineStart}"`}${reference.lineEnd == null ? "" : ` data-file-line-end="${reference.lineEnd}"`} title="${escapeHtml(title)}">${label}</a>`;
  }
  if (reference.lineStart == null) {
    const filename = imageTitle(reference.path);
    return `<a class="file-citation file-download" href="${escapeHtml(localDownloadUrl(reference.path, cwd))}" data-file-download="${escapeHtml(reference.path)}" download="${escapeHtml(filename)}" title="${escapeHtml(`Download ${reference.path}`)}">${label}</a>`;
  }
  const title = `Open ${reference.path}${suffix}`;
  return `<a class="file-citation" href="#file-reference" data-file-reference="${escapeHtml(reference.path)}" data-file-line-start="${reference.lineStart}"${reference.lineEnd == null ? "" : ` data-file-line-end="${reference.lineEnd}"`} title="${escapeHtml(title)}">${label}</a>`;
}

function protectLocalProtocolLinks(html) {
  const references = [];
  const protectedHtml = html.replace(/\bhref=("|')((?:file|sandbox):[^"']+)\1/gi, (_, quote, href) => {
    const index = references.push(href) - 1;
    return `href=${quote}#codex-local-reference-${index}${quote}`;
  });
  return {
    html: protectedHtml,
    restore(value) {
      return value.replace(/href=("|')#codex-local-reference-(\d+)\1/gi, (match, quote, index) => {
        const href = references[Number(index)];
        return href == null ? match : `href=${quote}${escapeHtml(href)}${quote}`;
      });
    },
  };
}

function protectCodexFileCitations(source, cwd, protectedBlocks) {
  return source.replace(/:codex-file-citation\{([^}\r\n]*)\}/gi, (directive, attributes) => {
    const path = attributeValue(` ${attributes}`, "path");
    const reference = parseFileReference(path);
    if (!reference) return directive;
    return stash(protectedBlocks, renderFileReference(reference, escapeHtml(imageTitle(reference.path)), cwd));
  });
}

function candidateSource(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return candidateSource(value.url || value.path || value.src || value.imageUrl || value.image_url);
}

export function itemImageReferences(item = {}) {
  const references = [];
  const seen = new Set();
  const add = (value, title = "") => {
    const source = candidateSource(value).trim();
    if (!source || seen.has(source)) return;
    seen.add(source);
    references.push({ source, title: title || imageTitle(source) });
  };
  for (const path of item.imagePaths || []) add(path);
  if (/image/i.test(String(item.type || ""))) {
    for (const value of [item.path, item.imagePath, item.src, item.url, item.imageUrl, item.image_url]) add(value, item.alt || item.title || item.name);
  }
  for (const part of Array.isArray(item.content) ? item.content : []) {
    if (!part || typeof part !== "object" || !/image/i.test(String(part.type || ""))) continue;
    for (const value of [part.path, part.imagePath, part.src, part.url, part.imageUrl, part.image_url]) add(value, part.alt || part.altText || part.title || part.name);
  }
  return references;
}

export function renderItemImages(item = {}, { cwd = "", className = "message-image-grid", excludeText = "" } = {}) {
  const images = itemImageReferences(item).filter(image => !excludeText.includes(image.source));
  if (!images.length) return "";
  return `<div class="${escapeHtml(className)}">${images.map(image => renderImagePreview(image.source, { cwd, title: image.title })).join("")}</div>`;
}

function renderMath(source, protectedBlocks = []) {
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

export function renderAssistantMarkdown(source = "", { cwd = "" } = {}) {
  const protectedBlocks = [];
  const { text: protectedText } = renderMath(stripAgentInternalMarkup(source), protectedBlocks);
  const text = protectCodexFileCitations(protectedText, cwd, protectedBlocks);
  marked.setOptions({ gfm: true, breaks: true });
  let html = marked.parse(text, { async: false });
  const localLinks = protectLocalProtocolLinks(html);
  html = localLinks.restore(sanitizeHtml(localLinks.html)).replace(/javascript\s*:/gi, "");
  html = html.replace(/\u0000CODEX(\d+)\u0000/g, (_, index) => protectedBlocks[Number(index)] || "");
  return renderLinks(renderImages(html, cwd), cwd);
}

export { escapeHtml };
