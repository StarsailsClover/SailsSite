import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  Check,
  FileAudio,
  Headphones,
  LoaderCircle,
  Music2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  createAdminMusicAlbum,
  createAdminMusicTrack,
  deleteAdminMusicAlbum,
  deleteAdminMusicTrack,
  getAdminMusicAlbum,
  listAdminMusicAlbums,
  updateAdminMusicAlbum,
  updateAdminMusicTrack,
  uploadCover,
  uploadMedia,
  type ApiError,
  type MusicAlbum,
  type MusicAlbumInput,
  type MusicTrack,
  type MusicTrackInput,
} from "@/lib/api";
import { formatTrackDuration, parseLrc } from "@/lib/lyrics";

type AlbumDraft = MusicAlbumInput;
type TrackDraft = MusicTrackInput;

function albumDraft(album: MusicAlbum): AlbumDraft {
  return {
    title: album.title,
    slug: album.slug,
    artistName: album.artistName,
    artistBio: album.artistBio,
    description: album.description,
    coverUrl: album.coverUrl,
    genre: album.genre,
    releaseDate: album.releaseDate || "",
    status: album.status,
  };
}

function trackDraft(track: MusicTrack): TrackDraft {
  return {
    title: track.title,
    artistName: track.artistName,
    coverUrl: track.coverUrl,
    genre: track.genre,
    audioUrl: track.audioUrl,
    durationSeconds: track.durationSeconds,
    trackNumber: track.trackNumber,
    lyricsLrc: track.lyricsLrc,
    translationLrc: track.translationLrc,
    status: track.status,
  };
}

export default function StudioMusic({
  csrfToken,
  onNotice,
  onExpired,
  onDirtyChange,
}: {
  csrfToken: string;
  onNotice: (message: string) => void;
  onExpired: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [albums, setAlbums] = useState<MusicAlbum[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [album, setAlbum] = useState<(MusicAlbum & { tracks: MusicTrack[] }) | null>(null);
  const [albumForm, setAlbumForm] = useState<AlbumDraft | null>(null);
  const [albumVersion, setAlbumVersion] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [trackForm, setTrackForm] = useState<TrackDraft | null>(null);
  const [trackVersion, setTrackVersion] = useState(0);
  const [mobilePane, setMobilePane] = useState<"list" | "editor">("list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"album" | "track" | null>(null);
  const [uploading, setUploading] = useState<"album-cover" | "track-cover" | "audio" | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const albumCoverRef = useRef<HTMLInputElement | null>(null);
  const trackCoverRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLInputElement | null>(null);
  const selectedAlbumIdRef = useRef<string | null>(null);
  const selectedTrackIdRef = useRef<string | null>(null);

  const fail = useCallback(
    (reason: unknown, fallback: string) => {
      if (
        reason instanceof Error &&
        "status" in reason &&
        (reason as ApiError).status === 401
      ) {
        onExpired();
        return;
      }
      onNotice(reason instanceof Error ? reason.message : fallback);
    },
    [onExpired, onNotice],
  );

  const loadAlbums = useCallback(async () => {
    const data = await listAdminMusicAlbums(csrfToken);
    setAlbums(data);
    return data;
  }, [csrfToken]);

  const openAlbum = useCallback(
    async (id: string) => {
      const detail = await getAdminMusicAlbum(csrfToken, id);
      setSelectedAlbumId(id);
      setAlbum(detail.album);
      setAlbumForm(albumDraft(detail.album));
      setAlbumVersion(detail.album.version);
      const firstTrack = detail.album.tracks[0] || null;
      setSelectedTrackId(firstTrack?.id || null);
      setTrackForm(firstTrack ? trackDraft(firstTrack) : null);
      setTrackVersion(firstTrack?.version || 0);
      setMobilePane("editor");
    },
    [csrfToken],
  );

  useEffect(() => {
    loadAlbums()
      .then((data) => {
        if (data[0]) return openAlbum(data[0].id);
        return undefined;
      })
      .catch((reason) => fail(reason, "音乐作品读取失败。"))
      .finally(() => setLoading(false));
  }, [fail, loadAlbums, openAlbum]);

  const lyricCount = useMemo(
    () => (trackForm ? parseLrc(trackForm.lyricsLrc).length : 0),
    [trackForm],
  );
  const translationCount = useMemo(
    () => (trackForm ? parseLrc(trackForm.translationLrc).length : 0),
    [trackForm],
  );
  const selectedTrack = useMemo(
    () => album?.tracks.find((track) => track.id === selectedTrackId) || null,
    [album, selectedTrackId],
  );
  const albumDirty = Boolean(
    album &&
      albumForm &&
      JSON.stringify(albumForm) !== JSON.stringify(albumDraft(album)),
  );
  const trackDirty = Boolean(
    selectedTrack &&
      trackForm &&
      JSON.stringify(trackForm) !== JSON.stringify(trackDraft(selectedTrack)),
  );

  useEffect(() => {
    selectedAlbumIdRef.current = selectedAlbumId;
  }, [selectedAlbumId]);

  useEffect(() => {
    selectedTrackIdRef.current = selectedTrackId;
  }, [selectedTrackId]);

  useEffect(() => {
    onDirtyChange?.(albumDirty || trackDirty);
  }, [albumDirty, onDirtyChange, trackDirty]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!albumDirty && !trackDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    if (albumDirty || trackDirty) {
      window.addEventListener("beforeunload", beforeUnload);
    }
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [albumDirty, trackDirty]);

  const createAlbum = async () => {
    if (uploading || saving) return;
    if (
      (albumDirty || trackDirty) &&
      !window.confirm("当前作品有未保存修改，新建专辑后将丢失。继续吗？")
    ) {
      return;
    }
    try {
      const created = await createAdminMusicAlbum(csrfToken, {
        title: "未命名专辑",
        slug: `album-${Date.now().toString(36)}`,
        artistName: "StarsailsClover",
        artistBio: "",
        description: "",
        coverUrl: "",
        genre: "未分类",
        releaseDate: new Date().toISOString().slice(0, 10),
        status: "draft",
      });
      await loadAlbums();
      await openAlbum(created.id);
      onNotice("新专辑已建立。");
    } catch (reason) {
      fail(reason, "新建专辑失败。");
    }
  };

  const selectTrack = (track: MusicTrack, { skipDirtyCheck = false } = {}) => {
    if (uploading || saving) return;
    if (
      !skipDirtyCheck &&
      track.id !== selectedTrackId &&
      trackDirty &&
      !window.confirm("当前单曲有未保存修改，切换后将丢失。继续吗？")
    ) {
      return;
    }
    setSelectedTrackId(track.id);
    setTrackForm(trackDraft(track));
    setTrackVersion(track.version);
  };

  const saveAlbum = async () => {
    if (!selectedAlbumId || !albumForm || saving || uploading) return;
    setSaving("album");
    try {
      const updated = await updateAdminMusicAlbum(csrfToken, selectedAlbumId, {
        ...albumForm,
        expectedVersion: albumVersion,
      });
      setAlbum(updated);
      setAlbumVersion(updated.version);
      await loadAlbums();
      onNotice("专辑信息已保存。");
    } catch (reason) {
      fail(reason, "专辑保存失败。");
    } finally {
      setSaving(null);
    }
  };

  const removeAlbum = async () => {
    if (!selectedAlbumId || !albumForm) return;
    if (uploading || saving) return;
    if (!window.confirm(`删除专辑「${albumForm.title}」及其中的单曲？`)) return;
    try {
      await deleteAdminMusicAlbum(csrfToken, selectedAlbumId, albumVersion);
      setSelectedAlbumId(null);
      setAlbum(null);
      setAlbumForm(null);
      setSelectedTrackId(null);
      setTrackForm(null);
      setMobilePane("list");
      await loadAlbums();
      onNotice("专辑已删除。");
    } catch (reason) {
      fail(reason, "删除专辑失败。");
    }
  };

  const createTrack = async () => {
    if (!selectedAlbumId || !album || !albumForm) return;
    if (uploading || saving) return;
    if (
      trackDirty &&
      !window.confirm("当前单曲有未保存修改，新增单曲后将丢失。继续吗？")
    ) {
      return;
    }
    const existing = new Set(album.tracks.map((track) => track.id));
    try {
      const updated = await createAdminMusicTrack(csrfToken, selectedAlbumId, {
        title: "未命名单曲",
        artistName: albumForm.artistName,
        coverUrl: albumForm.coverUrl,
        genre: albumForm.genre,
        audioUrl: "",
        durationSeconds: 0,
        trackNumber: album.tracks.length + 1,
        lyricsLrc: "",
        translationLrc: "",
        status: "draft",
      });
      setAlbum(updated);
      const created = updated.tracks.find((track) => !existing.has(track.id));
      if (created) selectTrack(created, { skipDirtyCheck: true });
      await loadAlbums();
      onNotice("新单曲已加入专辑。");
    } catch (reason) {
      fail(reason, "新建单曲失败。");
    }
  };

  const saveTrack = async () => {
    if (!selectedTrackId || !trackForm || saving || uploading) return;
    if (trackForm.status === "published" && !trackForm.audioUrl) {
      onNotice("公开单曲必须先上传音频。");
      return;
    }
    setSaving("track");
    try {
      const updated = await updateAdminMusicTrack(csrfToken, selectedTrackId, {
        ...trackForm,
        expectedVersion: trackVersion,
      });
      setAlbum(updated);
      const saved = updated.tracks.find((track) => track.id === selectedTrackId);
      if (saved) {
        setTrackForm(trackDraft(saved));
        setTrackVersion(saved.version);
      }
      await loadAlbums();
      onNotice("单曲信息与歌词已保存。");
    } catch (reason) {
      fail(reason, "单曲保存失败。");
    } finally {
      setSaving(null);
    }
  };

  const removeTrack = async () => {
    if (!selectedTrackId || !trackForm) return;
    if (uploading || saving) return;
    if (!window.confirm(`删除单曲「${trackForm.title}」？`)) return;
    try {
      const updated = await deleteAdminMusicTrack(
        csrfToken,
        selectedTrackId,
        trackVersion,
      );
      setAlbum(updated);
      const next = updated.tracks[0] || null;
      setSelectedTrackId(next?.id || null);
      setTrackForm(next ? trackDraft(next) : null);
      setTrackVersion(next?.version || 0);
      await loadAlbums();
      onNotice("单曲已删除。");
    } catch (reason) {
      fail(reason, "删除单曲失败。");
    }
  };

  const uploadImage = async (
    event: ChangeEvent<HTMLInputElement>,
    target: "album" | "track",
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const albumIdAtStart = selectedAlbumIdRef.current;
    const trackIdAtStart = selectedTrackIdRef.current;
    setUploading(target === "album" ? "album-cover" : "track-cover");
    try {
      const result = await uploadCover(csrfToken, file);
      if (target === "album") {
        if (selectedAlbumIdRef.current !== albumIdAtStart) {
          onNotice("封面已上传，但专辑选择已变化，未写入表单。");
          return;
        }
        setAlbumForm((current) => current && { ...current, coverUrl: result.url });
      } else {
        if (selectedTrackIdRef.current !== trackIdAtStart) {
          onNotice("封面已上传，但单曲选择已变化，未写入表单。");
          return;
        }
        setTrackForm((current) => current && { ...current, coverUrl: result.url });
      }
      onNotice("封面已转换为 WebP，保存后生效。");
    } catch (reason) {
      fail(reason, "封面上传失败。");
    } finally {
      setUploading(null);
    }
  };

  const uploadAudioFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !trackForm) return;
    const trackIdAtStart = selectedTrackIdRef.current;
    setUploading("audio");
    setUploadProgress(0);
    try {
      const result = await uploadMedia(csrfToken, file, setUploadProgress);
      if (result.media.kind !== "audio") {
        throw new Error("上传结果不是音频文件");
      }
      if (selectedTrackIdRef.current !== trackIdAtStart) {
        onNotice("音频已上传，但单曲选择已变化，未写入表单。");
        return;
      }
      setTrackForm((current) =>
        current
          ? {
              ...current,
              audioUrl: result.media.url,
              durationSeconds: result.durationSeconds ?? current.durationSeconds,
            }
          : current,
      );
      if (!result.durationSeconds) {
        const probe = new Audio(result.media.url);
        probe.addEventListener(
          "loadedmetadata",
          () => {
            if (
              Number.isFinite(probe.duration) &&
              selectedTrackIdRef.current === trackIdAtStart
            ) {
              setTrackForm((current) =>
                current
                  ? { ...current, durationSeconds: Math.round(probe.duration) }
                  : current,
              );
            }
          },
          { once: true },
        );
      }
      onNotice("音频已上传，保存单曲后生效。");
    } catch (reason) {
      fail(reason, "音频上传失败。");
    } finally {
      setUploading(null);
      setUploadProgress(0);
    }
  };

  return (
    <section className="studio-feature studio-music" data-pane={mobilePane}>
      <aside className="studio-feature-list">
        <header>
          <div>
            <span>Music Works</span>
            <strong>音乐作品</strong>
          </div>
          <button
            type="button"
            className="studio-icon-button"
            onClick={createAlbum}
            aria-label="新建专辑"
            title="新建专辑"
          >
            <Plus size={18} />
          </button>
        </header>
        <div className="studio-feature-list-body">
          {loading && <div className="studio-rail-state">正在整理唱片…</div>}
          {!loading &&
            albums.map((item) => (
              <button
                type="button"
                key={item.id}
                className={selectedAlbumId === item.id ? "active" : ""}
                onClick={() => {
                  if (uploading || saving) return;
                  if (item.id === selectedAlbumId) {
                    setMobilePane("editor");
                    return;
                  }
                  if (
                    (albumDirty || trackDirty) &&
                    !window.confirm("当前作品有未保存修改，切换专辑后将丢失。继续吗？")
                  ) {
                    return;
                  }
                  void openAlbum(item.id);
                }}
              >
                <Music2 size={15} />
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.trackCount} 首 · {item.genre} · {item.status === "published" ? "已发布" : "草稿"}
                  </small>
                </span>
              </button>
            ))}
        </div>
      </aside>

      <div className="studio-feature-editor">
        <button type="button" className="studio-mobile-back" onClick={() => setMobilePane("list")}>
          <ArrowLeft size={18} /> 返回音乐作品
        </button>
        {!albumForm || !album ? (
          <div className="studio-empty-copy">
            <Headphones size={30} />
            <h2>让一张唱片拥有完整的房间。</h2>
            <p>先新建专辑，再上传封面、音频、歌词与翻译。</p>
          </div>
        ) : (
          <>
            <header className="studio-feature-editor-header">
              <div>
                <p>Album</p>
                <h2>{albumForm.title || "未命名专辑"}</h2>
              </div>
              <div>
                <button type="button" className="studio-secondary-action" onClick={removeAlbum}>
                  <Trash2 size={15} /> 删除
                </button>
                <button
                  type="button"
                  className="studio-primary-action compact"
                  onClick={saveAlbum}
                  disabled={saving === "album"}
                >
                  {saving === "album" ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
                  保存专辑
                </button>
              </div>
            </header>

            <div className="studio-music-overview">
              <section className="studio-music-fields">
                <label>
                  <span>专辑名称</span>
                  <input
                    value={albumForm.title}
                    onChange={(event) => setAlbumForm({ ...albumForm, title: event.target.value })}
                  />
                </label>
                <label>
                  <span>专辑地址</span>
                  <input
                    value={albumForm.slug}
                    onChange={(event) => setAlbumForm({ ...albumForm, slug: event.target.value })}
                  />
                </label>
                <label>
                  <span>歌手</span>
                  <input
                    value={albumForm.artistName}
                    onChange={(event) => setAlbumForm({ ...albumForm, artistName: event.target.value })}
                  />
                </label>
                <label>
                  <span>流派</span>
                  <input
                    value={albumForm.genre}
                    onChange={(event) => setAlbumForm({ ...albumForm, genre: event.target.value })}
                  />
                </label>
                <label>
                  <span>发行日期</span>
                  <input
                    type="date"
                    value={albumForm.releaseDate}
                    onChange={(event) => setAlbumForm({ ...albumForm, releaseDate: event.target.value })}
                  />
                </label>
                <label>
                  <span>公开状态</span>
                  <select
                    value={albumForm.status}
                    onChange={(event) =>
                      setAlbumForm({
                        ...albumForm,
                        status: event.target.value as AlbumDraft["status"],
                      })
                    }
                  >
                    <option value="draft">草稿</option>
                    <option value="published">已发布</option>
                  </select>
                </label>
                <label className="wide">
                  <span>专辑简介</span>
                  <textarea
                    rows={4}
                    value={albumForm.description}
                    onChange={(event) => setAlbumForm({ ...albumForm, description: event.target.value })}
                  />
                </label>
                <label className="wide">
                  <span>歌手信息</span>
                  <textarea
                    rows={4}
                    value={albumForm.artistBio}
                    onChange={(event) => setAlbumForm({ ...albumForm, artistBio: event.target.value })}
                  />
                </label>
                <label className="wide">
                  <span>专辑封面链接</span>
                  <div className="studio-inline-upload">
                    <input
                      value={albumForm.coverUrl}
                      onChange={(event) => setAlbumForm({ ...albumForm, coverUrl: event.target.value })}
                      placeholder="/uploads/..."
                    />
                    <button
                      type="button"
                      className="studio-secondary-action"
                      onClick={() => albumCoverRef.current?.click()}
                      disabled={Boolean(uploading)}
                    >
                      {uploading === "album-cover" ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}
                      上传封面
                    </button>
                    <input
                      ref={albumCoverRef}
                      hidden
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
                      onChange={(event) => uploadImage(event, "album")}
                    />
                  </div>
                </label>
                {albumForm.coverUrl && (
                  <div className="studio-music-cover-preview">
                    <img src={albumForm.coverUrl} alt="专辑封面预览" />
                  </div>
                )}
              </section>

              <section className="studio-music-tracks">
                <header>
                  <div>
                    <span>{album.tracks.length} 首单曲</span>
                    <small>曲序决定访客看到的排布</small>
                  </div>
                  <button type="button" className="studio-secondary-action" onClick={createTrack}>
                    <Plus size={15} /> 新增单曲
                  </button>
                </header>
                <div className="studio-music-track-list">
                  {album.tracks.map((track) => (
                    <button
                      type="button"
                      key={track.id}
                      className={track.id === selectedTrackId ? "active" : ""}
                      onClick={() => selectTrack(track)}
                    >
                      <span>{String(track.trackNumber).padStart(2, "0")}</span>
                      <div>
                        <strong>{track.title}</strong>
                        <small>
                          {track.status === "published" ? "已发布" : "草稿"} ·{" "}
                          {formatTrackDuration(track.durationSeconds)} · {track.genre}
                        </small>
                      </div>
                      {track.audioUrl && <Check size={14} />}
                    </button>
                  ))}
                  {album.tracks.length === 0 && (
                    <div className="studio-music-track-empty">
                      <FileAudio size={22} />
                      <p>这张专辑还没有单曲。</p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {trackForm && selectedTrackId && (
              <section className="studio-track-editor">
                <header>
                  <div>
                    <p>Track</p>
                    <h3>{trackForm.title || "未命名单曲"}</h3>
                  </div>
                  <div>
                    <button type="button" className="studio-secondary-action" onClick={removeTrack}>
                      <Trash2 size={15} /> 删除单曲
                    </button>
                    <button
                      type="button"
                      className="studio-primary-action compact"
                      onClick={saveTrack}
                      disabled={saving === "track"}
                    >
                      {saving === "track" ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
                      保存单曲
                    </button>
                  </div>
                </header>

                <div className="studio-track-fields">
                  <label className="wide">
                    <span>单曲名称</span>
                    <input
                      value={trackForm.title}
                      onChange={(event) => setTrackForm({ ...trackForm, title: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>歌手</span>
                    <input
                      value={trackForm.artistName}
                      onChange={(event) => setTrackForm({ ...trackForm, artistName: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>流派</span>
                    <input
                      value={trackForm.genre}
                      onChange={(event) => setTrackForm({ ...trackForm, genre: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>曲序</span>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={trackForm.trackNumber}
                      onChange={(event) =>
                        setTrackForm({ ...trackForm, trackNumber: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>时长（秒）</span>
                    <input
                      type="number"
                      min={0}
                      value={trackForm.durationSeconds}
                      onChange={(event) =>
                        setTrackForm({ ...trackForm, durationSeconds: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>公开状态</span>
                    <select
                      value={trackForm.status}
                      onChange={(event) =>
                        setTrackForm({
                          ...trackForm,
                          status: event.target.value as TrackDraft["status"],
                        })
                      }
                    >
                      <option value="draft">草稿</option>
                      <option value="published">已发布</option>
                    </select>
                  </label>
                  <label className="wide">
                    <span>单曲封面链接</span>
                    <div className="studio-inline-upload">
                      <input
                        value={trackForm.coverUrl}
                        onChange={(event) => setTrackForm({ ...trackForm, coverUrl: event.target.value })}
                        placeholder="留空则沿用专辑封面"
                      />
                      <button
                        type="button"
                        className="studio-secondary-action"
                        onClick={() => trackCoverRef.current?.click()}
                        disabled={Boolean(uploading)}
                      >
                        {uploading === "track-cover" ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}
                        上传封面
                      </button>
                      <input
                        ref={trackCoverRef}
                        hidden
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
                        onChange={(event) => uploadImage(event, "track")}
                      />
                    </div>
                  </label>
                  <label className="wide">
                    <span>音频文件</span>
                    <div className="studio-inline-upload">
                      <input
                        value={trackForm.audioUrl}
                        onChange={(event) => setTrackForm({ ...trackForm, audioUrl: event.target.value })}
                        placeholder="/uploads/..."
                      />
                      <button
                        type="button"
                        className="studio-primary-action compact"
                        onClick={() => audioRef.current?.click()}
                        disabled={Boolean(uploading)}
                      >
                        {uploading === "audio" ? <LoaderCircle size={15} className="spin" /> : <FileAudio size={15} />}
                        {uploading === "audio" ? `上传中 ${uploadProgress}%` : "上传音频"}
                      </button>
                      <input
                        ref={audioRef}
                        hidden
                        type="file"
                        accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/flac,audio/x-flac,.mp3,.m4a,.aac,.wav,.ogg,.flac"
                        onChange={uploadAudioFile}
                      />
                    </div>
                  </label>
                  <label className="wide lyric-field">
                    <span>原文歌词（LRC，支持 [mm:ss.xx] 时间戳）</span>
                    <textarea
                      rows={12}
                      value={trackForm.lyricsLrc}
                      onChange={(event) => setTrackForm({ ...trackForm, lyricsLrc: event.target.value })}
                      placeholder={"[00:00.00]第一句\n[00:12.40]第二句"}
                    />
                    <small>
                      {lyricCount > 0 ? `识别到 ${lyricCount} 行带时间戳歌词` : "未识别时间戳，将在前台按纯文本显示"}
                    </small>
                  </label>
                  <label className="wide lyric-field">
                    <span>中文翻译（可选，推荐同样使用 LRC 时间戳）</span>
                    <textarea
                      rows={12}
                      value={trackForm.translationLrc}
                      onChange={(event) => setTrackForm({ ...trackForm, translationLrc: event.target.value })}
                      placeholder={"[00:00.00]第一句翻译\n[00:12.40]第二句翻译"}
                    />
                    <small>
                      {translationCount > 0
                        ? `识别到 ${translationCount} 行翻译`
                        : trackForm.translationLrc.trim()
                          ? "翻译将按原文行序配对"
                          : "暂无中文翻译"}
                    </small>
                  </label>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
