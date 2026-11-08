import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";

marked.setOptions({
  gfm: true,
  breaks: true,
});

function escapeAttribute(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function transformMediaSyntax(markdown: string) {
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

const renderer = {
  code({ text, lang }: { text: string; lang?: string }) {
    const language = String(lang || "").trim().split(/\s+/)[0];
    const highlighted =
      language && hljs.getLanguage(language)
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;
    return `<pre class="code-block" data-language="${escapeAttribute(language || "text")}"><code class="hljs">${highlighted}</code></pre>`;
  },
  link({
    href,
    title,
    tokens,
  }: {
    href: string;
    title?: string | null;
    tokens: unknown[];
  }) {
    const label = (this as { parser: { parseInline: (value: unknown[]) => string } }).parser.parseInline(tokens);
    const external = /^https?:\/\//i.test(href);
    return `<a href="${escapeAttribute(href)}"${title ? ` title="${escapeAttribute(title)}"` : ""}${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
  },
};

marked.use({ renderer });

export function renderMarkdown(markdown: string) {
  const html = marked.parse(transformMediaSyntax(markdown), {
    async: false,
  }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["video", "audio", "source"],
    ADD_ATTR: [
      "target",
      "rel",
      "loading",
      "decoding",
      "controls",
      "preload",
      "playsinline",
      "poster",
      "type",
      "class",
      "data-language",
    ],
  });
}
