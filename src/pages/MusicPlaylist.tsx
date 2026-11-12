import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Disc3,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  Radio,
} from "lucide-react";
import PageFrame from "@/components/PageFrame";
import {
  getAssetUrl,
  playlistTrackToQueueTrack,
  useMusic,
} from "@/components/music/MusicProvider";
import { formatTrackDuration } from "@/lib/lyrics";
import {
  ApiError,
  getMusicPlaylist,
  type MusicPlaylistDetail,
  type MusicPlaylistTrack,
} from "@/lib/api";

export default function MusicPlaylist() {
  const { slug = "" } = useParams();
  const { currentTrack, isPlaying, playPause, playQueue, openFullPlayer } = useMusic();
  const [detail, setDetail] = useState<MusicPlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    window.scrollTo(0, 0);
    getMusicPlaylist(slug)
      .then((data) => {
        if (!active) return;
        setDetail(data);
        document.title = `${data.playlist.title} · StarsailsClover`;
        window.requestAnimationFrame(() => window.scrollTo(0, 0));
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof ApiError && reason.status === 404
            ? "这张歌单尚未公开。"
            : "歌单暂时无法读取。",
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

  const queue = useMemo(
    () => detail?.playlist.tracks.map(playlistTrackToQueueTrack) ?? [],
    [detail],
  );
  const totalSeconds = useMemo(
    () =>
      (detail?.playlist.tracks ?? []).reduce(
        (sum, track) => sum + track.durationSeconds,
        0,
      ),
    [detail],
  );

  if (loading) {
    return (
      <PageFrame eyebrow="Playlist" title="精选歌单">
        <div className="content-state">
          <LoaderCircle size={20} className="spin" />
          <span>正在展开歌单…</span>
        </div>
      </PageFrame>
    );
  }

  if (!detail) {
    return (
      <PageFrame eyebrow="Playlist" title="没有找到这张歌单">
        <p className="content-state">{error}</p>
        <Link className="text-link" to="/music">
          返回音乐创作页
        </Link>
      </PageFrame>
    );
  }

  const { playlist } = detail;
  const playingIndex = queue.findIndex((track) => track.id === currentTrack?.id);

  return (
    <PageFrame eyebrow="Playlist / Curated" title={playlist.title}>
      <Link className="music-back-link" to="/music">
        <ArrowLeft size={15} />
        返回音乐创作页
      </Link>

      <section className="playlist-detail-hero">
        <div className="playlist-detail-art">
          {playlist.coverUrl ? (
            <img src={getAssetUrl(playlist.coverUrl)} alt={`${playlist.title} 封面`} />
          ) : (
            <Disc3 size={52} />
          )}
          <span>{playlist.trackCount} tracks</span>
        </div>
        <div className="playlist-detail-copy">
          <p className="eyebrow">Curated playlist</p>
          <h2>{playlist.title}</h2>
          <p>{playlist.description || "这张歌单还没有写下简介。"}</p>
          <dl>
            <div>
              <dt>曲目</dt>
              <dd>{playlist.trackCount}</dd>
            </div>
            <div>
              <dt>时长</dt>
              <dd>{formatTrackDuration(totalSeconds)}</dd>
            </div>
            <div>
              <dt>更新</dt>
              <dd>{playlist.updatedAt.slice(0, 10)}</dd>
            </div>
          </dl>
          <div className="playlist-detail-actions">
            <button
              type="button"
              className="music-album-play"
              disabled={queue.length === 0}
              onClick={() => playQueue(queue, 0, playlist.title)}
            >
              <Play size={18} />
              播放整张歌单
            </button>
            <button
              type="button"
              className="playlist-fullscreen"
              disabled={!currentTrack}
              onClick={openFullPlayer}
            >
              <Maximize2 size={16} />
              大歌词 / 大封面
            </button>
          </div>
        </div>
      </section>

      <section className="playlist-track-section">
        <header>
          <p className="eyebrow">Track sequence</p>
          <h2>曲目</h2>
        </header>
        {playlist.tracks.length === 0 ? (
          <div className="music-empty-state">
            <span>Track 00</span>
            <h3>这张歌单还在整理。</h3>
            <p>歌单曲目可以在写作室的「歌单」工作区里添加与排序。</p>
          </div>
        ) : (
          <div className="playlist-tracklist">
            {playlist.tracks.map((track, index) => (
              <PlaylistTrack
                key={track.id}
                track={track}
                index={index}
                selected={playingIndex === index}
                playing={playingIndex === index && isPlaying}
                onSelect={() => {
                  if (playingIndex === index) playPause();
                  else playQueue(queue, index, playlist.title);
                }}
                onOpenFull={openFullPlayer}
              />
            ))}
          </div>
        )}
      </section>
    </PageFrame>
  );
}

function PlaylistTrack({
  track,
  index,
  selected,
  playing,
  onSelect,
  onOpenFull,
}: {
  track: MusicPlaylistTrack;
  index: number;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onOpenFull: () => void;
}) {
  const hasLyrics = Boolean(track.lyricsLrc.trim());
  return (
    <div className={`playlist-track ${selected ? "selected" : ""}`}>
      <button type="button" className="playlist-track-main" onClick={onSelect}>
        <span className="playlist-track-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="playlist-track-cover">
          {track.coverUrl ? <img src={getAssetUrl(track.coverUrl)} alt="" /> : <Disc3 size={18} />}
        </span>
        <span className="playlist-track-copy">
          <strong>{track.title}</strong>
          <small>
            {track.artistName || "未知歌手"}
            {track.albumTitle ? ` · ${track.albumTitle}` : ""}
          </small>
        </span>
        <span className="playlist-track-duration">
          {playing ? <Pause size={15} /> : <Play size={15} />}
          {track.durationSeconds > 0 ? formatTrackDuration(track.durationSeconds) : "--:--"}
        </span>
      </button>
      <button
        type="button"
        className="playlist-track-lyrics"
        onClick={onOpenFull}
        disabled={!selected || !hasLyrics}
        aria-label={`查看 ${track.title} 的大歌词`}
        title={hasLyrics ? "大歌词 / 大封面" : "这首曲目没有歌词"}
      >
        <Radio size={15} />
      </button>
    </div>
  );
}
