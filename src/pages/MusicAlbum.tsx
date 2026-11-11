import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Disc3,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  Radio,
} from "lucide-react";
import PageFrame from "@/components/PageFrame";
import { getAssetUrl, useMusic } from "@/components/music/MusicProvider";
import {
  activeLyricIndex,
  formatTrackDuration,
  mergeLyrics,
} from "@/lib/lyrics";
import { ApiError, getMusicAlbum, type MusicAlbumDetail, type MusicTrack } from "@/lib/api";

function releaseYear(value: string | null) {
  return value?.slice(0, 4) || "";
}

export default function MusicAlbum() {
  const { slug = "" } = useParams();
  const {
    currentTrack,
    isPlaying,
    progress,
    playPause,
    selectTrackById,
  } = useMusic();
  const [detail, setDetail] = useState<MusicAlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [followLyrics, setFollowLyrics] = useState(true);
  const lyricViewportRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(false);
  const autoScrollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    window.scrollTo(0, 0);
    getMusicAlbum(slug)
      .then((data) => {
        if (!active) return;
        setDetail(data);
        setSelectedTrackId(data.album.tracks[0]?.id || "");
        document.title = `${data.album.title} · StarsailsClover`;
        window.requestAnimationFrame(() => window.scrollTo(0, 0));
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof ApiError && reason.status === 404
            ? "这张专辑尚未公开。"
            : "唱片页暂时无法读取。",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      document.title = "StarsailsClover · 飞流星墅";
    };
  }, [slug]);

  useEffect(() => {
    if (!detail || !currentTrack) return;
    if (detail.album.tracks.some((track) => track.id === currentTrack.id)) {
      setSelectedTrackId(currentTrack.id);
    }
  }, [currentTrack, detail]);

  useEffect(() => {
    setFollowLyrics(true);
  }, [selectedTrackId]);

  const selectedTrack = useMemo(
    () => detail?.album.tracks.find((track) => track.id === selectedTrackId) || null,
    [detail, selectedTrackId],
  );
  const lyricLines = useMemo(
    () =>
      selectedTrack
        ? mergeLyrics(selectedTrack.lyricsLrc, selectedTrack.translationLrc)
        : [],
    [selectedTrack],
  );
  const sameTrackIsPlaying = Boolean(
    selectedTrack && currentTrack?.id === selectedTrack.id,
  );
  const activeLine = sameTrackIsPlaying
    ? activeLyricIndex(lyricLines, progress)
    : -1;

  useEffect(() => {
    if (!followLyrics || activeLine < 0 || !lyricViewportRef.current) return;
    const viewport = lyricViewportRef.current;
    const line = viewport.querySelector<HTMLElement>(
      `[data-lyric-index="${activeLine}"]`,
    );
    if (!line) return;
    autoScrollRef.current = true;
    viewport.scrollTo({
      top: Math.max(
        0,
        line.offsetTop - viewport.clientHeight / 2 + line.clientHeight / 2,
      ),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    if (autoScrollTimerRef.current !== null) {
      window.clearTimeout(autoScrollTimerRef.current);
    }
    autoScrollTimerRef.current = window.setTimeout(() => {
      autoScrollRef.current = false;
    }, 650);
  }, [activeLine, followLyrics]);

  useEffect(
    () => () => {
      if (autoScrollTimerRef.current !== null) {
        window.clearTimeout(autoScrollTimerRef.current);
      }
    },
    [],
  );

  if (loading) {
    return (
      <PageFrame eyebrow="Discography" title="唱片档案">
        <div className="content-state">
          <LoaderCircle size={20} className="spin" />
          <span>正在翻开唱片与词页…</span>
        </div>
      </PageFrame>
    );
  }

  if (!detail) {
    return (
      <PageFrame eyebrow="Discography" title="没有找到这张唱片">
        <p className="content-state">{error}</p>
        <Link className="text-link" to="/music">返回音乐创作页</Link>
      </PageFrame>
    );
  }

  const { album } = detail;
  const firstTrack = album.tracks[0];
  const totalSeconds = album.tracks.reduce(
    (sum, track) => sum + track.durationSeconds,
    0,
  );

  return (
    <PageFrame
      eyebrow={`Discography / ${releaseYear(album.releaseDate)}`}
      title="唱片档案"
    >
      <Link className="music-back-link" to="/music">
        <ArrowLeft size={15} />
        返回全部唱片
      </Link>

      <section className="album-detail-hero">
        <div className="album-detail-art">
          {album.coverUrl ? (
            <img src={getAssetUrl(album.coverUrl)} alt={`${album.title} 封面`} />
          ) : (
            <Disc3 size={52} />
          )}
          <span>{album.genre}</span>
        </div>
        <div className="album-detail-copy">
          <p className="eyebrow">{album.artistName}</p>
          <h2>{album.title}</h2>
          <p>{album.description}</p>
          <dl>
            <div><dt>流派</dt><dd>{album.genre}</dd></div>
            <div><dt>发行</dt><dd>{album.releaseDate || "待定"}</dd></div>
            <div><dt>曲目</dt><dd>{album.tracks.length}</dd></div>
            <div><dt>时长</dt><dd>{formatTrackDuration(totalSeconds)}</dd></div>
          </dl>
          <button
            type="button"
            className="music-album-play"
            disabled={!firstTrack}
            onClick={() => firstTrack && selectTrackById(firstTrack.id)}
          >
            <Play size={18} />
            播放整张专辑
          </button>
        </div>
        <aside className="album-artist-card">
          <Headphones size={18} />
          <span>About the artist</span>
          <strong>{album.artistName}</strong>
          <p>{album.artistBio || "这位创作者还没有留下自我介绍。"}</p>
        </aside>
      </section>

      <section className="album-record-body">
        <div className="album-track-column">
          <header>
            <p className="eyebrow">Track sequence</p>
            <h2>曲目</h2>
          </header>
          <div className="album-tracklist">
            {album.tracks.map((track) => (
              <AlbumTrack
                key={track.id}
                track={track}
                albumCover={album.coverUrl}
                selected={selectedTrackId === track.id}
                playing={currentTrack?.id === track.id && isPlaying}
                onSelect={() => {
                  setSelectedTrackId(track.id);
                  selectTrackById(track.id);
                }}
              />
            ))}
            {album.tracks.length === 0 && (
              <div className="music-empty-state compact">
                <span>Track 00</span>
                <h3>曲目正在整理。</h3>
                <p>这张专辑还没有公开单曲。</p>
              </div>
            )}
          </div>
        </div>

        <aside className="album-lyrics-column">
          <header>
            <div>
              <p className="eyebrow">Lyrics / Translation</p>
              <h2>{selectedTrack?.title || "词页"}</h2>
            </div>
            {selectedTrack && (
              <div className="album-lyrics-actions">
                {!followLyrics && (
                  <button type="button" onClick={() => setFollowLyrics(true)}>
                    跟随歌词
                  </button>
                )}
                <span>{selectedTrack.genre} · {formatTrackDuration(selectedTrack.durationSeconds)}</span>
              </div>
            )}
          </header>
          {selectedTrack && lyricLines.length > 0 ? (
            <div
              className="lyric-viewport"
              ref={lyricViewportRef}
              onScroll={() => {
                if (!autoScrollRef.current) setFollowLyrics(false);
              }}
            >
              {lyricLines.map((line, index) => (
                <button
                  type="button"
                  className={index === activeLine ? "active" : ""}
                  aria-current={index === activeLine ? "true" : undefined}
                  data-lyric-index={index}
                  key={`${line.time ?? "plain"}-${index}`}
                  onClick={() => {
                    setFollowLyrics(true);
                    if (line.time === null) {
                      selectTrackById(selectedTrack.id);
                      return;
                    }
                    selectTrackById(selectedTrack.id, line.time);
                  }}
                >
                  <time>
                    {line.time === null ? `#${index + 1}` : formatTrackDuration(line.time)}
                  </time>
                  <span>
                    <strong>{line.text}</strong>
                    {line.translation && <small>{line.translation}</small>}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="music-lyrics-empty">
              <Radio size={22} />
              <p>{selectedTrack ? "这首单曲尚未附上歌词。" : "选择一首单曲以查看歌词。"}</p>
            </div>
          )}
          {selectedTrack && (
            <button
              type="button"
              className="lyrics-play-line"
              onClick={() => {
                if (sameTrackIsPlaying) playPause();
                else selectTrackById(selectedTrack.id);
              }}
            >
              {sameTrackIsPlaying && isPlaying ? <Pause size={16} /> : <Play size={16} />}
              {sameTrackIsPlaying && isPlaying ? "暂停播放" : "从这首单曲开始"}
            </button>
          )}
        </aside>
      </section>
    </PageFrame>
  );
}

function AlbumTrack({
  track,
  albumCover,
  selected,
  playing,
  onSelect,
}: {
  track: MusicTrack;
  albumCover: string;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
}) {
  const cover = track.coverUrl || albumCover;
  return (
    <button
      type="button"
      className={`album-track ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <span className="album-track-number">
        {String(track.trackNumber).padStart(2, "0")}
      </span>
      <span className="album-track-cover">
        {cover ? <img src={getAssetUrl(cover)} alt="" /> : <Disc3 size={18} />}
      </span>
      <span className="album-track-copy">
        <strong>{track.title}</strong>
        <small>{track.artistName} · {track.genre}</small>
      </span>
      <span className="album-track-duration">
        {playing ? <Pause size={15} /> : <Play size={15} />}
        {formatTrackDuration(track.durationSeconds)}
      </span>
    </button>
  );
}
