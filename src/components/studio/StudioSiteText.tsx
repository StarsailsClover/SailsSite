import { useCallback, useEffect, useState } from "react";
import { Check, Globe2, LoaderCircle, Save } from "lucide-react";
import { defaultSiteText, type SiteText } from "@/hooks/useSiteText";
import {
  getSiteTextSettings,
  saveSiteTextSettings,
  type ApiError,
} from "@/lib/api";

type Section = "nav" | "home" | "about" | "music" | "blog" | "github";

const sections: Array<{ id: Section; label: string }> = [
  { id: "nav", label: "导航" },
  { id: "home", label: "首页" },
  { id: "about", label: "关于" },
  { id: "music", label: "音乐" },
  { id: "blog", label: "博客" },
  { id: "github", label: "GitHub" },
];

const labels: Record<string, string> = {
  nav: "导航文案",
  home: "首页",
  about: "关于页",
  music: "音乐页",
  blog: "博客",
  github: "GitHub",
  villa: "首页",
  blogNav: "博客",
  feed: "动态",
  eyebrow: "顶部短句",
  title: "标题",
  lead: "正文引言",
  weatherPrefix: "天气标签",
  humidityLabel: "湿度标签",
  windLabel: "风标签",
  scrollHint: "滚动提示",
  sections: "空间段落",
  index: "序号",
  text: "正文",
  porchEyebrow: "门廊短句",
  porchTitle: "门廊标题",
  portals: "空间入口",
  timeline: "时间线",
  focus: "关注方向",
  stack: "技术栈",
  label: "小标题",
  nowPlaying: "正在播放",
  silentTitle: "静默标题",
  waitingArtist: "等待文案",
  xEyebrow: "X 短句",
  xTitle: "X 标题",
  missingEyebrow: "文章缺失短句",
  missingTitle: "文章缺失标题",
  backToBlog: "返回博客",
  collectionsTitle: "合集标题",
  collectionsLead: "合集说明",
  tagsTitle: "标签标题",
  statusLoading: "同步中",
  statusSynced: "同步完成",
  statusOffline: "离线提示",
  offlineDescription: "仓库缺失说明",
  modalEyebrow: "旧入口短句",
  modalTitle: "旧入口标题",
  modalHint: "旧入口地址",
  modalConfirm: "确认按钮",
  modalDecline: "取消按钮",
  externalUrl: "外部地址",
  contributionsTitle: "贡献图标题",
  activityTitle: "动态标题",
  repositoriesTitle: "仓库标题",
};

function labelFor(key: string) {
  return labels[key] || key;
}

function setAtPath<T>(source: T, path: string[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  if (Array.isArray(source)) {
    const copy = [...source] as unknown[];
    const index = Number(head);
    copy[index] = setAtPath(copy[index], rest, value);
    return copy as T;
  }
  const object = source as Record<string, unknown>;
  return {
    ...object,
    [head]: setAtPath(object[head], rest, value),
  } as T;
}

function ValueEditor({
  value,
  path,
  onChange,
}: {
  value: unknown;
  path: string[];
  onChange: (path: string[], value: unknown) => void;
}) {
  if (typeof value === "string") {
    const long = value.length > 70 || path.at(-1) === "lead" || path.at(-1) === "text" || path.at(-1) === "description";
    return (
      <label className={long ? "studio-copy-field wide" : "studio-copy-field"}>
        <span>{labelFor(path.at(-1) || "")}</span>
        {long ? (
          <textarea rows={3} value={value} onChange={(event) => onChange(path, event.target.value)} />
        ) : (
          <input value={value} onChange={(event) => onChange(path, event.target.value)} />
        )}
      </label>
    );
  }
  if (Array.isArray(value)) {
    return (
      <section className="studio-copy-group">
        <h3>{labelFor(path.at(-1) || "")}</h3>
        {value.map((entry, index) => (
          <div className="studio-copy-array-item" key={index}>
            <ValueEditor value={entry} path={[...path, String(index)]} onChange={onChange} />
          </div>
        ))}
      </section>
    );
  }
  if (value && typeof value === "object") {
    return (
      <section className="studio-copy-group">
        <h3>{labelFor(path.at(-1) || "")}</h3>
        <div className="studio-copy-fields">
          {Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
            <ValueEditor key={key} value={entry} path={[...path, key]} onChange={onChange} />
          ))}
        </div>
      </section>
    );
  }
  return null;
}

export default function StudioSiteText({
  csrfToken,
  onNotice,
  onExpired,
}: {
  csrfToken: string;
  onNotice: (message: string) => void;
  onExpired: () => void;
}) {
  const [text, setText] = useState<SiteText>(defaultSiteText);
  const [section, setSection] = useState<Section>("home");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fail = useCallback(
    (reason: unknown, fallback: string) => {
      if (reason instanceof Error && "status" in reason && (reason as ApiError).status === 401) {
        onExpired();
        return;
      }
      onNotice(reason instanceof Error ? reason.message : fallback);
    },
    [onExpired, onNotice],
  );

  useEffect(() => {
    getSiteTextSettings(csrfToken)
      .then((value) => setText(value as unknown as SiteText))
      .catch((reason) => fail(reason, "网站文案读取失败。"))
      .finally(() => setLoading(false));
  }, [csrfToken, fail]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const result = await saveSiteTextSettings(csrfToken, text as unknown as Record<string, unknown>);
      setText(result as unknown as SiteText);
      setSaved(true);
      onNotice("网站文案已保存，刷新主站即可看到。");
    } catch (reason) {
      fail(reason, "网站文案保存失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="studio-copy-page">
      <header className="studio-feature-editor-header">
        <div>
          <p>Site Copy</p>
          <h2>网站文案</h2>
        </div>
        <div>
          <a className="studio-secondary-action" href="https://sails.oxygenai.top" target="_blank" rel="noreferrer">
            <Globe2 size={15} /> 查看主站
          </a>
          <button type="button" className="studio-primary-action compact" onClick={save} disabled={saving}>
            {saving ? <LoaderCircle size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
            {saving ? "保存中" : saved ? "已保存" : "保存文案"}
          </button>
        </div>
      </header>

      <nav className="studio-copy-tabs" aria-label="文案页面">
        {sections.map((item) => (
          <button
            type="button"
            key={item.id}
            className={section === item.id ? "active" : ""}
            onClick={() => {
              setSection(item.id);
              setSaved(false);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="content-state"><LoaderCircle size={20} className="spin" /> 正在读取主站文案…</div>
      ) : (
        <div className="studio-copy-surface">
          <ValueEditor
            value={text[section]}
            path={[section]}
            onChange={(path, value) => {
              setText((current) => setAtPath(current, path, value));
              setSaved(false);
            }}
          />
        </div>
      )}
    </section>
  );
}
