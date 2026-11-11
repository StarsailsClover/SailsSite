import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AudioLines,
  Clipboard,
  Film,
  Image as ImageIcon,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteMedia,
  listMedia,
  uploadMedia,
  type ApiError,
  type MediaItem,
} from "@/lib/api";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudioMedia({
  csrfToken,
  onNotice,
  onExpired,
}: {
  csrfToken: string;
  onNotice: (message: string) => void;
  onExpired: () => void;
}) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastUpload, setLastUpload] = useState<{ media: MediaItem; markdown: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const load = useCallback(() => {
    setLoading(true);
    listMedia(csrfToken)
      .then(setMedia)
      .catch((reason) => fail(reason, "媒体库读取失败。"))
      .finally(() => setLoading(false));
  }, [csrfToken, fail]);

  useEffect(load, [load]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      onNotice("单个文件不能超过 200 MB。");
      return;
    }
    setUploading(true);
    setProgress(0);
    setLastUpload(null);
    try {
      const result = await uploadMedia(csrfToken, file, setProgress);
      setLastUpload(result);
      setMedia((current) => [result.media, ...current.filter((item) => item.id !== result.media.id)]);
      onNotice("文件已上传并生成文章链接。");
      await load();
    } catch (reason) {
      fail(reason, "文件上传失败。");
    } finally {
      setUploading(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onNotice("链接已复制。");
    } catch {
      onNotice("复制失败，请手动选择链接。");
    }
  };

  const remove = async (item: MediaItem) => {
    if (!window.confirm(`删除 ${item.originalName}？文章中的链接将失效。`)) return;
    try {
      await deleteMedia(csrfToken, item.id);
      setMedia((current) => current.filter((entry) => entry.id !== item.id));
      if (lastUpload?.media.id === item.id) setLastUpload(null);
      onNotice("媒体文件已删除。");
    } catch (reason) {
      fail(reason, "媒体文件删除失败。");
    }
  };

  return (
    <section className="studio-media-page">
      <header className="studio-feature-editor-header">
        <div>
          <p>Media Library</p>
          <h2>图片、音频与视频</h2>
        </div>
        <button
          type="button"
          className="studio-primary-action compact"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}
          {uploading ? `上传中 ${progress}%` : "上传文件"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/flac,audio/x-flac,.mp3,.m4a,.aac,.wav,.ogg,.flac"
          hidden
          onChange={upload}
        />
      </header>

      {lastUpload && (
        <section className="studio-upload-result">
          <div>
            <strong>刚上传：{lastUpload.media.originalName}</strong>
            <code>{lastUpload.media.url}</code>
            <code>{lastUpload.markdown}</code>
          </div>
          <button type="button" className="studio-secondary-action" onClick={() => copy(lastUpload.media.url)}>
            <Clipboard size={15} /> 复制链接
          </button>
          <button type="button" className="studio-secondary-action" onClick={() => copy(lastUpload.markdown)}>
            <Clipboard size={15} /> 复制 Markdown
          </button>
        </section>
      )}

      {loading ? (
        <div className="content-state"><LoaderCircle className="spin" size={20} /> 正在整理媒体…</div>
      ) : media.length === 0 ? (
        <div className="studio-empty-copy">
          <ImageIcon size={28} />
          <h2>媒体库还是空的。</h2>
          <p>上传图片、音频或视频后，复制链接直接粘贴到文章与音乐作品中。</p>
        </div>
      ) : (
        <div className="studio-media-grid">
          {media.map((item) => (
            <article key={item.id}>
              <div className="studio-media-preview">
                {item.kind === "video" ? (
                  <video src={item.url} controls preload="metadata" />
                ) : item.kind === "audio" ? (
                  <audio src={item.url} controls preload="metadata" />
                ) : (
                  <img src={item.url} alt={item.originalName} loading="lazy" />
                )}
                <span>
                  {item.kind === "video" ? (
                    <Film size={14} />
                  ) : item.kind === "audio" ? (
                    <AudioLines size={14} />
                  ) : (
                    <ImageIcon size={14} />
                  )}
                </span>
              </div>
              <div className="studio-media-info">
                <strong title={item.originalName}>{item.originalName}</strong>
                <small>{formatBytes(item.bytes)} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</small>
                <code>{item.url}</code>
              </div>
              <footer>
                <button type="button" className="studio-secondary-action" onClick={() => copy(item.url)}>
                  <Clipboard size={14} /> 链接
                </button>
                <button
                  type="button"
                  className="studio-secondary-action"
                  onClick={() =>
                    copy(
                      item.kind === "image"
                        ? `![${item.originalName}](${item.url})`
                        : item.kind === "video"
                          ? `![视频](${item.url})`
                          : `[音频：${item.originalName}](${item.url})`,
                    )
                  }
                >
                  <Clipboard size={14} /> Markdown
                </button>
                <button type="button" className="studio-icon-button" onClick={() => remove(item)} aria-label="删除媒体" title="删除媒体">
                  <Trash2 size={15} />
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
