import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Layers3,
  LoaderCircle,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import {
  createAdminCollection,
  deleteAdminCollection,
  getAdminCollection,
  listAdminCollections,
  listAdminPosts,
  setCollectionPosts,
  updateAdminCollection,
  type ApiError,
  type CollectionSummary,
  type PostSummary,
} from "@/lib/api";

type CollectionForm = {
  title: string;
  slug: string;
  description: string;
  coverUrl: string;
  status: "draft" | "published";
  sortOrder: "newest" | "oldest";
};

function formFromCollection(collection: CollectionSummary): CollectionForm {
  return {
    title: collection.title,
    slug: collection.slug,
    description: collection.description,
    coverUrl: collection.coverUrl,
    status: collection.status,
    sortOrder: collection.sortOrder,
  };
}

export default function StudioCollections({
  csrfToken,
  onNotice,
  onExpired,
}: {
  csrfToken: string;
  onNotice: (message: string) => void;
  onExpired: () => void;
}) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CollectionForm | null>(null);
  const [version, setVersion] = useState(0);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [mobilePane, setMobilePane] = useState<"list" | "editor">("list");

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

  const loadCollections = async () => {
    try {
      setCollections(await listAdminCollections(csrfToken));
    } catch (reason) {
      fail(reason, "合集列表读取失败。");
    }
  };

  useEffect(() => {
    Promise.all([
      listAdminCollections(csrfToken),
      listAdminPosts(csrfToken, { status: "all", limit: 200 }),
    ])
      .then(([collectionData, postData]) => {
        setCollections(collectionData);
        setPosts(postData);
      })
      .catch((reason) => fail(reason, "合集数据读取失败。"))
      .finally(() => setLoading(false));
  }, [csrfToken, fail]);

  const open = async (id: string) => {
    try {
      const detail = await getAdminCollection(csrfToken, id);
      setSelectedId(id);
      setForm(formFromCollection(detail.collection));
      setVersion(detail.collection.version);
      setSelectedPostIds(detail.posts.map((post) => post.id));
      setMobilePane("editor");
    } catch (reason) {
      fail(reason, "合集读取失败。");
    }
  };

  const create = async () => {
    try {
      const collection = await createAdminCollection(csrfToken, {
        title: "未命名合集",
        slug: `collection-${Date.now().toString(36)}`,
        description: "",
        coverUrl: "",
        status: "draft",
        sortOrder: "newest",
      });
      await loadCollections();
      await open(collection.id);
    } catch (reason) {
      fail(reason, "新建合集失败。");
    }
  };

  const save = async () => {
    if (!selectedId || !form || saving) return;
    setSaving(true);
    try {
      const updated = await updateAdminCollection(csrfToken, selectedId, {
        ...form,
        expectedVersion: version,
      });
      const finalCollection = await setCollectionPosts(
        csrfToken,
        selectedId,
        selectedPostIds,
        updated.version,
      );
      setVersion(finalCollection.version);
      setForm(formFromCollection(finalCollection));
      await loadCollections();
      onNotice("合集已保存。");
    } catch (reason) {
      fail(reason, "合集保存失败。");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !form) return;
    if (!window.confirm(`删除合集「${form.title}」？文章本身不会被删除。`)) return;
    try {
      await deleteAdminCollection(csrfToken, selectedId, version);
      setSelectedId(null);
      setForm(null);
      setSelectedPostIds([]);
      setMobilePane("list");
      await loadCollections();
      onNotice("合集已删除。");
    } catch (reason) {
      fail(reason, "合集删除失败。");
    }
  };

  const selectedPosts = useMemo(
    () =>
      posts
        .filter((post) => selectedPostIds.includes(post.id))
        .sort((left, right) => {
          const direction = form?.sortOrder === "oldest" ? 1 : -1;
          return (
            direction *
            (new Date(left.publishedAt || left.createdAt).getTime() -
              new Date(right.publishedAt || right.createdAt).getTime())
          );
        }),
    [form?.sortOrder, posts, selectedPostIds],
  );

  const availablePosts = posts.filter((post) =>
    post.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <section className="studio-feature" data-pane={mobilePane}>
      <aside className="studio-feature-list">
        <header>
          <div>
            <span>Collections</span>
            <strong>文章合集</strong>
          </div>
          <button
            type="button"
            className="studio-icon-button"
            onClick={create}
            aria-label="新建合集"
            title="新建合集"
          >
            <Plus size={18} />
          </button>
        </header>
        <div className="studio-feature-list-body">
          {loading && <div className="studio-rail-state">正在整理合集…</div>}
          {!loading &&
            collections.map((collection) => (
              <button
                type="button"
                key={collection.id}
                className={selectedId === collection.id ? "active" : ""}
                onClick={() => open(collection.id)}
              >
                <Layers3 size={15} />
                <span>
                  <strong>{collection.title}</strong>
                  <small>{collection.postCount} 篇 · {collection.sortOrder === "newest" ? "新篇在上" : "新篇在下"}</small>
                </span>
              </button>
            ))}
        </div>
      </aside>

      <div className="studio-feature-editor">
        <button type="button" className="studio-mobile-back" onClick={() => setMobilePane("list")}>
          <ArrowLeft size={18} /> 返回合集
        </button>
        {!form ? (
          <div className="studio-empty-copy">
            <Layers3 size={28} />
            <h2>把文章收束成一条路径。</h2>
            <p>新建合集后，可以添加已有文章并控制访客看到的排序。</p>
          </div>
        ) : (
          <>
            <header className="studio-feature-editor-header">
              <div>
                <p>Collection</p>
                <h2>{form.title || "未命名合集"}</h2>
              </div>
              <div>
                <button type="button" className="studio-secondary-action" onClick={remove}>
                  <Trash2 size={15} /> 删除
                </button>
                <button type="button" className="studio-primary-action compact" onClick={save} disabled={saving}>
                  {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
                  保存合集
                </button>
              </div>
            </header>

            <div className="studio-feature-grid">
              <section className="studio-collection-fields">
                <label>
                  <span>合集名称</span>
                  <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                </label>
                <label>
                  <span>合集地址</span>
                  <input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
                </label>
                <label>
                  <span>合集简介</span>
                  <textarea rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                </label>
                <label>
                  <span>封面链接</span>
                  <input value={form.coverUrl} onChange={(event) => setForm({ ...form, coverUrl: event.target.value })} placeholder="/uploads/..." />
                </label>
                <label>
                  <span>公开状态</span>
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CollectionForm["status"] })}>
                    <option value="draft">草稿</option>
                    <option value="published">已公开</option>
                  </select>
                </label>
                <fieldset className="studio-sort-order">
                  <legend>访客看到的文章顺序</legend>
                  <label>
                    <input type="radio" checked={form.sortOrder === "newest"} onChange={() => setForm({ ...form, sortOrder: "newest" })} />
                    新文章在上
                  </label>
                  <label>
                    <input type="radio" checked={form.sortOrder === "oldest"} onChange={() => setForm({ ...form, sortOrder: "oldest" })} />
                    新文章在下
                  </label>
                </fieldset>
              </section>

              <section className="studio-collection-posts">
                <header>
                  <div>
                    <span>已选择 {selectedPostIds.length} 篇</span>
                    <small>公开页只显示已发布文章</small>
                  </div>
                </header>
                <div className="studio-selected-posts">
                  {selectedPosts.map((post, index) => (
                    <article key={post.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{post.title}</strong>
                        <small>{post.status} · {post.publishedAt?.slice(0, 10) || "未发布"}</small>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedPostIds(selectedPostIds.filter((id) => id !== post.id))}
                      >
                        移除
                      </button>
                    </article>
                  ))}
                </div>
                <label className="studio-feature-search">
                  <Search size={15} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索已有文章" />
                </label>
                <div className="studio-available-posts">
                  {availablePosts.map((post) => {
                    const checked = selectedPostIds.includes(post.id);
                    return (
                      <label key={post.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedPostIds(
                              checked
                                ? selectedPostIds.filter((id) => id !== post.id)
                                : [...selectedPostIds, post.id],
                            )
                          }
                        />
                        <span>
                          <strong>{post.title}</strong>
                          <small>{post.status} · {post.publishedAt?.slice(0, 10) || "未发布"}</small>
                        </span>
                        {checked && <Check size={14} />}
                      </label>
                    );
                  })}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
