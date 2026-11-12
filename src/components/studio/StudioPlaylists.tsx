import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CloudDownload,
  Disc3,
  LoaderCircle,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  createAdminMusicPlaylist,
  createAdminMusicPlaylistTrack,
  deleteAdminMusicPlaylist,
  deleteAdminMusicPlaylistTrack,
  getAdminMusicIntegrations,
  getAdminMusicPlaylist,
  getNeteaseSong,
  listAdminMusicPlaylists,
  reorderAdminMusicPlaylistTracks,
  searchNeteaseSongs,
  updateAdminMusicIntegrations,
  updateAdminMusicPlaylist,
  updateAdminMusicPlaylistTrack,
  uploadCover,
  uploadMedia,
  type ApiError,
  type MusicIntegrations,
  type MusicPlaylist,
  type MusicPlaylistDetail,
  type MusicPlaylistInput,
  type MusicPlaylistTrack,
  type MusicPlaylistTrackInput,
  type NeteaseSongSummary,
} from "@/lib/api";
import { formatTrackDuration } from "@/lib/lyrics";

type PlaylistRecord = MusicPlaylist & { tracks: MusicPlaylistTrack[] };

const emptyPlaylist: MusicPlaylistInput = {
  title: "",
  slug: "",
  description: "",
  coverUrl: "",
  sortOrder: 0,
  status: "draft",
};

const emptyTrack: MusicPlaylistTrackInput = {
  title: "",
  artistName: "",
  albumTitle: "",
  coverUrl: "",
  audioUrl: "",
  source: "external",
  externalId: "",
  genre: "",
  durationSeconds: 0,
  lyricsLrc: "",
  translationLrc: "",
};

function playlistForm(playlist: PlaylistRecord): MusicPlaylistInput {
  return {
    title: playlist.title,
    slug: playlist.slug,
    description: playlist.description,
    coverUrl: playlist.coverUrl,
    sortOrder: playlist.sortOrder,
    status: playlist.status,
  };
}

export default function StudioPlaylists({
  csrfToken,
  onNotice,
  onExpired,
}: {
  csrfToken: string;
  onNotice: (message: string) => void;
  onExpired: () => void;
}) {
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistRecord | null>(null);
  const [form, setForm] = useState<MusicPlaylistInput>(emptyPlaylist);
  const [listLoading, setListLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trackDraft, setTrackDraft] = useState<MusicPlaylistTrackInput>(emptyTrack);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [integrations, setIntegrations] = useState<MusicIntegrations>({ neteaseApiBase: "" });
  const [integrationDraft, setIntegrationDraft] = useState("");
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [neteaseQuery, setNeteaseQuery] = useState("");
  const [neteaseResults, setNeteaseResults] = useState<NeteaseSongSummary[]>([]);
  const [neteaseState, setNeteaseState] = useState<"idle" | "searching" | "error" | "off">("idle");

  const handleFailure = useCallback(
    (reason: unknown, fallback: string) => {
      const apiError = reason as ApiError;
      if (apiError?.status === 401 || apiError?.status === 403) {
        onExpired();
        return;
      }
      setError(apiError?.message || fallback);
    },
    [onExpired],
  );

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await listAdminMusicPlaylists(csrfToken);
      setPlaylists(data);
      return data;
    } catch (reason) {
      handleFailure(reason, "歌单列表加载失败。");
      return [];
    } finally {
      setListLoading(false);
    }
  }, [csrfToken, handleFailure]);

  const openPlaylist = useCallback(
    async (id: string) => {
      setBusy(true);
      setError("");
      try {
        const data: MusicPlaylistDetail = await getAdminMusicPlaylist(csrfToken, id);
        setSelectedId(id);
        setPlaylist({ ...data.playlist });
        setForm(playlistForm({ ...data.playlist }));
        setEditingTrackId(null);
        setTrackDraft(emptyTrack);
      } catch (reason) {
        handleFailure(reason, "歌单读取失败。");
      } finally {
        setBusy(false);
      }
    },
    [csrfToken, handleFailure],
  );

  useEffect(() => {
    void (async () => {
      const list = await loadList();
      if (list.length > 0) await openPlaylist(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadList]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await getAdminMusicIntegrations(csrfToken);
        setIntegrations(data);
        setIntegrationDraft(data.neteaseApiBase);
      } catch {
        // 集成设置读取失败不阻塞歌单编辑。
      }
    })();
  }, [csrfToken]);

  const createPlaylist = async () => {
    setBusy(true);
    setError("");
    try {
      const created = await createAdminMusicPlaylist(csrfToken, {
        title: "未命名歌单",
        slug: `playlist-${Date.now().toString(36)}`,
        status: "draft",
      });
      setPlaylists(await listAdminMusicPlaylists(csrfToken));
      setSelectedId(created.id);
      const fresh: PlaylistRecord = { ...created };
      setPlaylist(fresh);
      setForm(playlistForm(fresh));
      onNotice("已新建歌单，填写资料后即可发布。");
    } catch (reason) {
      handleFailure(reason, "新建歌单失败。");
    } finally {
      setBusy(false);
    }
  };

  const savePlaylist = async (patch: Partial<MusicPlaylistInput> = {}) => {
    if (!playlist) return;
    setBusy(true);
    setError("");
    try {
      const updated = await updateAdminMusicPlaylist(csrfToken, playlist.id, {
        ...form,
        ...patch,
        expectedVersion: playlist.version,
      });
      setPlaylist({ ...updated });
      setForm(playlistForm({ ...updated }));
      setPlaylists((current) =>
        current.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                title: updated.title,
                slug: updated.slug,
                status: updated.status,
                sortOrder: updated.sortOrder,
                coverUrl: updated.coverUrl,
                description: updated.description,
                trackCount: updated.tracks.length,
                version: updated.version,
                updatedAt: updated.updatedAt,
              }
            : item,
        ),
      );
      onNotice(patch.status === "published" ? "歌单已发布。" : "歌单已保存。");
    } catch (reason) {
      handleFailure(reason, "歌单保存失败。");
    } finally {
      setBusy(false);
    }
  };

  const removePlaylist = async () => {
    if (!playlist) return;
    if (!window.confirm(`删除歌单「${playlist.title}」？该操作会同时下线其中的曲目。`)) return;
    setBusy(true);
    try {
      await deleteAdminMusicPlaylist(csrfToken, playlist.id, playlist.version);
      const list = await loadList();
      setSelectedId(null);
      setPlaylist(null);
      setForm(emptyPlaylist);
      if (list.length > 0) await openPlaylist(list[0].id);
      onNotice("歌单已删除。");
    } catch (reason) {
      handleFailure(reason, "歌单删除失败。");
    } finally {
      setBusy(false);
    }
  };

  const uploadPlaylistCover = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const result = await uploadCover(csrfToken, file);
      setForm((current) => ({ ...current, coverUrl: result.url }));
      onNotice("封面已上传，保存后生效。");
    } catch (reason) {
      handleFailure(reason, "封面上传失败。");
    } finally {
      setBusy(false);
    }
  };

  const uploadTrackAudio = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadPercent(0);
    try {
      const result = await uploadMedia(csrfToken, file, setUploadPercent);
      setTrackDraft((current) => ({
        ...current,
        audioUrl: result.media.url,
        durationSeconds: result.durationSeconds ?? current.durationSeconds,
      }));
      onNotice("音频已上传，填写曲目信息后加入歌单。");
    } catch (reason) {
      handleFailure(reason, "音频上传失败。");
    } finally {
      setUploading(false);
    }
  };

  const submitTrack = async () => {
    if (!playlist) return;
    if (!trackDraft.title.trim()) {
      setError("曲目名称不能为空。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = editingTrackId
        ? await updateAdminMusicPlaylistTrack(csrfToken, editingTrackId, {
            ...trackDraft,
            expectedVersion:
              playlist.tracks.find((track) => track.id === editingTrackId)?.version ?? 0,
          })
        : await createAdminMusicPlaylistTrack(csrfToken, playlist.id, trackDraft);
      setPlaylist({ ...updated });
      setPlaylists((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, trackCount: updated.tracks.length } : item,
        ),
      );
      setTrackDraft(emptyTrack);
      setEditingTrackId(null);
      onNotice(editingTrackId ? "曲目已更新。" : "曲目已加入歌单。");
    } catch (reason) {
      handleFailure(reason, "曲目保存失败。");
    } finally {
      setBusy(false);
    }
  };

  const editTrack = (track: MusicPlaylistTrack) => {
    setEditingTrackId(track.id);
    setTrackDraft({
      title: track.title,
      artistName: track.artistName,
      albumTitle: track.albumTitle,
      coverUrl: track.coverUrl,
      audioUrl: track.audioUrl,
      source: track.source,
      externalId: track.externalId,
      genre: track.genre,
      durationSeconds: track.durationSeconds,
      lyricsLrc: track.lyricsLrc,
      translationLrc: track.translationLrc,
    });
    onNotice("正在编辑曲目，保存后回到歌单。");
  };

  const removeTrack = async (track: MusicPlaylistTrack) => {
    if (!playlist) return;
    if (!window.confirm(`从歌单移除「${track.title}」？`)) return;
    setBusy(true);
    try {
      await deleteAdminMusicPlaylistTrack(csrfToken, track.id, track.version);
      const data = await getAdminMusicPlaylist(csrfToken, playlist.id);
      const updated = data.playlist;
      setPlaylist({ ...updated });
      setPlaylists((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, trackCount: updated.tracks.length } : item,
        ),
      );
      onNotice("曲目已移出歌单。");
    } catch (reason) {
      handleFailure(reason, "曲目移除失败。");
    } finally {
      setBusy(false);
    }
  };

  const moveTrack = async (index: number, direction: -1 | 1) => {
    if (!playlist) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= playlist.tracks.length) return;
    const ordered = [...playlist.tracks];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, moved);
    setBusy(true);
    try {
      const updated = await reorderAdminMusicPlaylistTracks(
        csrfToken,
        playlist.id,
        ordered.map((track) => track.id),
      );
      setPlaylist({ ...updated });
    } catch (reason) {
      handleFailure(reason, "曲目排序失败。");
    } finally {
      setBusy(false);
    }
  };

  const saveIntegrations = async () => {
    setBusy(true);
    try {
      const updated = await updateAdminMusicIntegrations(csrfToken, {
        neteaseApiBase: integrationDraft.trim(),
      });
      setIntegrations(updated);
      setIntegrationDraft(updated.neteaseApiBase);
      setNeteaseState("idle");
      onNotice(updated.neteaseApiBase ? "网易云接口已保存。" : "网易云接口已清空。");
    } catch (reason) {
      handleFailure(reason, "接口设置保存失败。");
    } finally {
      setBusy(false);
    }
  };

  const runNeteaseSearch = async () => {
    if (!integrations.neteaseApiBase) {
      setNeteaseState("off");
      setShowIntegrations(true);
      return;
    }
    setNeteaseState("searching");
    setError("");
    try {
      const results = await searchNeteaseSongs(csrfToken, neteaseQuery);
      setNeteaseResults(results);
      setNeteaseState(results.length > 0 ? "idle" : "error");
      if (results.length === 0) setError("没有搜索到匹配的曲目。");
    } catch (reason) {
      setNeteaseState("error");
      handleFailure(reason, "网易云搜索失败。");
    }
  };

  const importNeteaseSong = async (song: NeteaseSongSummary) => {
    if (!playlist) return;
    setBusy(true);
    setError("");
    try {
      const draft = await getNeteaseSong(csrfToken, song.id);
      const updated = await createAdminMusicPlaylistTrack(csrfToken, playlist.id, {
        title: draft.title || song.title,
        artistName: draft.artist || song.artist,
        albumTitle: draft.album || song.album,
        coverUrl: draft.coverUrl,
        audioUrl: draft.audioUrl,
        source: "netease",
        externalId: draft.id,
        genre: draft.genre,
        durationSeconds: draft.durationSeconds || song.durationSeconds,
        lyricsLrc: draft.lyricsLrc,
        translationLrc: draft.translationLrc,
      });
      setPlaylist({ ...updated });
      setPlaylists((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, trackCount: updated.tracks.length } : item,
        ),
      );
      onNotice(`已加入「${draft.title || song.title}」。`);
    } catch (reason) {
      handleFailure(reason, "曲目导入失败，可能是版权或接口限制。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="studio-playlist-page">
      <aside className="studio-playlist-rail">
        <header>
          <div>
            <p className="studio-kicker">Curated playlists</p>
            <h2>精选歌单</h2>
          </div>
          <button
            type="button"
            className="studio-primary-action"
            onClick={() => void createPlaylist()}
            disabled={busy}
          >
            <Plus size={15} />
            新建
          </button>
        </header>
        <button
          type="button"
          className="studio-text-button"
          onClick={() => setShowIntegrations((value) => !value)}
        >
          <CloudDownload size={14} />
          网易云接口
        </button>
        {showIntegrations && (
          <div className="studio-inline-upload">
            <input
              value={integrationDraft}
              onChange={(event) => setIntegrationDraft(event.target.value)}
              placeholder="http://127.0.0.1:3000"
              aria-label="网易云接口地址"
            />
            <button
              type="button"
              className="studio-secondary-action"
              onClick={() => void saveIntegrations()}
              disabled={busy}
            >
              <Check size={14} />
              保存
            </button>
          </div>
        )}
        {listLoading && (
          <div className="studio-rail-state">
            <LoaderCircle size={16} className="spin" />
            正在读取歌单…
          </div>
        )}
        <ul className="studio-post-list">
          {playlists.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`studio-post-row ${selectedId === item.id ? "active" : ""} ${item.status === "published" ? "published" : ""}`}
                onClick={() => void openPlaylist(item.id)}
              >
                <span className="studio-status-dot" aria-hidden="true" />
                <span className="studio-post-row-copy">
                  <strong>{item.title}</strong>
                  <small>
                    {item.trackCount} 首 · {item.status === "published" ? "已发布" : "草稿"}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="studio-playlist-main">
        {error && <p className="studio-form-error">{error}</p>}
        {!playlist ? (
          <div className="studio-editor-empty">
            <Disc3 size={28} />
            <h2>选择或新建一张歌单</h2>
            <p>歌单会出现在主站音乐页的「精选歌单」区块。</p>
          </div>
        ) : (
          <>
            <header className="studio-feature-editor-header">
              <div>
                <p className="studio-kicker">
                  {playlist.status === "published" ? "已发布" : "草稿"} · v{playlist.version}
                </p>
                <h2>{playlist.title}</h2>
              </div>
              <div className="studio-editor-actions">
                <button
                  type="button"
                  className="studio-secondary-action"
                  onClick={() => void savePlaylist()}
                  disabled={busy}
                >
                  {busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
                  保存
                </button>
                <button
                  type="button"
                  className="studio-primary-action"
                  onClick={() =>
                    void savePlaylist({
                      status: playlist.status === "published" ? "draft" : "published",
                    })
                  }
                  disabled={busy}
                >
                  {playlist.status === "published" ? "转为草稿" : "发布歌单"}
                </button>
                <button
                  type="button"
                  className="studio-danger-action"
                  onClick={() => void removePlaylist()}
                  disabled={busy}
                >
                  <Trash2 size={15} />
                  删除
                </button>
              </div>
            </header>

            <div className="studio-music-overview">
              <div className="studio-music-fields">
                <label className="wide">
                  <span>歌单名称</span>
                  <input
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                  />
                </label>
                <label>
                  <span>地址 slug</span>
                  <input
                    value={form.slug}
                    onChange={(event) => setForm({ ...form, slug: event.target.value })}
                  />
                </label>
                <label>
                  <span>访客排序（小在前）</span>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) =>
                      setForm({ ...form, sortOrder: Number(event.target.value) || 0 })
                    }
                  />
                </label>
                <label className="wide">
                  <span>歌单简介</span>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
                </label>
                <label className="wide">
                  <span>封面地址</span>
                  <input
                    value={form.coverUrl}
                    onChange={(event) => setForm({ ...form, coverUrl: event.target.value })}
                    placeholder="/uploads/... 或 https://"
                  />
                </label>
                <div className="studio-inline-upload wide">
                  <label className="studio-text-button">
                    <Upload size={14} />
                    上传封面
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => void uploadPlaylistCover(event)}
                    />
                  </label>
                  {form.coverUrl && (
                    <span className="studio-upload-result">
                      <img src={form.coverUrl} alt="" />
                    </span>
                  )}
                </div>
              </div>

              <div className="studio-music-tracks">
                <header className="studio-track-editor">
                  <h3>{editingTrackId ? "编辑曲目" : "新增曲目"}</h3>
                </header>
                <div className="studio-track-fields">
                  <label>
                    <span>曲目名称</span>
                    <input
                      value={trackDraft.title}
                      onChange={(event) =>
                        setTrackDraft({ ...trackDraft, title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>歌手</span>
                    <input
                      value={trackDraft.artistName}
                      onChange={(event) =>
                        setTrackDraft({ ...trackDraft, artistName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>专辑</span>
                    <input
                      value={trackDraft.albumTitle}
                      onChange={(event) =>
                        setTrackDraft({ ...trackDraft, albumTitle: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>流派</span>
                    <input
                      value={trackDraft.genre}
                      onChange={(event) =>
                        setTrackDraft({ ...trackDraft, genre: event.target.value })
                      }
                    />
                  </label>
                  <label className="wide">
                    <span>音频地址</span>
                    <input
                      value={trackDraft.audioUrl}
                      onChange={(event) =>
                        setTrackDraft({ ...trackDraft, audioUrl: event.target.value })
                      }
                      placeholder="/uploads/... 或 https://"
                    />
                  </label>
                  <label className="wide">
                    <span>封面地址</span>
                    <input
                      value={trackDraft.coverUrl}
                      onChange={(event) =>
                        setTrackDraft({ ...trackDraft, coverUrl: event.target.value })
                      }
                    />
                  </label>
                  <label className="wide">
                    <span>歌词 LRC</span>
                    <textarea
                      rows={4}
                      value={trackDraft.lyricsLrc}
                      onChange={(event) =>
                        setTrackDraft({ ...trackDraft, lyricsLrc: event.target.value })
                      }
                      placeholder="[00:12.00] 第一句歌词"
                    />
                  </label>
                  <label className="wide">
                    <span>翻译 LRC（可选）</span>
                    <textarea
                      rows={3}
                      value={trackDraft.translationLrc}
                      onChange={(event) =>
                        setTrackDraft({ ...trackDraft, translationLrc: event.target.value })
                      }
                    />
                  </label>
                  <div className="studio-inline-upload wide">
                    <label className="studio-text-button">
                      <Upload size={14} />
                      {uploading ? `上传中 ${uploadPercent}%` : "上传音频"}
                      <input
                        type="file"
                        accept="audio/*"
                        hidden
                        onChange={(event) => void uploadTrackAudio(event)}
                      />
                    </label>
                    <span className="studio-upload-result">
                      {trackDraft.durationSeconds > 0
                        ? formatTrackDuration(trackDraft.durationSeconds)
                        : "未探测时长"}
                    </span>
                  </div>
                  <div className="studio-editor-actions wide">
                    <button
                      type="button"
                      className="studio-primary-action"
                      onClick={() => void submitTrack()}
                      disabled={busy || uploading}
                    >
                      {editingTrackId ? <Save size={15} /> : <Plus size={15} />}
                      {editingTrackId ? "保存曲目" : "加入歌单"}
                    </button>
                    {editingTrackId && (
                      <button
                        type="button"
                        className="studio-secondary-action"
                        onClick={() => {
                          setEditingTrackId(null);
                          setTrackDraft(emptyTrack);
                        }}
                      >
                        取消编辑
                      </button>
                    )}
                  </div>
                </div>

                <section className="studio-playlist-search">
                  <div className="studio-search-field">
                    <Search size={14} />
                    <input
                      value={neteaseQuery}
                      onChange={(event) => setNeteaseQuery(event.target.value)}
                      placeholder="搜索网易云曲目"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void runNeteaseSearch();
                      }}
                    />
                    <button
                      type="button"
                      className="studio-secondary-action"
                      onClick={() => void runNeteaseSearch()}
                      disabled={neteaseState === "searching"}
                    >
                      {neteaseState === "searching" ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        "搜索"
                      )}
                    </button>
                  </div>
                  {neteaseState === "off" && (
                    <p className="studio-inline-alert">
                      先在左侧填写网易云接口地址（如自建 NeteaseCloudMusicApi）后即可搜索导入。
                    </p>
                  )}
                  {neteaseResults.length > 0 && (
                    <ul className="studio-playlist-search-results">
                      {neteaseResults.map((song) => (
                        <li key={song.id}>
                          <span>
                            <strong>{song.title}</strong>
                            <small>
                              {song.artist} · {song.album}
                            </small>
                          </span>
                          <button
                            type="button"
                            className="studio-secondary-action"
                            onClick={() => void importNeteaseSong(song)}
                            disabled={busy}
                          >
                            <Plus size={14} />
                            加入
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <header className="studio-track-editor">
                  <h3>歌单曲目（{playlist.tracks.length}）</h3>
                </header>
                <ul className="studio-music-track-list">
                  {playlist.tracks.map((track, index) => (
                    <li key={track.id} className={editingTrackId === track.id ? "active" : ""}>
                      <span className="studio-playlist-position">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="studio-post-row-copy">
                        <strong>{track.title}</strong>
                        <small>
                          {track.artistName || "未知歌手"} ·{" "}
                          {track.durationSeconds > 0
                            ? formatTrackDuration(track.durationSeconds)
                            : "未探测"} · {track.source}
                        </small>
                      </span>
                      <span className="studio-playlist-track-actions">
                        <button
                          type="button"
                          className="studio-icon-button"
                          onClick={() => void moveTrack(index, -1)}
                          disabled={busy || index === 0}
                          aria-label="上移"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="studio-icon-button"
                          onClick={() => void moveTrack(index, 1)}
                          disabled={busy || index === playlist.tracks.length - 1}
                          aria-label="下移"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="studio-secondary-action"
                          onClick={() => editTrack(track)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="studio-danger-action"
                          onClick={() => void removeTrack(track)}
                          disabled={busy}
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </li>
                  ))}
                  {playlist.tracks.length === 0 && (
                    <li className="studio-music-track-empty">
                      这张歌单还没有曲目，可以从上传、音频地址或网易云搜索加入。
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
