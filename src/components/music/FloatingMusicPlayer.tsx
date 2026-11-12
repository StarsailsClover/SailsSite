import { Disc3, Maximize2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { getAssetUrl, useMusic } from "@/components/music/MusicProvider";

export default function FloatingMusicPlayer() {
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    error,
    playPause,
    next,
    previous,
    seek,
    openFullPlayer,
  } = useMusic();
  const percent = duration ? (progress / duration) * 100 : 0;

  return (
    <aside className={`floating-player ${isPlaying ? "is-playing" : ""}`} aria-label="全站音乐播放器">
      <button
        type="button"
        className="player-cover"
        onClick={openFullPlayer}
        aria-label="打开大歌词与封面"
        title="大歌词 / 大封面"
      >
        {currentTrack ? <img src={getAssetUrl(currentTrack.coverPath)} alt={currentTrack.album} /> : <Disc3 size={24} />}
      </button>
      <div className="player-meta">
        <button type="button" className="player-title" onClick={openFullPlayer}>
          {currentTrack?.title ?? "静默水面"}
        </button>
        <small>{error ?? currentTrack?.artist ?? "等待播放列表"}</small>
        <input
          aria-label="播放进度"
          type="range"
          min={0}
          max={duration || 1}
          value={progress}
          onChange={(event) => seek(Number(event.target.value))}
          style={{ backgroundSize: `${percent}% 3px` }}
        />
      </div>
      <div className="player-actions">
        <button type="button" onClick={previous} aria-label="上一首"><SkipBack size={15} /></button>
        <button type="button" onClick={playPause} aria-label={isPlaying ? "暂停" : "播放"}>{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
        <button type="button" onClick={next} aria-label="下一首"><SkipForward size={15} /></button>
        <button type="button" onClick={openFullPlayer} aria-label="大歌词与封面" title="大歌词 / 大封面"><Maximize2 size={15} /></button>
      </div>
      <div className="player-wave" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
    </aside>
  );
}
