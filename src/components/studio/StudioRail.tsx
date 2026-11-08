import {
  FilePenLine,
  LogOut,
  Plus,
  Search,
} from "lucide-react";
import type { PostSummary } from "@/lib/api";
import { formatStudioDate } from "@/components/studio/types";

const filters = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "scheduled", label: "定时" },
];

const statusLabels: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  scheduled: "定时",
  archived: "归档",
};

export default function StudioRail({
  posts,
  selectedId,
  loading,
  query,
  filter,
  username,
  onQuery,
  onFilter,
  onSelect,
  onNew,
  onLogout,
}: {
  posts: PostSummary[];
  selectedId: string | null;
  loading: boolean;
  query: string;
  filter: string;
  username: string;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className="studio-rail">
      <header className="studio-rail-header">
        <div>
          <span>StarsailsClover</span>
          <strong>文章管理</strong>
        </div>
        <button
          type="button"
          className="studio-icon-button studio-new-button"
          onClick={onNew}
          aria-label="新建文章"
          title="新建文章"
        >
          <Plus size={18} />
        </button>
      </header>

      <div className="studio-filter-row" role="tablist" aria-label="文章状态">
        {filters.map((item) => (
          <button
            type="button"
            key={item.value}
            className={filter === item.value ? "active" : ""}
            onClick={() => onFilter(item.value)}
            role="tab"
            aria-selected={filter === item.value}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="studio-search-field">
        <Search size={15} />
        <span className="sr-only">搜索文章</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="搜索标题或地址"
        />
      </label>

      <div className="studio-post-list" aria-busy={loading}>
        {loading && <div className="studio-rail-state">正在整理稿件…</div>}
        {!loading && posts.length === 0 && (
          <div className="studio-rail-state">
            <FilePenLine size={20} />
            <span>这里还没有文章</span>
            <button type="button" onClick={onNew}>写下第一篇</button>
          </div>
        )}
        {!loading &&
          posts.map((post) => (
            <button
              type="button"
              key={post.id}
              className={`studio-post-row ${selectedId === post.id ? "active" : ""}`}
              onClick={() => onSelect(post.id)}
            >
              <span className={`studio-status-dot status-${post.status}`} />
              <span className="studio-post-row-copy">
                <strong>{post.title || "未命名文章"}</strong>
                <small>
                  {statusLabels[post.status] || post.status}
                  <i>·</i>
                  {formatStudioDate(post.updatedAt)}
                </small>
              </span>
            </button>
          ))}
      </div>

      <footer className="studio-rail-footer">
        <div>
          <span>当前账号</span>
          <strong>{username}</strong>
        </div>
        <button
          type="button"
          className="studio-icon-button"
          onClick={onLogout}
          aria-label="退出登录"
          title="退出登录"
        >
          <LogOut size={17} />
        </button>
      </footer>
    </aside>
  );
}
