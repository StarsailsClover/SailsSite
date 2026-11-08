import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({
  gfm: true,
  breaks: true,
});

export class ValidationError extends Error {
  constructor(message, code = "validation_error") {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

export class ConflictError extends Error {
  constructor(message = "内容已在其他设备更新") {
    super(message);
    this.name = "ConflictError";
    this.code = "version_conflict";
  }
}

export class NotFoundError extends Error {
  constructor(message = "内容不存在") {
    super(message);
    this.name = "NotFoundError";
    this.code = "not_found";
  }
}

const allowedTags = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
  "video",
  "audio",
  "source",
];

const sanitizeOptions = {
  allowedTags,
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    code: ["class"],
    h1: ["id"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    img: ["src", "alt", "title", "loading", "decoding"],
    video: ["src", "poster", "controls", "preload", "playsinline", "class"],
    audio: ["src", "controls", "preload", "class"],
    source: ["src", "type"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href || "";
      const external = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: {
          ...attribs,
          ...(external ? { rel: "noopener noreferrer", target: "_blank" } : {}),
        },
      };
    },
    img: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        loading: "lazy",
        decoding: "async",
      },
    }),
    video: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        controls: "controls",
        preload: "metadata",
        playsinline: "true",
        class: "markdown-video",
      },
    }),
    audio: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        controls: "controls",
        preload: "metadata",
        class: "markdown-audio",
      },
    }),
  },
};

export function sanitizeMarkdownHtml(html) {
  return sanitizeHtml(String(html || ""), sanitizeOptions);
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function mediaMarkdown(markdown) {
  let output = String(markdown || "");
  output = output.replace(
    /!\[([^\]]*)\]\(((?:https?:\/\/|\/uploads\/)[^)\s]+?\.(?:mp4|webm|mov)(?:\?[^)\s]*)?)\)/gi,
    (_match, alt, url) =>
      `<video class="markdown-video" controls preload="metadata" playsinline aria-label="${escapeAttribute(alt || "视频")}"><source src="${escapeAttribute(url)}"></video>`,
  );
  output = output.replace(
    /!\[([^\]]*)\]\(((?:https?:\/\/|\/uploads\/)[^)\s]+?\.(?:mp3|m4a|ogg)(?:\?[^)\s]*)?)\)/gi,
    (_match, alt, url) =>
      `<audio class="markdown-audio" controls preload="metadata" aria-label="${escapeAttribute(alt || "音频")}"><source src="${escapeAttribute(url)}"></audio>`,
  );
  output = output.replace(
    /^(\s*)((?:https?:\/\/|\/uploads\/)\S+?\.(?:mp4|webm|mov)(?:\?\S*)?)\s*$/gim,
    (_match, indent, url) =>
      `${indent}<video class="markdown-video" controls preload="metadata" playsinline><source src="${escapeAttribute(url)}"></video>`,
  );
  return output;
}

export function renderMarkdown(markdown) {
  return sanitizeMarkdownHtml(
    marked.parse(mediaMarkdown(markdown), { async: false }),
  );
}

function stripMarkdown(markdown) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptFromMarkdown(markdown, limit = 180) {
  const text = stripMarkdown(markdown);
  return Array.from(text).slice(0, limit).join("");
}

export function readingMinutes(markdown) {
  const text = stripMarkdown(markdown);
  const characters = Array.from(text).length;
  return Math.max(1, Math.ceil(characters / 500));
}

export function slugify(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
    .replace(/-+$/g, "");
  return normalized || `untitled-${Date.now().toString(36)}`;
}

function asString(value, field, maxLength, required = false) {
  if (value === undefined) return undefined;
  const output = String(value ?? "").trim();
  if (required && !output) throw new ValidationError(`${field} 不能为空`);
  if (output.length > maxLength) throw new ValidationError(`${field} 过长`);
  return output;
}

function normalizeTags(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return Array.from(
    new Set(
      raw
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .map((tag) => Array.from(tag).slice(0, 24).join("")),
    ),
  ).slice(0, 8);
}

function normalizeCoverUrl(value) {
  if (value === undefined) return undefined;
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.length > 1000) throw new ValidationError("封面地址过长");
  if (!url.startsWith("/uploads/") && !/^https:\/\//i.test(url)) {
    throw new ValidationError("封面必须是站内上传或 HTTPS 地址");
  }
  return url;
}

export function normalizePostInput(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("请求内容必须是对象");
  }

  const output = {};
  const title = asString(input.title, "标题", 160, !partial);
  if (title !== undefined) output.title = title || "未命名文章";

  const bodyMarkdown = input.bodyMarkdown ?? input.body;
  if (bodyMarkdown !== undefined) {
    if (typeof bodyMarkdown !== "string") throw new ValidationError("正文格式错误");
    if (bodyMarkdown.length > 300_000) throw new ValidationError("正文过长");
    output.bodyMarkdown = bodyMarkdown;
  }

  const slugInput = input.slug;
  if (slugInput !== undefined) {
    output.slug = slugify(slugInput);
  }

  const description = input.description ?? input.excerpt;
  if (description !== undefined) {
    output.description = asString(description, "摘要", 400) || "";
  }

  if (input.tags !== undefined) output.tags = normalizeTags(input.tags);
  if (input.coverUrl !== undefined) output.coverUrl = normalizeCoverUrl(input.coverUrl);

  if (input.status !== undefined) {
    const status = String(input.status);
    if (!["draft", "published", "scheduled", "archived"].includes(status)) {
      throw new ValidationError("文章状态无效");
    }
    output.status = status;
  }

  if (input.publishedAt !== undefined) {
    if (!input.publishedAt) {
      output.publishedAt = null;
    } else {
      const date = new Date(input.publishedAt);
      if (Number.isNaN(date.getTime())) throw new ValidationError("发布时间无效");
      output.publishedAt = date.toISOString();
    }
  }

  if (input.featured !== undefined) output.featured = Boolean(input.featured);

  if (input.expectedVersion !== undefined) {
    const expectedVersion = Number(input.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ValidationError("版本号无效");
    }
    output.expectedVersion = expectedVersion;
  }

  return output;
}

export function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
