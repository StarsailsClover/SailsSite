import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  Bold,
  Check,
  Clock3,
  Copy,
  Eye,
  FileClock,
  Heading2,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  LoaderCircle,
  PenLine,
  Save,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import MarkdownView from "@/components/MarkdownView";
import TagPicker from "@/components/studio/TagPicker";
import type { Revision, TagSummary } from "@/lib/api";
import {
  formatStudioDate,
  fromLocalDateTime,
  toLocalDateTime,
  type EditorTab,
  type SaveState,
  type StudioDraft,
} from "@/components/studio/types";

// G i t H u b @S t a r s a i l s C l o v e r

const saveCopy: Record<SaveState, string> = {
  idle: "等待落笔",
  dirty: "尚未保存",
  saving: "正在保存",
  saved: "已保存",
  conflict: "其他设备已更新",
  error: "保存失败",
};

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="studio-icon-button"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export default function StudioEditor({
  draft,
  tab,
  saveState,
  saving,
  uploading,
  revisions,
  tagSuggestions,
  onBack,
  onTab,
  onField,
  onUpload,
  onSave,
  onPublish,
  onUnpublish,
  onDuplicate,
  onDelete,
  onRestore,
}: {
  draft: StudioDraft | null;
  tab: EditorTab;
  saveState: SaveState;
  saving: boolean;
  uploading: boolean;
  revisions: Revision[];
  tagSuggestions: TagSummary[];
  onBack: () => void;
  onTab: (tab: EditorTab) => void;
  onField: <K extends keyof StudioDraft>(key: K, value: StudioDraft[K]) => void;
  onUpload: (file: File) => void;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRestore: (revisionId: number) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draftMenuOpen, setDraftMenuOpen] = useState(false);

  useEffect(() => {
    const title = titleRef.current;
    if (!title) return;
    const resize = () => {
      title.style.height = "0px";
      title.style.height = `${title.scrollHeight}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (title.parentElement) observer.observe(title.parentElement);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [draft?.title]);

  if (!draft) {
    return (
      <section className="studio-editor studio-editor-empty">
        <button type="button" className="studio-mobile-back" onClick={onBack}>
          <ArrowLeft size={18} />
          返回稿件
        </button>
        <div className="studio-empty-copy">
          <PenLine size={28} />
          <h2>从左侧选择一篇文章。</h2>
          <p>也可以新建草稿，从手机或电脑继续写。</p>
        </div>
      </section>
    );
  }

  const insertMarkdown = (before: string, after = "", placeholder = "文字") => {
    const textarea = textareaRef.current;
    const body = draft.bodyMarkdown;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const selection = body.slice(start, end) || placeholder;
    const next = `${body.slice(0, start)}${before}${selection}${after}${body.slice(end)}`;
    onField("bodyMarkdown", next);
    requestAnimationFrame(() => {
      if (!textarea) return;
      const cursorStart = start + before.length;
      textarea.focus();
      textarea.setSelectionRange(cursorStart, cursorStart + selection.length);
    });
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onUpload(file);
    event.target.value = "";
  };

  const wordCount = Array.from(draft.bodyMarkdown).length;
  const isPublished = draft.status === "published";

  return (
    <section className="studio-editor">
      <button type="button" className="studio-mobile-back" onClick={onBack}>
        <ArrowLeft size={18} />
        返回稿件
      </button>

      <header className="studio-editor-header">
        <div className="studio-title-block">
          <div className="studio-editor-eyebrow">
            <span>{draft.status === "draft" ? "草稿" : draft.status === "published" ? "已发布" : draft.status === "scheduled" ? "定时发布" : "归档"}</span>
            <i>·</i>
            <span>{formatStudioDate(draft.updatedAt)}</span>
          </div>
          <textarea
            ref={titleRef}
            className="studio-title-input"
            value={draft.title}
            onChange={(event) => onField("title", event.target.value)}
            aria-label="文章标题"
            placeholder="文章标题"
            rows={1}
          />
        </div>

        <div className="studio-editor-actions">
          <span className={`studio-save-state state-${saveState}`}>
            {saving ? <LoaderCircle size={14} className="spin" /> : saveState === "saved" ? <Check size={14} /> : <Clock3 size={14} />}
            {saveCopy[saveState]}
          </span>
          <button
            type="button"
            className="studio-secondary-action"
            onClick={onSave}
            disabled={saving}
          >
            <Save size={16} />
            保存
          </button>
          <button
            type="button"
            className="studio-primary-action compact"
            onClick={isPublished ? onUnpublish : onPublish}
            disabled={saving}
          >
            <Send size={16} />
            {isPublished ? "转为草稿" : "发布"}
          </button>
          <div className="studio-editor-menu-wrap">
            <button
              type="button"
              className="studio-icon-button"
              onClick={() => setDraftMenuOpen((value) => !value)}
              aria-label="更多文章操作"
              title="更多文章操作"
            >
              <span className="studio-more-glyph">•••</span>
            </button>
            {draftMenuOpen && (
              <div className="studio-editor-menu">
                <button type="button" onClick={() => { setDraftMenuOpen(false); onDuplicate(); }}>
                  <Copy size={15} />
                  复制为新草稿
                </button>
                <button type="button" className="danger" onClick={() => { setDraftMenuOpen(false); onDelete(); }}>
                  <Trash2 size={15} />
                  删除文章
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="studio-editor-tabs" role="tablist" aria-label="编辑器视图">
        <button type="button" className={tab === "edit" ? "active" : ""} onClick={() => onTab("edit")}>
          <PenLine size={15} />
          写作
        </button>
        <button type="button" className={tab === "preview" ? "active" : ""} onClick={() => onTab("preview")}>
          <Eye size={15} />
          预览
        </button>
        <button type="button" className={tab === "history" ? "active" : ""} onClick={() => onTab("history")}>
          <FileClock size={15} />
          历史
        </button>
      </div>

      {saveState === "conflict" && (
        <div className="studio-inline-alert">
          这篇文章已在其他设备更新。请重新打开最新版本，避免覆盖新内容。
        </div>
      )}

      {tab === "edit" && (
        <div className="studio-workspace-grid">
          <div className="studio-writing-column">
            <div className="studio-markdown-surface">
              <div className="studio-markdown-toolbar" aria-label="Markdown 工具">
                <ToolButton label="二级标题" onClick={() => insertMarkdown("## ", "", "标题")}>
                  <Heading2 size={17} />
                </ToolButton>
                <ToolButton label="粗体" onClick={() => insertMarkdown("**", "**")}>
                  <Bold size={17} />
                </ToolButton>
                <ToolButton label="斜体" onClick={() => insertMarkdown("_", "_")}>
                  <Italic size={17} />
                </ToolButton>
                <ToolButton label="链接" onClick={() => insertMarkdown("[", "](https://)", "链接文字")}>
                  <LinkIcon size={17} />
                </ToolButton>
                <ToolButton label="列表" onClick={() => insertMarkdown("- ", "", "列表内容")}>
                  <List size={17} />
                </ToolButton>
                <span>{wordCount} 字</span>
              </div>
              <textarea
                ref={textareaRef}
                className="studio-body-input"
                value={draft.bodyMarkdown}
                onChange={(event) => onField("bodyMarkdown", event.target.value)}
                aria-label="正文"
                placeholder="从一段心事开始。"
                spellCheck
              />
            </div>
          </div>

          <aside className="studio-meta-column">
            <section className="studio-meta-section">
              <label>
                <span>文章地址</span>
                <input
                  value={draft.slug}
                  onChange={(event) => onField("slug", event.target.value)}
                  spellCheck={false}
                  placeholder="article-slug"
                />
              </label>
              <label>
                <span>摘要</span>
                <textarea
                  value={draft.description}
                  onChange={(event) => onField("description", event.target.value)}
                  placeholder="留空时会从正文自动提取"
                  rows={4}
                />
              </label>
              <div className="studio-tag-field">
                <span>标签</span>
                <TagPicker
                  value={draft.tags}
                  suggestions={tagSuggestions}
                  onChange={(tags) => onField("tags", tags)}
                />
              </div>
            </section>

            <section className="studio-meta-section">
              <label>
                <span>状态</span>
                <select
                  value={draft.status}
                  onChange={(event) => {
                    const status = event.target.value as StudioDraft["status"];
                    onField("status", status);
                    if (status === "scheduled" && !draft.publishedAt) {
                      onField(
                        "publishedAt",
                        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                      );
                    }
                  }}
                >
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="scheduled">定时发布</option>
                  <option value="archived">归档</option>
                </select>
              </label>
              {draft.status === "scheduled" && (
                <label>
                  <span>发布时间</span>
                  <input
                    type="datetime-local"
                    value={toLocalDateTime(draft.publishedAt)}
                    onChange={(event) =>
                      onField("publishedAt", fromLocalDateTime(event.target.value))
                    }
                  />
                </label>
              )}
            </section>

            <section className="studio-meta-section studio-cover-section">
              <div className="studio-meta-heading">
                <span>封面</span>
                <button
                  type="button"
                  className="studio-text-button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}
                  {uploading ? "上传中" : "上传"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
                  hidden
                  onChange={chooseFile}
                />
              </div>
              {draft.coverUrl ? (
                <div className="studio-cover-preview">
                  <img src={draft.coverUrl} alt="" />
                  <button
                    type="button"
                    className="studio-icon-button"
                    onClick={() => onField("coverUrl", "")}
                    aria-label="移除封面"
                    title="移除封面"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="studio-cover-placeholder"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={20} />
                  <span>添加一张封面</span>
                </button>
              )}
            </section>
          </aside>
        </div>
      )}

      {tab === "preview" && (
        <article className="studio-preview-surface">
          <p className="studio-preview-meta">
            {draft.tags.join(" / ") || "未加标签"}
          </p>
          <h1>{draft.title || "未命名文章"}</h1>
          {draft.description && <p className="studio-preview-description">{draft.description}</p>}
          <MarkdownView source={draft.bodyMarkdown} />
        </article>
      )}

      {tab === "history" && (
        <section className="studio-history-surface">
          <header>
            <h2>历史版本</h2>
            <p>每次保存或发布前，系统都会保留一份快照。</p>
          </header>
          {revisions.length === 0 ? (
            <div className="studio-rail-state">还没有可恢复的历史版本。</div>
          ) : (
            <div className="studio-history-list">
              {revisions.map((revision) => (
                <article key={revision.id}>
                  <div>
                    <strong>版本 {revision.version}</strong>
                    <span>{formatStudioDate(revision.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    className="studio-secondary-action"
                    onClick={() => onRestore(revision.id)}
                  >
                    恢复此版本
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
