import { useEffect, useRef } from "react";
import { renderMarkdown } from "@/lib/markdown";

export default function MarkdownView({ source }: { source: string }) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cleanups: Array<() => void> = [];
    root.querySelectorAll<HTMLPreElement>("pre.code-block").forEach((pre) => {
      if (pre.querySelector(".code-copy")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "code-copy";
      button.textContent = "复制";
      button.setAttribute("aria-label", "复制代码");
      const copy = async () => {
        const code = pre.querySelector("code")?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(code);
          button.textContent = "已复制";
          window.setTimeout(() => {
            button.textContent = "复制";
          }, 1500);
        } catch {
          button.textContent = "复制失败";
        }
      };
      button.addEventListener("click", copy);
      pre.appendChild(button);
      cleanups.push(() => button.removeEventListener("click", copy));
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [source]);

  return (
    <article
      ref={rootRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  );
}
