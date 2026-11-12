import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import StudioEditor from "@/components/studio/StudioEditor";
import StudioLogin from "@/components/studio/StudioLogin";
import StudioCollections from "@/components/studio/StudioCollections";
import StudioMedia from "@/components/studio/StudioMedia";
import StudioModeBar, { type StudioMode } from "@/components/studio/StudioModeBar";
import StudioMusic from "@/components/studio/StudioMusic";
import StudioPlaylists from "@/components/studio/StudioPlaylists";
import StudioRail from "@/components/studio/StudioRail";
import StudioSiteText from "@/components/studio/StudioSiteText";
import {
  createAdminPost,
  deleteAdminPost,
  duplicateAdminPost,
  getAdminPost,
  getAdminSession,
  listAdminPosts,
  listRevisions,
  listTags,
  logout,
  restoreRevision,
  updateAdminPost,
  uploadCover,
  type AdminSession,
  type ApiError,
  type Post,
  type PostSummary,
  type Revision,
  type TagSummary,
} from "@/lib/api";
import {
  draftPayload,
  toDraft,
  type EditorTab,
  type SaveState,
  type StudioDraft,
} from "@/components/studio/types";
import "@/studio.css";

type Confirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => Promise<void>;
};

function ConfirmDialog({
  confirmation,
  onClose,
}: {
  confirmation: Confirmation;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <div className="studio-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="studio-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="studio-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="studio-icon-button studio-dialog-close"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          <X size={17} />
        </button>
        <h2 id="studio-confirm-title">{confirmation.title}</h2>
        <p>{confirmation.message}</p>
        <div className="studio-dialog-actions">
          <button type="button" className="studio-secondary-action" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={confirmation.danger ? "studio-danger-action" : "studio-primary-action"}
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await confirmation.action();
                onClose();
              } finally {
                setPending(false);
              }
            }}
          >
            {pending && <LoaderCircle size={16} className="spin" />}
            {confirmation.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function StudioWorkspace({
  session,
  onExpired,
}: {
  session: AdminSession;
  onExpired: () => void;
}) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<EditorTab>("edit");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [mobilePane, setMobilePane] = useState<"list" | "editor">("list");
  const [mode, setMode] = useState<StudioMode>("posts");
  const [musicDirty, setMusicDirty] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<TagSummary[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);

  const draftRef = useRef<StudioDraft | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const editSequence = useRef(0);
  const selectedId = draft?.id ?? null;
  const activeDraftId = draft?.id;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    listTags()
      .then(setTagSuggestions)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const handleApiFailure = useCallback(
    (reason: unknown, fallback: string) => {
      if (
        reason instanceof Error &&
        "status" in reason &&
        (reason as ApiError).status === 401
      ) {
        onExpired();
        return;
      }
      if (reason instanceof Error) setNotice(reason.message || fallback);
      else setNotice(fallback);
    },
    [onExpired],
  );

  const upsertSummary = useCallback((post: Post) => {
    const summary: PostSummary = { ...post };
    setPosts((current) => {
      const next = current.filter((item) => item.id !== post.id);
      next.unshift(summary);
      return next.sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
    });
  }, []);

  const loadPosts = useCallback(
    async (showLoading = true) => {
      if (showLoading) setListLoading(true);
      try {
        const data = await listAdminPosts(session.csrfToken, {
          status: filter,
          q: query,
          limit: 150,
        });
        setPosts(data);
        if (!draftRef.current && data[0]) {
          const full = await getAdminPost(data[0].id, session.csrfToken);
          setDraft(toDraft(full));
          setTab("edit");
        }
      } catch (reason) {
        handleApiFailure(reason, "稿件列表暂时无法读取。");
      } finally {
        if (showLoading) setListLoading(false);
      }
    },
    [filter, handleApiFailure, query, session.csrfToken],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadPosts();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [loadPosts]);

  const saveDraft = useCallback(
    async (
      overrides: Partial<StudioDraft> = {},
      { force = false, quiet = false }: { force?: boolean; quiet?: boolean } = {},
    ) => {
      const current = draftRef.current;
      if (!current || savingRef.current) return null;
      const merged = { ...current, ...overrides };
      if (!force && !dirtyRef.current && Object.keys(overrides).length === 0) {
        return merged;
      }
      if (merged.status === "scheduled" && !merged.publishedAt) {
        setSaveState("error");
        setNotice("定时发布需要先选择发布时间。");
        return null;
      }

      savingRef.current = true;
      setSaving(true);
      setSaveState("saving");
      const sequence = editSequence.current;
      try {
        const updated = await updateAdminPost(
          session.csrfToken,
          merged.id,
          draftPayload(merged),
        );
        const next = toDraft(updated);
        if (draftRef.current?.id === updated.id) {
          if (sequence === editSequence.current) {
            setDraft(next);
            setDirty(false);
            dirtyRef.current = false;
            setSaveState("saved");
          } else {
            const newer = {
              ...(draftRef.current as StudioDraft),
              version: next.version,
              updatedAt: next.updatedAt,
            };
            setDraft(newer);
            setSaveState("dirty");
          }
        }
        upsertSummary(updated);
        if (!quiet) setNotice("");
        return updated;
      } catch (reason) {
        if (
          reason instanceof Error &&
          "code" in reason &&
          (reason as ApiError).code === "version_conflict"
        ) {
          setSaveState("conflict");
        } else {
          setSaveState("error");
          handleApiFailure(reason, "保存失败，请稍后再试。");
        }
        return null;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [handleApiFailure, session.csrfToken, upsertSummary],
  );

  useEffect(() => {
    if (!dirty || saveState === "conflict" || saving) return;
    const timer = window.setTimeout(() => {
      void saveDraft({}, { quiet: true });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, saveDraft, saveState, saving]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && dirtyRef.current) {
        void saveDraft({}, { quiet: true });
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [saveDraft]);

  useEffect(() => {
    if (tab !== "history" || !activeDraftId) return;
    listRevisions(session.csrfToken, activeDraftId)
      .then(setRevisions)
      .catch((reason) => handleApiFailure(reason, "历史版本暂时无法读取。"));
  }, [activeDraftId, handleApiFailure, session.csrfToken, tab]);

  const updateField = <K extends keyof StudioDraft>(key: K, value: StudioDraft[K]) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      draftRef.current = next;
      return next;
    });
    editSequence.current += 1;
    setDirty(true);
    dirtyRef.current = true;
    setSaveState("dirty");
    setNotice("");
  };

  const openPost = async (id: string) => {
    if (draftRef.current?.id === id) {
      setMobilePane("editor");
      return;
    }
    if (dirtyRef.current) {
      const saved = await saveDraft();
      if (!saved) return;
    }
    try {
      const post = await getAdminPost(id, session.csrfToken);
      setDraft(toDraft(post));
      setDirty(false);
      dirtyRef.current = false;
      setSaveState("saved");
      setTab("edit");
      setRevisions([]);
      setMobilePane("editor");
      setNotice("");
    } catch (reason) {
      handleApiFailure(reason, "文章暂时无法读取。");
    }
  };

  const createPost = async () => {
    if (dirtyRef.current) {
      const saved = await saveDraft();
      if (!saved) return;
    }
    try {
      const post = await createAdminPost(session.csrfToken, {
        title: "未命名文章",
        slug: `untitled-${Date.now().toString(36)}`,
        description: "",
        bodyMarkdown: "",
        coverUrl: "",
        tags: [],
        status: "draft",
        publishedAt: null,
      });
      setDraft(toDraft(post));
      upsertSummary(post);
      setDirty(false);
      dirtyRef.current = false;
      setSaveState("saved");
      setTab("edit");
      setMobilePane("editor");
    } catch (reason) {
      handleApiFailure(reason, "无法新建文章。");
    }
  };

  const publish = async () => {
    const next = await saveDraft(
      { status: "published", publishedAt: new Date().toISOString() },
      { force: true },
    );
    if (next) {
      setNotice("文章已经发布。");
      await loadPosts(false);
    }
  };

  const unpublish = async () => {
    const next = await saveDraft({ status: "draft" }, { force: true });
    if (next) {
      setNotice("文章已转为草稿。");
      await loadPosts(false);
    }
  };

  const duplicate = async () => {
    if (!draft) return;
    const saved = await saveDraft();
    if (!saved) return;
    try {
      const post = await duplicateAdminPost(session.csrfToken, draft.id);
      setDraft(toDraft(post));
      upsertSummary(post);
      setDirty(false);
      dirtyRef.current = false;
      setSaveState("saved");
      setTab("edit");
      setMobilePane("editor");
      setNotice("已复制为新草稿。");
    } catch (reason) {
      handleApiFailure(reason, "复制文章失败。");
    }
  };

  const remove = () => {
    if (!draft) return;
    setConfirmation({
      title: "删除这篇文章？",
      message: "文章会从所有公开位置移除，历史快照仍会保留在服务端。",
      confirmLabel: "删除文章",
      danger: true,
      action: async () => {
        try {
          await deleteAdminPost(session.csrfToken, draft.id, draft.version);
          setPosts((current) => current.filter((item) => item.id !== draft.id));
          setDraft(null);
          dirtyRef.current = false;
          setDirty(false);
          setMobilePane("list");
          setNotice("文章已删除。");
          await loadPosts(false);
        } catch (reason) {
          handleApiFailure(reason, "删除失败。");
          throw reason;
        }
      },
    });
  };

  const upload = async (file: File) => {
    if (!draft) return;
    setUploading(true);
    try {
      const result = await uploadCover(session.csrfToken, file);
      updateField("coverUrl", result.url);
      setNotice("封面已优化并上传。");
    } catch (reason) {
      handleApiFailure(reason, "封面读取失败。");
    } finally {
      setUploading(false);
    }
  };

  const restore = (revisionId: number) => {
    if (!draft) return;
    setConfirmation({
      title: "恢复这个历史版本？",
      message: "恢复会生成一个新版本，当前内容仍会保留在历史记录中。",
      confirmLabel: "恢复版本",
      action: async () => {
        try {
          const post = await restoreRevision(
            session.csrfToken,
            draft.id,
            revisionId,
            draft.version,
          );
          setDraft(toDraft(post));
          setDirty(false);
          dirtyRef.current = false;
          setSaveState("saved");
          upsertSummary(post);
          setRevisions(await listRevisions(session.csrfToken, post.id));
          setNotice("历史版本已经恢复。");
        } catch (reason) {
          handleApiFailure(reason, "恢复版本失败。");
          throw reason;
        }
      },
    });
  };

  const signOut = async () => {
    if (
      mode === "music" &&
      musicDirty &&
      !window.confirm("音乐作品还有未保存修改，退出登录将丢失。继续吗？")
    ) {
      return;
    }
    if (dirtyRef.current) await saveDraft();
    try {
      await logout(session.csrfToken);
    } catch {
      // The local session is cleared even if the network drops during logout.
    }
    onExpired();
  };

  return (
    <main className="studio-shell" data-mobile-pane={mobilePane} data-mode={mode}>
      <StudioModeBar
        mode={mode}
        onMode={(nextMode) => {
          if (
            mode === "music" &&
            nextMode !== "music" &&
            musicDirty &&
            !window.confirm("音乐作品还有未保存修改，切换工作区将丢失。继续吗？")
          ) {
            return;
          }
          if (nextMode !== "music") setMusicDirty(false);
          setMode(nextMode);
          setMobilePane(nextMode === "posts" ? "list" : "editor");
        }}
      />
      {mode === "posts" && (
        <>
          <StudioRail
            posts={posts}
            selectedId={selectedId}
            loading={listLoading}
            query={query}
            filter={filter}
            username={session.user.username}
            onQuery={setQuery}
            onFilter={setFilter}
            onSelect={openPost}
            onNew={createPost}
            onLogout={signOut}
          />
          <div className="studio-main">
            <StudioEditor
              draft={draft}
              tab={tab}
              saveState={saveState}
              saving={saving}
              uploading={uploading}
              revisions={revisions}
              tagSuggestions={tagSuggestions}
              onBack={() => setMobilePane("list")}
              onTab={(nextTab) => {
                setTab(nextTab);
                if (nextTab === "history") setNotice("");
              }}
              onField={updateField}
              onUpload={upload}
              onSave={() => void saveDraft({}, { force: true })}
              onPublish={publish}
              onUnpublish={unpublish}
              onDuplicate={duplicate}
              onDelete={remove}
              onRestore={restore}
            />
          </div>
        </>
      )}
      {mode === "collections" && (
        <div className="studio-main">
          <StudioCollections
            csrfToken={session.csrfToken}
            onNotice={setNotice}
            onExpired={onExpired}
          />
        </div>
      )}
      {mode === "media" && (
        <div className="studio-main">
          <StudioMedia
            csrfToken={session.csrfToken}
            onNotice={setNotice}
            onExpired={onExpired}
          />
        </div>
      )}
      {mode === "music" && (
        <div className="studio-main">
          <StudioMusic
            csrfToken={session.csrfToken}
            onNotice={setNotice}
            onExpired={onExpired}
            onDirtyChange={setMusicDirty}
          />
        </div>
      )}
      {mode === "playlists" && (
        <StudioPlaylists
          csrfToken={session.csrfToken}
          onNotice={setNotice}
          onExpired={onExpired}
        />
      )}
      {mode === "copy" && (
        <div className="studio-main">
          <StudioSiteText
            csrfToken={session.csrfToken}
            onNotice={setNotice}
            onExpired={onExpired}
          />
        </div>
      )}
      {notice && (
        <button type="button" className="studio-toast" onClick={() => setNotice("")}>
          <span>{notice}</span>
          <X size={15} />
        </button>
      )}
      {confirmation && (
        <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
      )}
    </main>
  );
}

export default function Studio() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getAdminSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="studio-boot">
        <LoaderCircle size={22} className="spin" />
        <span>正在打开写作室</span>
      </div>
    );
  }

  if (!session) return <StudioLogin onLogin={setSession} />;
  return (
    <StudioWorkspace
      session={session}
      onExpired={() => setSession(null)}
    />
  );
}
