import { useEffect, useMemo, useRef, useState } from "react";
import {
  Disc3,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { LyricLine as AmllLyricLine } from "@applemusic-like-lyrics/lyric";
import { getAssetUrl, useMusic } from "@/components/music/MusicProvider";
import { mergeLyrics } from "@/lib/lyrics";

type PlayerHandle = {
  setLyricLines: (lines: AmllLyricLine[], initialTime?: number) => void;
  setCurrentTime: (time: number, isSeek?: boolean) => void;
  update: (delta?: number) => void;
  setEnableSpring: (enable?: boolean) => void;
  setEnableBlur: (enable: boolean) => void;
  setEnableScale: (enable?: boolean) => void;
  setWordFadeWidth: (value?: number) => void;
  setAlignAnchor: (anchor: "top" | "center" | "bottom") => void;
  setAlignPosition: (position: number) => void;
  setOverscanPx: (px: number) => void;
  rebuildLyricView: (initialTime?: number) => void;
  resume: () => void;
  pause: () => void;
  dispose: () => void;
  getElement: () => HTMLElement;
};

function formatClock(seconds: number) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width: 900px)").matches ||
    /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent)
  );
}

export default function AmllFullPlayer() {
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    queueLabel,
    hasCustomQueue,
    repeatMode,
    shuffle,
    fullPlayerOpen,
    closeFullPlayer,
    playPause,
    next,
    previous,
    seek,
    playDefaultQueue,
    setRepeatMode,
    toggleShuffle,
  } = useMusic();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const progressRef = useRef(progress);
  const progressStampRef = useRef(0);
  const playingRef = useRef(isPlaying);
  const [engineReady, setEngineReady] = useState(false);
  const [engineFailed, setEngineFailed] = useState(false);
  const coverPath = currentTrack?.coverPath ?? "";

  useEffect(() => {
    progressRef.current = progress;
    progressStampRef.current = performance.now();
  }, [progress]);

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  const lyricSource = useMemo(() => {
    const merged = mergeLyrics(
      currentTrack?.lyricsLrc ?? "",
      currentTrack?.translationLrc ?? "",
    );
    return {
      merged,
      timed: merged.some((line) => line.time !== null),
    };
  }, [currentTrack?.lyricsLrc, currentTrack?.translationLrc]);

  useEffect(() => {
    if (!fullPlayerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.fullPlayer = "open";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFullPlayer();
    };
    window.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.fullPlayer;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullPlayerOpen, closeFullPlayer]);

  useEffect(() => {
    const host = hostRef.current;
    if (!fullPlayerOpen || host === null) return;
    let cancelled = false;
    let player: PlayerHandle | null = null;
    let raf = 0;

    (async () => {
      try {
        const [core, lyric] = await Promise.all([
          import("@applemusic-like-lyrics/core"),
          import("@applemusic-like-lyrics/lyric"),
          import("@applemusic-like-lyrics/core/style.css"),
        ]);
        if (cancelled) return;

        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const mobile = isMobileViewport();
        const instance = new core.LyricPlayer() as unknown as PlayerHandle;
        instance.setEnableSpring(!reduced);
        instance.setEnableBlur(!mobile && !reduced);
        instance.setEnableScale(!reduced);
        instance.setWordFadeWidth(mobile ? 1 : 0.5);
        instance.setAlignAnchor("center");
        instance.setAlignPosition(0.5);
        instance.setOverscanPx(mobile ? 60 : 120);
        const element = instance.getElement();
        element.style.width = "100%";
        element.style.height = "100%";
        host.replaceChildren(element);

        const parsed = lyric.parseLrcLike(currentTrack?.lyricsLrc ?? "");
        const parsedTranslation = lyric.parseLrcLike(currentTrack?.translationLrc ?? "");
        const translationByTime = new Map<number, string>();
        for (const line of parsedTranslation.lines) {
          const text = line.words.map((word) => word.word).join("").trim();
          if (text) translationByTime.set(Math.round(line.startTime), text);
        }

        const amllLines: AmllLyricLine[] =
          parsed.lines.length > 0
            ? parsed.lines
                .map((line) => ({
                  ...line,
                  translatedLyric:
                    line.translatedLyric?.trim() ||
                    translationByTime.get(Math.round(line.startTime)) ||
                    "",
                }))
                .filter((line) =>
                  line.words.some((word) => word.word.trim().length > 0),
                )
            : mergeLyrics(
                currentTrack?.lyricsLrc ?? "",
                currentTrack?.translationLrc ?? "",
              ).flatMap((line) => {
                if (line.time === null || !line.text.trim()) return [];
                const startTime = line.time * 1000;
                return [
                  {
                    words: [
                      {
                        startTime,
                        endTime: startTime + 5000,
                        word: line.text.trim(),
                      },
                    ],
                    translatedLyric: line.translation,
                    romanLyric: "",
                    isBG: false,
                    isDuet: false,
                    startTime,
                    endTime: startTime + 5000,
                  } satisfies AmllLyricLine,
                ];
              });

        // 歌词行要等组件量到真实尺寸后再注入，否则 AMLL 不会建立歌词行节点。
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => resolve()),
          );
        });
        if (cancelled) return;

        instance.setLyricLines(amllLines, progressRef.current * 1000);
        instance.resume();
        player = instance;
        playerRef.current = instance;
        setEngineReady(true);
        setEngineFailed(false);

        let lastTick = performance.now();
        const tick = (now: number) => {
          if (cancelled) return;
          const delta = Math.min(64, now - lastTick);
          lastTick = now;
          const base = progressRef.current * 1000;
          const estimated = playingRef.current
            ? base + Math.min(1500, performance.now() - progressStampRef.current)
            : base;
          instance.setCurrentTime(estimated);
          instance.update(delta);
          raf = window.requestAnimationFrame(tick);
        };
        raf = window.requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          setEngineFailed(true);
          setEngineReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      playerRef.current?.dispose();
      playerRef.current = null;
      player?.dispose();
      player = null;
      host.replaceChildren();
      setEngineReady(false);
    };
    // The engine is rebuilt only when a track's lyric payload changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullPlayerOpen, currentTrack?.id]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) player.resume();
    else player.pause();
  }, [isPlaying]);

  if (!fullPlayerOpen) return null;

  const percent = duration ? Math.min(100, (progress / duration) * 100) : 0;
  const hasTimedLyrics = lyricSource.timed;

  return (
    <div className="amll-overlay" role="dialog" aria-modal="true" aria-label="大歌词与封面">
      <div
        className="amll-backdrop"
        aria-hidden="true"
        style={coverPath ? { backgroundImage: `url(${getAssetUrl(coverPath)})` } : undefined}
      />
      <div className="amll-panel">
        <header className="amll-topbar">
          <div className="amll-queue-group">
            <span className="amll-queue">{queueLabel}</span>
            {hasCustomQueue && (
              <button
                type="button"
                className="amll-queue-reset"
                onClick={() => playDefaultQueue(0)}
              >
                回到全站队列
              </button>
            )}
          </div>
          <button
            type="button"
            className="amll-close"
            onClick={closeFullPlayer}
            ref={closeRef}
            aria-label="关闭大歌词"
          >
            <X size={18} />
          </button>
        </header>

        <section className="amll-stage">
          <div className="amll-artwork">
            {coverPath ? (
              <img src={getAssetUrl(coverPath)} alt={currentTrack?.album ?? "封面"} />
            ) : (
              <Disc3 size={64} />
            )}
          </div>
          <div className="amll-meta">
            <p className="eyebrow">Now playing</p>
            <h2>{currentTrack?.title ?? "静默水面"}</h2>
            <p>
              {currentTrack ? `${currentTrack.artist} · ${currentTrack.album}` : "等待播放列表"}
            </p>
            {currentTrack?.playlistSlug ? (
              <Link to={`/music/playlist/${encodeURIComponent(currentTrack.playlistSlug)}`}>
                <ListMusic size={14} />
                打开歌单
              </Link>
            ) : currentTrack?.albumSlug ? (
              <Link to={`/music/${encodeURIComponent(currentTrack.albumSlug)}`}>
                <Disc3 size={14} />
                打开唱片页
              </Link>
            ) : null}
          </div>
        </section>

        <section className="amll-lyrics" aria-live="polite">
          {engineFailed && (
            <div className="amll-lyrics-fallback">
              {lyricSource.merged.length > 0 ? (
                lyricSource.merged.slice(0, 60).map((line, index) => (
                  <p key={`${line.time ?? "plain"}-${index}`}>
                    <strong>{line.text}</strong>
                    {line.translation && <small>{line.translation}</small>}
                  </p>
                ))
              ) : (
                <p>
                  <strong>这首曲目没有附上歌词。</strong>
                </p>
              )}
            </div>
          )}
          {!engineFailed && !hasTimedLyrics && lyricSource.merged.length > 0 && (
            <div className="amll-lyrics-plain">
              {lyricSource.merged.map((line, index) => (
                <p key={`${line.text}-${index}`}>
                  <strong>{line.text}</strong>
                  {line.translation && <small>{line.translation}</small>}
                </p>
              ))}
            </div>
          )}
          {!engineFailed && hasTimedLyrics && (
            <div className={`amll-lyric-host ${engineReady ? "is-ready" : ""}`} ref={hostRef} />
          )}
          {!engineFailed && lyricSource.merged.length === 0 && (
            <div className="amll-lyrics-empty">
              <p>这首曲目没有附上歌词，只剩旋律。</p>
            </div>
          )}
          {!engineFailed && hasTimedLyrics && !engineReady && (
            <p className="amll-lyrics-loading">正在装载逐词歌词引擎…</p>
          )}
        </section>

        <footer className="amll-controls">
          <div className="amll-progress">
            <span>{formatClock(progress)}</span>
            <input
              aria-label="播放进度"
              type="range"
              min={0}
              max={duration || 1}
              value={progress}
              onChange={(event) => seek(Number(event.target.value))}
              style={{ backgroundSize: `${percent}% 3px` }}
            />
            <span>{formatClock(duration)}</span>
          </div>
          <div className="amll-buttons">
            <button
              type="button"
              className={shuffle ? "is-active" : ""}
              onClick={toggleShuffle}
              aria-pressed={shuffle}
              aria-label="随机播放"
              title="随机播放"
            >
              <Shuffle size={17} />
            </button>
            <button type="button" onClick={previous} aria-label="上一首">
              <SkipBack size={18} />
            </button>
            <button
              type="button"
              className="amll-play"
              onClick={playPause}
              aria-label={isPlaying ? "暂停" : "播放"}
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <button type="button" onClick={next} aria-label="下一首">
              <SkipForward size={18} />
            </button>
            <button
              type="button"
              className={repeatMode !== "off" ? "is-active" : ""}
              onClick={() =>
                setRepeatMode(
                  repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off",
                )
              }
              aria-pressed={repeatMode !== "off"}
              aria-label={
                repeatMode === "one" ? "单曲循环" : repeatMode === "all" ? "列表循环" : "不循环"
              }
              title={
                repeatMode === "one" ? "单曲循环" : repeatMode === "all" ? "列表循环" : "不循环"
              }
            >
              {repeatMode === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
