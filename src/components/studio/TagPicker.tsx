import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import type { TagSummary } from "@/lib/api";

export default function TagPicker({
  value,
  suggestions,
  onChange,
}: {
  value: string[];
  suggestions: TagSummary[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const available = useMemo(
    () =>
      suggestions
        .filter(
          (tag) =>
            !value.includes(tag.name) &&
            tag.name.toLowerCase().includes(input.trim().toLowerCase()),
        )
        .slice(0, 8),
    [input, suggestions, value],
  );

  const add = (tag: string) => {
    const normalized = tag.trim().slice(0, 24);
    if (!normalized || value.includes(normalized) || value.length >= 8) return;
    onChange([...value, normalized]);
    setInput("");
  };

  return (
    <div className="studio-tag-picker">
      <div className="studio-tag-chips">
        {value.map((tag) => (
          <span key={tag}>
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== tag))}
              aria-label={`移除标签 ${tag}`}
              title={`移除标签 ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="studio-tag-input">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(input);
            }
          }}
          placeholder={value.length >= 8 ? "最多 8 个标签" : "搜索或输入新标签"}
          disabled={value.length >= 8}
        />
        <button
          type="button"
          className="studio-icon-button"
          onClick={() => add(input)}
          disabled={!input.trim() || value.length >= 8}
          aria-label="添加标签"
          title="添加标签"
        >
          <Plus size={15} />
        </button>
      </div>
      {input && available.length > 0 && (
        <div className="studio-tag-suggestions">
          {available.map((tag) => (
            <button type="button" key={tag.name} onClick={() => add(tag.name)}>
              {tag.name} <small>{tag.count}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
