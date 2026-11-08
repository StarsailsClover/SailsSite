import { FileText, Images, Layers3, Type } from "lucide-react";

export type StudioMode = "posts" | "collections" | "media" | "copy";

const modes = [
  { id: "posts" as const, label: "文章", icon: FileText },
  { id: "collections" as const, label: "合集", icon: Layers3 },
  { id: "media" as const, label: "媒体", icon: Images },
  { id: "copy" as const, label: "文案", icon: Type },
];

export default function StudioModeBar({
  mode,
  onMode,
}: {
  mode: StudioMode;
  onMode: (mode: StudioMode) => void;
}) {
  return (
    <header className="studio-modebar">
      <a href="https://sails.oxygenai.top" className="studio-modebar-brand">
        <span>StarsailsClover</span>
        <strong>Writing Room</strong>
      </a>
      <nav aria-label="管理功能区">
        {modes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={mode === item.id ? "active" : ""}
              onClick={() => onMode(item.id)}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <a className="studio-modebar-public" href="https://sails.oxygenai.top">
        查看主站
      </a>
    </header>
  );
}
