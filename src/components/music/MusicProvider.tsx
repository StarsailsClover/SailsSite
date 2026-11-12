import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listMusicTracks, type MusicPlaylistTrack } from "@/lib/api";

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

type MusicContextValue = {
  tracks: RawTrack[];
  currentTrack: RawTrack | null;
  currentIndex: number;
  queueLabel: string;
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
  playQueue: (items: RawTrack[], startIndex?: number, label?: string) => void;
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
  const [tracks, setTracks] = useState<RawTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [queueLabel, setQueueLabel] = useState("音乐空间");
  const [fullPlayerOpen, setFullPlayerOpen] = useState(false);
  const defaultQueueRef = useRef<RawTrack[]>([]);

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

  const next = useCallback(() => {
    setCurrentIndex((index) => (tracks.length ? (index + 1) % tracks.length : 0));
  }, [tracks.length]);

  const previous = useCallback(() => {
    setCurrentIndex((index) => (tracks.length ? (index - 1 + tracks.length) % tracks.length : 0));
  }, [tracks.length]);

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
    const index = tracks.findIndex((track) => track.id === id);
    if (index < 0) return;
    if (index === currentIndex && audioRef.current) {
      if (typeof startAt === "number" && Number.isFinite(startAt)) {
        audioRef.current.currentTime = Math.max(0, startAt);
        setProgress(Math.max(0, startAt));
      }
      pendingSeekRef.current = null;
      setIsPlaying(true);
      return;
    }
    pendingSeekRef.current =
      typeof startAt === "number" && Number.isFinite(startAt)
        ? { id, time: Math.max(0, startAt) }
        : null;
    setCurrentIndex(index);
    setIsPlaying(true);
  }, [currentIndex, tracks]);

  const seek = useCallback((value: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value;
    setProgress(value);
  }, []);

  const playQueue = useCallback(
    (items: RawTrack[], startIndex = 0, label?: string) => {
      const queue = items.filter((item) => Boolean(item.filePath));
      if (queue.length === 0) return;
      const safeIndex = Math.min(Math.max(0, startIndex), queue.length - 1);
      pendingSeekRef.current = null;
      setTracks(queue);
      setCurrentIndex(safeIndex);
      setIsPlaying(true);
      if (label) setQueueLabel(label);
    },
    [],
  );

  const openFullPlayer = useCallback(() => setFullPlayerOpen(true), []);
  const closeFullPlayer = useCallback(() => setFullPlayerOpen(false), []);

  const value = useMemo(() => ({
    tracks,
    currentTrack,
    currentIndex,
    queueLabel,
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
    openFullPlayer,
    closeFullPlayer,
  }), [tracks, currentTrack, currentIndex, queueLabel, isPlaying, progress, duration, error, fullPlayerOpen, playPause, next, previous, selectTrack, selectTrackById, seek, playQueue, openFullPlayer, closeFullPlayer]);

  return (
    <MusicContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
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
        onEnded={next}
        onError={() => {
          // load() 中断旧曲目的 MEDIA_ERR_ABORTED 是切歌的正常竞态，不是播放失败
          const mediaError = audioRef.current?.error;
          if (mediaError && mediaError.code === MediaError.MEDIA_ERR_ABORTED) return;
          switchingTrackRef.current = false;
          setIsPlaying(false);
          if (currentTrack) setError(`无法播放 ${currentTrack.title}，可能文件不存在或外链受限。`);
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
