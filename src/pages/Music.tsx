import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Disc3,
  LoaderCircle,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
} from "lucide-react";
import PageFrame from "@/components/PageFrame";
import { getAssetUrl, useMusic } from "@/components/music/MusicProvider";
import { useSiteText } from "@/hooks/useSiteText";
import { listMusicAlbums, type MusicAlbum } from "@/lib/api";

function releaseYear(album: MusicAlbum) {
  return album.releaseDate?.slice(0, 4) || album.createdAt.slice(0, 4);
}

export default function Music() {
  const {
    currentTrack,
    isPlaying,
    error,
    playPause,
    next,
    previous,
  } = useMusic();
  const text = useSiteText();
  const [albums, setAlbums] = useState<MusicAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    listMusicAlbums()
      .then((data) => {
        if (active) setAlbums(data);
      })
      .catch(() => {
        if (active) setLoadError("作品目录暂时未能越过雾谷抵达。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageFrame eyebrow={text.music.eyebrow} title={text.music.title}>
      <section className="music-studio-hero" aria-label="正在播放的创作">
        <div className={`music-cover-stage ${isPlaying ? "is-playing" : ""}`}>
          <div className="music-cover-disc">
            {currentTrack ? (
              <img
                src={getAssetUrl(currentTrack.coverPath)}
                alt={`${currentTrack.album} 封面`}
              />
            ) : (
              <Disc3 size={54} />
            )}
          </div>
          <span>{playingLabel(isPlaying, currentTrack?.genre)}</span>
        </div>

        <div className="music-studio-now">
          <p className="eyebrow">{text.music.nowPlaying}</p>
          <h2>{currentTrack?.title ?? text.music.silentTitle}</h2>
          <p>
            {error ??
              (currentTrack
                ? `${currentTrack.artist} · ${currentTrack.album}`
                : text.music.waitingArtist)}
          </p>
          <div className="music-main-controls">
            <button type="button" onClick={previous} aria-label="上一首">
              <SkipBack size={18} />
            </button>
            <button
              type="button"
              className="music-play-control"
              onClick={playPause}
              aria-label={isPlaying ? "暂停" : "播放"}
            >
              {isPlaying ? <Pause size={21} /> : <Play size={21} />}
            </button>
            <button type="button" onClick={next} aria-label="下一首">
              <SkipForward size={18} />
            </button>
          </div>
        </div>

        <aside className="music-listening-note">
          <Radio size={18} />
          <p>旋律、词句与封面共同构成一张可以进入的房间。</p>
          <span>Listening room / private press</span>
        </aside>
      </section>

      <section className="music-release-section">
        <header>
          <div>
            <p className="eyebrow">Selected Recordings</p>
            <h2>创作专辑</h2>
          </div>
          <p>每一张专辑收录一组完整叙事，单曲保留歌词、翻译与独立封面。</p>
        </header>

        {loading && (
          <div className="content-state">
            <LoaderCircle size={20} className="spin" />
            <span>正在整理唱片与词页…</span>
          </div>
        )}
        {!loading && loadError && (
          <div className="content-state content-state-error">
            <p>{loadError}</p>
          </div>
        )}
        {!loading && !loadError && albums.length === 0 && (
          <div className="music-empty-state">
            <span>No. 00</span>
            <h3>第一张唱片仍在压片。</h3>
            <p>专辑、单曲与歌词可以从写作室后台上传，发布后会在这里形成完整唱片页。</p>
          </div>
        )}
        {!loading && !loadError && albums.length > 0 && (
          <div className="music-album-grid">
            {albums.map((album, index) => (
              <Link
                to={`/music/${encodeURIComponent(album.slug)}`}
                className="music-album-card"
                key={album.id}
              >
                <div className="music-album-cover">
                  {album.coverUrl ? (
                    <img src={getAssetUrl(album.coverUrl)} alt={`${album.title} 封面`} />
                  ) : (
                    <Disc3 size={38} />
                  )}
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="music-album-copy">
                  <p>{album.artistName}</p>
                  <h3>{album.title}</h3>
                  <span>
                    {releaseYear(album)} · {album.genre} · {album.trackCount} 首
                  </span>
                  <p>{album.description}</p>
                </div>
                <ArrowUpRight size={18} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </PageFrame>
  );
}

function playingLabel(isPlaying: boolean, genre?: string) {
  if (isPlaying) return genre ? `${genre} / Playing` : "Now playing";
  return "Listening archive";
}
