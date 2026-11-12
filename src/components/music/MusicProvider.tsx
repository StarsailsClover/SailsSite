import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMusicAlbum, listMusicTracks, type MusicPlaylistTrack } from "@/lib/api";

export type RawTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  filePath: string;
  coverPath: string;
  genre?: string;
  releaseYear?: number;
  source?: "local" | "netease" | "backend" | "authored";
  musicId?: string;
  albumSlug?: string;
  playlistSlug?: string;
  lyricsLrc?: string;
  translationLrc?: string;
  durationSeconds?: number;
};

type Playlist = {
  playlistName: string;
  songs: RawTrack[];
};

type MusicConfig = {
  backendBaseUrl?: string;
  netease?: {
    enabled?: boolean;
    apiBase?: string;
    musicIds?: string[];
    // 无后端时的静态元数据：避免曲目显示为 "Netease #id"
    meta?: Record<string, { title?: string; artist?: string; album?: string; cover?: string }>;
  };
};

export type RepeatMode = "off" | "all" | "one";

type MusicContextValue = {
  tracks: RawTrack[];
  currentTrack: RawTrack | null;
  currentIndex: number;
  queueLabel: string;
  queueId: string;
  hasCustomQueue: boolean;
  repeatMode: RepeatMode;
  shuffle: boolean;
  isPlaying: boolean;
  progress: number;
  duration: number;
  error: string | null;
  fullPlayerOpen: boolean;
  playPause: () => void;
  next: () => void;
  previous: () => void;
  selectTrack: (index: number) => void;
  selectTrackById: (id: string, startAt?: number) => void;
  seek: (value: number) => void;
  playQueue: (
    items: RawTrack[],
    startIndex?: number,
    label?: string,
    queueId?: string,
    startAt?: number,
  ) => void;
  playDefaultQueue: (startIndex?: number) => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
};

const MusicContext = createContext<MusicContextValue | null>(null);

function assetUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `/${path.replace(/^\/+/, "")}`;
}

function neteaseUrl(id: string, apiBase = "https://music.163.com/song/media/outer/url") {
  return `${apiBase}?id=${encodeURIComponent(id)}.mp3`;
}

async function loadNeteaseTracks(config: MusicConfig) {
  const ids = config.netease?.musicIds ?? [];
  if (!config.netease?.enabled || ids.length === 0) return [];

  const backendBase = config.backendBaseUrl?.replace(/\/$/, "");
  const tracks = await Promise.all(ids.map(async (id): Promise<RawTrack> => {
    if (backendBase) {
      try {
        const response = await fetch(`${backendBase}/api/music/netease/${encodeURIComponent(id)}`);
        if (response.ok) {
          const data = await response.json();
          return {
            id: `netease-${id}`,
            musicId: id,
            title: data.title ?? `Netease #${id}`,
            artist: data.artist ?? "Netease Cloud Music",
            album: data.album ?? data.title ?? `Netease #${id}`,
            filePath: data.url ?? neteaseUrl(id, config.netease?.apiBase),
            coverPath: data.cover ?? "assets/musicbox/cover/Elegant.jpg",
            genre: "Netease",
            source: "backend",
          };
        }
      } catch {
        // 后端不可用时降级到网易云外链。
      }
    }

    return {
      id: `netease-${id}`,
      musicId: id,
      title: config.netease?.meta?.[String(id)]?.title ?? `Netease #${id}`,
      artist: config.netease?.meta?.[String(id)]?.artist ?? "Netease Cloud Music",
      album: config.netease?.meta?.[String(id)]?.album ?? config.netease?.meta?.[String(id)]?.title ?? `Netease #${id}`,
      filePath: neteaseUrl(id, config.netease?.apiBase),
      coverPath: config.netease?.meta?.[String(id)]?.cover ?? "assets/musicbox/cover/Elegant.jpg",
      genre: "Netease",
      source: "netease",
    };
  }));

  return tracks;
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeekRef = useRef<{ id: string; time: number } | null>(null);
  const switchingTrackRef = useRef(false);
  const errorSkipsRef = useRef(0);
  const [tracks, setTracks] = useState<RawTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [queueLabel, setQueueLabel] = useState("音乐空间");
  const [queueId, setQueueId] = useState("default");
  const [fullPlayerOpen, setFullPlayerOpen] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffle, setShuffle] = useState(false);
  const currentTrackIdRef = useRef<string | null>(null);
  const defaultQueueRef = useRef<RawTrack[]>([]);
  const defaultQueueLabelRef = useRef("音乐空间");
  const lyricCacheRef = useRef(new Map<string, { lyricsLrc: string; translationLrc: string }>());

  useEffect(() => {
    Promise.all([
      fetch("/assets/musicbox/cover/playlist.json").then((response) => response.json()).catch(() => ({ songs: [] } as Playlist)),
      fetch("/config/music.json").then((response) => response.json()).catch(() => ({} as MusicConfig)),
      listMusicTracks().catch(() => []),
    ])
      .then(async ([playlist, config, authoredTracks]: [
        Playlist,
        MusicConfig,
        Awaited<ReturnType<typeof listMusicTracks>>,
      ]) => {
        const authored = authoredTracks.map((track): RawTrack => ({
          id: track.id,
          title: track.title,
          artist: track.artistName,
          album: track.albumTitle,
          albumSlug: track.albumSlug,
          filePath: track.audioUrl,
          coverPath: track.coverUrl || "assets/musicbox/cover/Elegant.jpg",
          genre: track.genre,
          source: "authored",
          lyricsLrc: track.lyricsLrc,
          translationLrc: track.translationLrc,
          durationSeconds: track.durationSeconds,
          releaseYear: Number(track.createdAt.slice(0, 4)),
        }));
        const localSongs = (playlist.songs ?? [])
          .filter((track) => track.artist.toLowerCase() !== "zc")
          .map((track) => ({ ...track, source: "local" as const }));
        const neteaseTracks = await loadNeteaseTracks(config);
        const nextTracks = [...authored, ...localSongs, ...neteaseTracks];
        defaultQueueRef.current = nextTracks;
        defaultQueueLabelRef.current = authored.length > 0 ? "创作专辑" : "音乐盒精选";
        setTracks(nextTracks);
        const elegantIndex = nextTracks.findIndex((track) => track.title.toLowerCase() === "elegant");
        setQueueLabel(authored.length > 0 ? "创作专辑" : "音乐盒精选");
        setCurrentIndex(authored.length > 0 ? 0 : elegantIndex >= 0 ? elegantIndex : 0);
      })
      .catch(() => setError("播放列表暂时无法抵达，音乐空间仍保持静默。"));
  }, []);

  const currentTrack = tracks[currentIndex] ?? null;
  const currentTrackId = currentTrack?.id;
  const currentTrackPath = currentTrack?.filePath;
  const currentTrackTitle = currentTrack?.title;
  currentTrackIdRef.current = currentTrackId ?? null;

  useEffect(() => {
    if (!audioRef.current || !currentTrackId || !currentTrackPath) return;
    switchingTrackRef.current = true;
    audioRef.current.src = assetUrl(currentTrackPath);
    audioRef.current.load();
    setProgress(0);
    setDuration(0);
    setError(null);
  }, [currentTrackId, currentTrackPath]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrackId) return;
    if (!isPlaying) {
      audio.pause();
      return;
    }
    audio.play().catch((err: unknown) => {
      if ((err as DOMException | undefined)?.name === "AbortError") return;
      setIsPlaying(false);
      setError(`无法播放 ${currentTrackTitle ?? currentTrackId}，可能文件尚未迁入或外链受限。`);
    });
  }, [currentTrackId, currentTrackTitle, isPlaying]);

  const advance = useCallback(
    (direction: 1 | -1) => {
      setCurrentIndex((index) => {
        const length = tracks.length;
        if (length === 0) return 0;
        if (shuffle && direction === 1) {
          let candidate = index;
          while (candidate === index && length > 1) {
            candidate = Math.floor(Math.random() * length);
          }
          return candidate;
        }
        const target = index + direction;
        if (target >= 0 && target < length) return target;
        return repeatMode === "all" ? (target + length) % length : index;
      });
    },
    [repeatMode, shuffle, tracks.length],
  );

  const next = useCallback(() => advance(1), [advance]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setProgress(0);
      return;
    }
    advance(-1);
  }, [advance]);

  const playPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrackId) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
  }, [currentTrackId, isPlaying]);

  const selectTrack = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsPlaying(true);
  }, []);

  const selectTrackById = useCallback((id: string, startAt?: number) => {
    const seekTime =
      typeof startAt === "number" && Number.isFinite(startAt)
        ? Math.max(0, startAt)
        : null;
    const startPlayback = (index: number) => {
      if (index === currentIndex && audioRef.current) {
        if (seekTime !== null) {
          audioRef.current.currentTime = seekTime;
          setProgress(seekTime);
        }
        pendingSeekRef.current = null;
        setIsPlaying(true);
        return;
      }
      pendingSeekRef.current = seekTime !== null ? { id, time: seekTime } : null;
      setCurrentIndex(index);
      setIsPlaying(true);
    };

    const queueIndex = tracks.findIndex((track) => track.id === id);
    if (queueIndex >= 0) {
      startPlayback(queueIndex);
      return;
    }
    // 当前队列（例如歌单）里没有这首曲目时，回退到全站默认队列而不是静默失败。
    const defaultIndex = defaultQueueRef.current.findIndex((track) => track.id === id);
    if (defaultIndex < 0) return;
    pendingSeekRef.current = seekTime !== null ? { id, time: seekTime } : null;
    setTracks([...defaultQueueRef.current]);
    setQueueId("default");
    setQueueLabel(defaultQueueLabelRef.current);
    setCurrentIndex(defaultIndex);
    setIsPlaying(true);
  }, [currentIndex, tracks]);

  const seek = useCallback((value: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value;
    setProgress(value);
  }, []);

  const playQueue = useCallback(
    (
      items: RawTrack[],
      startIndex = 0,
      label?: string,
      id = "custom",
      startAt?: number,
    ) => {
      const queue = items.filter((item) => Boolean(item.filePath));
      if (queue.length === 0) return;
      const safeIndex = Math.min(Math.max(0, startIndex), queue.length - 1);
      const targetId = queue[safeIndex]?.id;
      const seekTime =
        typeof startAt === "number" && Number.isFinite(startAt)
          ? Math.max(0, startAt)
          : null;
      if (
        seekTime !== null &&
        targetId &&
        currentTrackIdRef.current === targetId &&
        audioRef.current
      ) {
        audioRef.current.currentTime = seekTime;
        setProgress(seekTime);
        pendingSeekRef.current = null;
      } else {
        pendingSeekRef.current =
          seekTime !== null && targetId ? { id: targetId, time: seekTime } : null;
      }
      setTracks(queue);
      setQueueId(id);
      setCurrentIndex(safeIndex);
      setIsPlaying(true);
      if (label) setQueueLabel(label);
    },
    [],
  );

  const playDefaultQueue = useCallback((startIndex = 0) => {
    const queue = defaultQueueRef.current;
    if (queue.length === 0) return;
    const safeIndex = Math.min(Math.max(0, startIndex), queue.length - 1);
    pendingSeekRef.current = null;
    setTracks([...queue]);
    setQueueId("default");
    setQueueLabel(defaultQueueLabelRef.current);
    setCurrentIndex(safeIndex);
    setIsPlaying(true);
  }, []);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off"));
  }, []);

  const toggleShuffle = useCallback(() => setShuffle((value) => !value), []);

  const openFullPlayer = useCallback(() => setFullPlayerOpen(true), []);
  const closeFullPlayer = useCallback(() => setFullPlayerOpen(false), []);

  // 创作专辑的公共列表接口为了体积不返回歌词，这里在选中曲目后补取一次歌词。
  useEffect(() => {
    const track = currentTrack;
    if (!track || track.lyricsLrc?.trim() || !track.albumSlug) return;
    const cached = lyricCacheRef.current.get(track.id);
    if (cached) {
      setTracks((previous) =>
        previous.map((item) => (item.id === track.id ? { ...item, ...cached } : item)),
      );
      return;
    }
    let active = true;
    getMusicAlbum(track.albumSlug)
      .then((detail) => {
        if (!active) return;
        const found = detail.album.tracks.find((item) => item.id === track.id);
        if (!found) return;
        const lyrics = {
          lyricsLrc: found.lyricsLrc,
          translationLrc: found.translationLrc,
        };
        lyricCacheRef.current.set(track.id, lyrics);
        setTracks((previous) =>
          previous.map((item) =>
            item.id === track.id
              ? {
                  ...item,
                  ...lyrics,
                  durationSeconds: item.durationSeconds || found.durationSeconds,
                }
              : item,
          ),
        );
      })
      .catch(() => {
        // 歌词补取失败不影响播放，播放器会退回“暂无歌词”状态。
      });
    return () => {
      active = false;
    };
    // 只在曲目标识或歌词载荷变化时补取，避免因为 currentTrack 整体引用变化反复请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, currentTrack?.albumSlug, currentTrack?.lyricsLrc]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !currentTrack) {
      return;
    }
    const media = navigator.mediaSession;
    media.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: currentTrack.coverPath
        ? [{ src: assetUrl(currentTrack.coverPath), sizes: "512x512", type: "image/jpeg" }]
        : [],
    });
    media.setActionHandler("play", () => setIsPlaying(true));
    media.setActionHandler("pause", () => setIsPlaying(false));
    media.setActionHandler("previoustrack", previous);
    media.setActionHandler("nexttrack", next);
    media.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seek(details.seekTime);
    });
  }, [currentTrack, next, previous, seek]);

  const value = useMemo(() => ({
    tracks,
    currentTrack,
    currentIndex,
    queueLabel,
    queueId,
    hasCustomQueue: queueId !== "default",
    repeatMode,
    shuffle,
    isPlaying,
    progress,
    duration,
    error,
    fullPlayerOpen,
    playPause,
    next,
    previous,
    selectTrack,
    selectTrackById,
    seek,
    playQueue,
    playDefaultQueue,
    setRepeatMode: cycleRepeatMode,
    toggleShuffle,
    openFullPlayer,
    closeFullPlayer,
  }), [tracks, currentTrack, currentIndex, queueLabel, queueId, repeatMode, shuffle, isPlaying, progress, duration, error, fullPlayerOpen, playPause, next, previous, selectTrack, selectTrackById, seek, playQueue, playDefaultQueue, cycleRepeatMode, toggleShuffle, openFullPlayer, closeFullPlayer]);

  return (
    <MusicContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          errorSkipsRef.current = 0;
          setDuration(audio.duration || 0);
          const pending = pendingSeekRef.current;
          if (pending && currentTrack?.id === pending.id) {
            audio.currentTime = pending.time;
            setProgress(pending.time);
            pendingSeekRef.current = null;
          }
          switchingTrackRef.current = false;
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          if (!switchingTrackRef.current) setIsPlaying(false);
        }}
        onEnded={() => {
          if (repeatMode === "one") {
            const audio = audioRef.current;
            if (!audio) return;
            audio.currentTime = 0;
            setProgress(0);
            void audio.play();
            return;
          }
          const isLast = currentIndex >= tracks.length - 1;
          if (repeatMode === "off" && !shuffle && isLast) {
            setIsPlaying(false);
            return;
          }
          next();
        }}
        onError={() => {
          // load() 中断旧曲目的 MEDIA_ERR_ABORTED 是切歌的正常竞态，不是播放失败
          const mediaError = audioRef.current?.error;
          if (mediaError && mediaError.code === MediaError.MEDIA_ERR_ABORTED) return;
          switchingTrackRef.current = false;
          setIsPlaying(false);
          if (currentTrack) setError(`无法播放 ${currentTrack.title}，可能文件不存在或外链受限。`);
          // 单曲失效时自动跳过，最多连续跳过 3 首，避免整条队列被一首先坏掉的音轨卡住。
          if (tracks.length > 1 && errorSkipsRef.current < 3) {
            errorSkipsRef.current += 1;
            window.setTimeout(() => {
              setIsPlaying(true);
              next();
            }, 400);
          }
        }}
      />
    </MusicContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMusic() {
  const context = useContext(MusicContext);
  if (!context) throw new Error("useMusic must be used inside MusicProvider");
  return context;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getAssetUrl(path: string) {
  return assetUrl(path);
}

// eslint-disable-next-line react-refresh/only-export-components
export function playlistTrackToQueueTrack(track: MusicPlaylistTrack): RawTrack {
  return {
    id: `playlist:${track.id}`,
    title: track.title,
    artist: track.artistName || "未知歌手",
    album: track.albumTitle || "精选歌单",
    filePath: track.audioUrl,
    coverPath: track.coverUrl || "assets/musicbox/cover/Elegant.jpg",
    genre: track.genre || "精选歌单",
    source:
      track.source === "netease"
        ? "netease"
        : track.source === "local"
          ? "local"
          : "backend",
    lyricsLrc: track.lyricsLrc,
    translationLrc: track.translationLrc,
    durationSeconds: track.durationSeconds,
  };
}
