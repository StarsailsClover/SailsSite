const API_VERSION = "1";

export type PostSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverUrl: string;
  tags: string[];
  status: "draft" | "published" | "scheduled" | "archived";
  featured: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  readingMinutes: number;
};

export type Post = PostSummary & {
  bodyMarkdown: string;
  bodyHtml: string;
};

export type AdminSession = {
  user: { username: string };
  csrfToken: string;
  expiresAt: string;
};

export type GitHubRepo = {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
};

export type CollectionSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverUrl: string;
  status: "draft" | "published";
  sortOrder: "newest" | "oldest";
  createdAt: string;
  updatedAt: string;
  version: number;
  postCount: number;
};

export type CollectionDetail = {
  collection: CollectionSummary;
  posts: PostSummary[];
};

export type TagSummary = {
  name: string;
  count: number;
};

export type TagDetail = {
  tag: string;
  count: number;
  description: string;
  posts: PostSummary[];
};

export type MediaItem = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  kind: "image" | "video" | "audio";
  bytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  url: string;
};

export type MusicAlbum = {
  id: string;
  slug: string;
  title: string;
  artistName: string;
  artistBio: string;
  description: string;
  coverUrl: string;
  genre: string;
  releaseDate: string | null;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  version: number;
  trackCount: number;
};

export type MusicTrack = {
  id: string;
  albumId: string;
  albumSlug: string;
  albumTitle: string;
  title: string;
  artistName: string;
  coverUrl: string;
  genre: string;
  audioUrl: string;
  durationSeconds: number;
  trackNumber: number;
  lyricsLrc: string;
  translationLrc: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type MusicAlbumDetail = {
  album: MusicAlbum & { tracks: MusicTrack[] };
};

export type MusicAlbumInput = {
  title: string;
  slug: string;
  artistName: string;
  artistBio: string;
  description: string;
  coverUrl: string;
  genre: string;
  releaseDate: string;
  status: "draft" | "published";
};

export type MusicTrackInput = {
  title: string;
  artistName: string;
  coverUrl: string;
  genre: string;
  audioUrl: string;
  durationSeconds: number;
  trackNumber: number;
  lyricsLrc: string;
  translationLrc: string;
  status: "draft" | "published";
};

export type MusicPlaylist = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverUrl: string;
  sortOrder: number;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  version: number;
  trackCount: number;
};

export type MusicPlaylistTrackSource = "local" | "netease" | "external";

export type MusicPlaylistTrack = {
  id: string;
  playlistId: string;
  position: number;
  title: string;
  artistName: string;
  albumTitle: string;
  coverUrl: string;
  audioUrl: string;
  source: MusicPlaylistTrackSource;
  externalId: string;
  genre: string;
  durationSeconds: number;
  lyricsLrc: string;
  translationLrc: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type MusicPlaylistDetail = {
  playlist: MusicPlaylist & { tracks: MusicPlaylistTrack[] };
};

export type MusicPlaylistInput = {
  title: string;
  slug: string;
  description: string;
  coverUrl: string;
  sortOrder: number;
  status: "draft" | "published";
};

export type MusicPlaylistTrackInput = {
  title: string;
  artistName: string;
  albumTitle: string;
  coverUrl: string;
  audioUrl: string;
  source: MusicPlaylistTrackSource;
  externalId: string;
  genre: string;
  durationSeconds: number;
  lyricsLrc: string;
  translationLrc: string;
};

export type MusicIntegrations = {
  neteaseApiBase: string;
};

export type NeteaseSongSummary = {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  durationSeconds: number;
};

export type NeteaseSongDraft = NeteaseSongSummary & {
  audioUrl: string;
  lyricsLrc: string;
  translationLrc: string;
  genre: string;
};

export type GitHubOverview = {
  profile: {
    login: string;
    name: string;
    avatarUrl: string;
    bio: string;
    htmlUrl: string;
    followers: number;
    following: number;
    publicRepos: number;
  } | null;
  repos: Array<GitHubRepo & { forks_count: number; pushed_at: string }>;
  events: Array<{
    id: string;
    type: string;
    repo: string;
    action: string;
    ref: string;
    refType: string;
    createdAt: string;
  }>;
  contributions: {
    days: Array<{ date: string; count: number; level: number }>;
    total: number;
    currentStreak: number;
    longestStreak: number;
  };
  fetchedAt: string;
  offline?: boolean;
};

export type XFeedItem = {
  id: string;
  text: string;
  createdAt: string;
  url: string;
  likes: number;
  replies: number;
  reposts: number;
  views: number;
  media: Array<{ type: "image" | "video"; url: string; thumbnailUrl: string }>;
};

export type XFeed = {
  profile: {
    screenName: string;
    name: string;
    avatarUrl: string;
    description: string;
    followers: number;
    tweets: number;
    url: string;
  } | null;
  items: XFeedItem[];
  fetchedAt: string;
  offline?: boolean;
};

export type PostInput = {
  title: string;
  slug: string;
  description: string;
  bodyMarkdown: string;
  coverUrl: string;
  tags: string[];
  status: "draft" | "published" | "scheduled" | "archived";
  publishedAt: string | null;
};

export type Revision = {
  id: number;
  version: number;
  createdAt: string;
  createdBy: string;
};

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  csrfToken?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("X-Sails-API-Version", API_VERSION);
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  if (
    options.body &&
    typeof options.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers,
  });

  if (response.status === 204) return null as T;
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object"
        ? (payload as { error?: string; message?: string; details?: unknown })
        : {};
    throw new ApiError(
      response.status,
      errorPayload.error || "request_failed",
      errorPayload.message || `请求失败 (${response.status})`,
      errorPayload.details,
    );
  }
  return payload as T;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export async function listPosts(params: {
  limit?: number;
  offset?: number;
  tag?: string;
  q?: string;
} = {}) {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  if (params.tag) search.set("tag", params.tag);
  if (params.q) search.set("q", params.q);
  return request<{ posts: PostSummary[]; total: number; limit: number; offset: number }>(
    `/api/v1/posts?${search}`,
  );
}

export async function getPost(slug: string) {
  const data = await request<{ post: Post }>(
    `/api/v1/posts/${encodeURIComponent(slug)}`,
  );
  return data.post;
}

export async function getWeather() {
  return request<{
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      weather_code?: number;
      cloud_cover?: number;
      wind_speed_10m?: number;
      wind_direction_10m?: number;
      is_day?: number;
    };
  }>("/api/v1/weather");
}

export async function getGitHubRepos() {
  const data = await request<{ repos: GitHubRepo[] }>("/api/v1/github/repos");
  return data.repos;
}

export async function getGitHubOverview() {
  return request<GitHubOverview>("/api/v1/github/overview");
}

export async function getXFeed() {
  return request<XFeed>("/api/v1/x-feed");
}

export function proxyXMedia(url: string) {
  return url.startsWith("http")
    ? `/x-media?url=${encodeURIComponent(url)}`
    : url;
}

export async function listTags() {
  const data = await request<{ tags: TagSummary[] }>("/api/v1/tags");
  return data.tags;
}

export async function getTagDetail(tag: string) {
  return request<TagDetail>(`/api/v1/tags/${encodeURIComponent(tag)}`);
}

export async function listCollections() {
  const data = await request<{ collections: CollectionSummary[] }>(
    "/api/v1/collections",
  );
  return data.collections;
}

export async function getCollection(slug: string) {
  return request<CollectionDetail>(
    `/api/v1/collections/${encodeURIComponent(slug)}`,
  );
}

export async function listMusicAlbums() {
  const data = await request<{ albums: MusicAlbum[] }>(
    "/api/v1/music/albums",
  );
  return data.albums;
}

export async function getMusicAlbum(slug: string) {
  return request<MusicAlbumDetail>(
    `/api/v1/music/albums/${encodeURIComponent(slug)}`,
  );
}

export async function listMusicTracks() {
  const data = await request<{ tracks: MusicTrack[] }>(
    "/api/v1/music/tracks",
  );
  return data.tracks;
}

export async function listMusicPlaylists() {
  const data = await request<{ playlists: MusicPlaylist[] }>(
    "/api/v1/music/playlists",
  );
  return data.playlists;
}

export async function getMusicPlaylist(slug: string) {
  return request<MusicPlaylistDetail>(
    `/api/v1/music/playlists/${encodeURIComponent(slug)}`,
  );
}

export async function login(username: string, password: string) {
  return request<AdminSession>("/api/v1/admin/login", {
    method: "POST",
    body: jsonBody({ username, password }),
  });
}

export async function getAdminSession() {
  const data = await request<
    | { authenticated: false }
    | ({ authenticated: true } & AdminSession)
  >("/api/v1/admin/session");
  return data.authenticated ? data : null;
}

export async function logout(csrfToken: string) {
  await request<null>(
    "/api/v1/admin/logout",
    { method: "POST", body: "{}" },
    csrfToken,
  );
}

export async function listAdminPosts(
  csrfToken: string,
  params: { status?: string; q?: string; limit?: number } = {},
) {
  const search = new URLSearchParams();
  search.set("status", params.status || "all");
  search.set("limit", String(params.limit || 100));
  if (params.q) search.set("q", params.q);
  const data = await request<{ posts: PostSummary[] }>(
    `/api/v1/admin/posts?${search}`,
    {},
    csrfToken,
  );
  return data.posts;
}

export async function getAdminPost(id: string, csrfToken: string) {
  const data = await request<{ post: Post }>(
    `/api/v1/admin/posts/${encodeURIComponent(id)}`,
    {},
    csrfToken,
  );
  return data.post;
}

export async function createAdminPost(csrfToken: string, input: Partial<PostInput>) {
  const data = await request<{ post: Post }>(
    "/api/v1/admin/posts",
    { method: "POST", body: jsonBody(input) },
    csrfToken,
  );
  return data.post;
}

export async function updateAdminPost(
  csrfToken: string,
  id: string,
  input: Partial<PostInput> & { expectedVersion: number },
) {
  const data = await request<{ post: Post }>(
    `/api/v1/admin/posts/${encodeURIComponent(id)}`,
    { method: "PATCH", body: jsonBody(input) },
    csrfToken,
  );
  return data.post;
}

export async function setAdminPostStatus(
  csrfToken: string,
  id: string,
  action: "publish" | "unpublish",
  expectedVersion: number,
  publishedAt?: string,
) {
  const data = await request<{ post: Post }>(
    `/api/v1/admin/posts/${encodeURIComponent(id)}/${action}`,
    {
      method: "POST",
      body: jsonBody({
        expectedVersion,
        ...(publishedAt ? { publishedAt } : {}),
      }),
    },
    csrfToken,
  );
  return data.post;
}

export async function deleteAdminPost(
  csrfToken: string,
  id: string,
  expectedVersion: number,
) {
  await request<null>(
    `/api/v1/admin/posts/${encodeURIComponent(id)}`,
    { method: "DELETE", body: jsonBody({ expectedVersion }) },
    csrfToken,
  );
}

export async function duplicateAdminPost(csrfToken: string, id: string) {
  const data = await request<{ post: Post }>(
    `/api/v1/admin/posts/${encodeURIComponent(id)}/duplicate`,
    { method: "POST", body: "{}" },
    csrfToken,
  );
  return data.post;
}

export async function uploadCover(csrfToken: string, file: File) {
  return request<{ url: string; width: number; height: number; bytes: number }>(
    "/api/v1/admin/uploads",
    {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    },
    csrfToken,
  );
}

export async function uploadMedia(
  csrfToken: string,
  file: File,
  onProgress?: (percent: number) => void,
) {
  return new Promise<{
    media: MediaItem;
    markdown: string;
    durationSeconds?: number;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/admin/media");
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Sails-API-Version", API_VERSION);
    xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "network_error", "上传连接中断"));
    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText || "null");
      } catch {
        payload = xhr.responseText;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(
          payload as {
            media: MediaItem;
            markdown: string;
            durationSeconds?: number;
          },
        );
        return;
      }
      const error =
        payload && typeof payload === "object"
          ? (payload as { error?: string; message?: string })
          : {};
      reject(
        new ApiError(
          xhr.status,
          error.error || "upload_failed",
          error.message || `上传失败 (${xhr.status})`,
        ),
      );
    };
    xhr.send(file);
  });
}

export async function listMedia(csrfToken: string) {
  const data = await request<{ media: MediaItem[] }>(
    "/api/v1/admin/media",
    {},
    csrfToken,
  );
  return data.media;
}

export async function deleteMedia(csrfToken: string, id: string) {
  await request<null>(
    `/api/v1/admin/media/${encodeURIComponent(id)}`,
    { method: "DELETE", body: "{}" },
    csrfToken,
  );
}

export async function listAdminMusicAlbums(csrfToken: string) {
  const data = await request<{ albums: MusicAlbum[] }>(
    "/api/v1/admin/music/albums",
    {},
    csrfToken,
  );
  return data.albums;
}

export async function getAdminMusicAlbum(csrfToken: string, id: string) {
  return request<MusicAlbumDetail>(
    `/api/v1/admin/music/albums/${encodeURIComponent(id)}`,
    {},
    csrfToken,
  );
}

export async function createAdminMusicAlbum(
  csrfToken: string,
  input: Partial<MusicAlbumInput>,
) {
  const data = await request<{ album: MusicAlbum & { tracks: MusicTrack[] } }>(
    "/api/v1/admin/music/albums",
    { method: "POST", body: jsonBody(input) },
    csrfToken,
  );
  return data.album;
}

export async function updateAdminMusicAlbum(
  csrfToken: string,
  id: string,
  input: Partial<MusicAlbumInput> & { expectedVersion: number },
) {
  const data = await request<{ album: MusicAlbum & { tracks: MusicTrack[] } }>(
    `/api/v1/admin/music/albums/${encodeURIComponent(id)}`,
    { method: "PATCH", body: jsonBody(input) },
    csrfToken,
  );
  return data.album;
}

export async function deleteAdminMusicAlbum(
  csrfToken: string,
  id: string,
  expectedVersion: number,
) {
  await request<null>(
    `/api/v1/admin/music/albums/${encodeURIComponent(id)}`,
    { method: "DELETE", body: jsonBody({ expectedVersion }) },
    csrfToken,
  );
}

export async function createAdminMusicTrack(
  csrfToken: string,
  albumId: string,
  input: Partial<MusicTrackInput>,
) {
  const data = await request<{ album: MusicAlbum & { tracks: MusicTrack[] } }>(
    `/api/v1/admin/music/albums/${encodeURIComponent(albumId)}/tracks`,
    { method: "POST", body: jsonBody(input) },
    csrfToken,
  );
  return data.album;
}

export async function updateAdminMusicTrack(
  csrfToken: string,
  id: string,
  input: Partial<MusicTrackInput> & { expectedVersion: number },
) {
  const data = await request<{ album: MusicAlbum & { tracks: MusicTrack[] } }>(
    `/api/v1/admin/music/tracks/${encodeURIComponent(id)}`,
    { method: "PATCH", body: jsonBody(input) },
    csrfToken,
  );
  return data.album;
}

export async function deleteAdminMusicTrack(
  csrfToken: string,
  id: string,
  expectedVersion: number,
) {
  const data = await request<{ album: MusicAlbum & { tracks: MusicTrack[] } }>(
    `/api/v1/admin/music/tracks/${encodeURIComponent(id)}`,
    { method: "DELETE", body: jsonBody({ expectedVersion }) },
    csrfToken,
  );
  return data.album;
}

export async function listAdminMusicPlaylists(csrfToken: string) {
  const data = await request<{ playlists: MusicPlaylist[] }>(
    "/api/v1/admin/music/playlists",
    {},
    csrfToken,
  );
  return data.playlists;
}

export async function getAdminMusicPlaylist(csrfToken: string, id: string) {
  return request<MusicPlaylistDetail>(
    `/api/v1/admin/music/playlists/${encodeURIComponent(id)}`,
    {},
    csrfToken,
  );
}

export async function createAdminMusicPlaylist(
  csrfToken: string,
  input: Partial<MusicPlaylistInput>,
) {
  const data = await request<MusicPlaylistDetail>(
    "/api/v1/admin/music/playlists",
    { method: "POST", body: jsonBody(input) },
    csrfToken,
  );
  return data.playlist;
}

export async function updateAdminMusicPlaylist(
  csrfToken: string,
  id: string,
  input: Partial<MusicPlaylistInput> & { expectedVersion: number },
) {
  const data = await request<MusicPlaylistDetail>(
    `/api/v1/admin/music/playlists/${encodeURIComponent(id)}`,
    { method: "PATCH", body: jsonBody(input) },
    csrfToken,
  );
  return data.playlist;
}

export async function deleteAdminMusicPlaylist(
  csrfToken: string,
  id: string,
  expectedVersion: number,
) {
  await request<null>(
    `/api/v1/admin/music/playlists/${encodeURIComponent(id)}`,
    { method: "DELETE", body: jsonBody({ expectedVersion }) },
    csrfToken,
  );
}

export async function createAdminMusicPlaylistTrack(
  csrfToken: string,
  playlistId: string,
  input: Partial<MusicPlaylistTrackInput>,
) {
  const data = await request<MusicPlaylistDetail>(
    `/api/v1/admin/music/playlists/${encodeURIComponent(playlistId)}/tracks`,
    { method: "POST", body: jsonBody(input) },
    csrfToken,
  );
  return data.playlist;
}

export async function updateAdminMusicPlaylistTrack(
  csrfToken: string,
  id: string,
  input: Partial<MusicPlaylistTrackInput> & { expectedVersion: number },
) {
  const data = await request<MusicPlaylistDetail>(
    `/api/v1/admin/music/playlist-tracks/${encodeURIComponent(id)}`,
    { method: "PATCH", body: jsonBody(input) },
    csrfToken,
  );
  return data.playlist;
}

export async function deleteAdminMusicPlaylistTrack(
  csrfToken: string,
  id: string,
  expectedVersion: number,
) {
  await request<null>(
    `/api/v1/admin/music/playlist-tracks/${encodeURIComponent(id)}`,
    { method: "DELETE", body: jsonBody({ expectedVersion }) },
    csrfToken,
  );
}

export async function reorderAdminMusicPlaylistTracks(
  csrfToken: string,
  playlistId: string,
  trackIds: string[],
) {
  const data = await request<MusicPlaylistDetail>(
    `/api/v1/admin/music/playlists/${encodeURIComponent(playlistId)}/order`,
    { method: "POST", body: jsonBody({ trackIds }) },
    csrfToken,
  );
  return data.playlist;
}

export async function getAdminMusicIntegrations(csrfToken: string) {
  const data = await request<{ integrations: MusicIntegrations }>(
    "/api/v1/admin/music/integrations",
    {},
    csrfToken,
  );
  return data.integrations;
}

export async function updateAdminMusicIntegrations(
  csrfToken: string,
  input: MusicIntegrations,
) {
  const data = await request<{ integrations: MusicIntegrations }>(
    "/api/v1/admin/music/integrations",
    { method: "PATCH", body: jsonBody(input) },
    csrfToken,
  );
  return data.integrations;
}

export async function searchNeteaseSongs(csrfToken: string, query: string) {
  const data = await request<{ results: NeteaseSongSummary[] }>(
    `/api/v1/admin/music/netease/search?q=${encodeURIComponent(query)}`,
    {},
    csrfToken,
  );
  return data.results;
}

export async function getNeteaseSong(csrfToken: string, id: string) {
  const data = await request<{ song: NeteaseSongDraft }>(
    `/api/v1/admin/music/netease/song/${encodeURIComponent(id)}`,
    {},
    csrfToken,
  );
  return data.song;
}

export async function getSiteTextSettings(csrfToken: string) {
  const data = await request<{ text: Record<string, unknown> }>(
    "/api/v1/admin/site-text",
    {},
    csrfToken,
  );
  return data.text;
}

export async function saveSiteTextSettings(
  csrfToken: string,
  text: Record<string, unknown>,
) {
  const data = await request<{ text: Record<string, unknown> }>(
    "/api/v1/admin/site-text",
    { method: "PUT", body: jsonBody({ text }) },
    csrfToken,
  );
  return data.text;
}

export async function listAdminCollections(csrfToken: string) {
  const data = await request<{ collections: CollectionSummary[] }>(
    "/api/v1/admin/collections",
    {},
    csrfToken,
  );
  return data.collections;
}

export async function getAdminCollection(csrfToken: string, id: string) {
  return request<CollectionDetail>(
    `/api/v1/admin/collections/${encodeURIComponent(id)}`,
    {},
    csrfToken,
  );
}

export type CollectionInput = {
  title: string;
  slug: string;
  description: string;
  coverUrl: string;
  status: "draft" | "published";
  sortOrder: "newest" | "oldest";
};

export async function createAdminCollection(
  csrfToken: string,
  input: Partial<CollectionInput>,
) {
  const data = await request<{ collection: CollectionSummary }>(
    "/api/v1/admin/collections",
    { method: "POST", body: jsonBody(input) },
    csrfToken,
  );
  return data.collection;
}

export async function updateAdminCollection(
  csrfToken: string,
  id: string,
  input: Partial<CollectionInput> & {
    expectedVersion: number;
    postIds?: string[];
  },
) {
  const data = await request<{ collection: CollectionSummary }>(
    `/api/v1/admin/collections/${encodeURIComponent(id)}`,
    { method: "PATCH", body: jsonBody(input) },
    csrfToken,
  );
  return data.collection;
}

export async function setCollectionPosts(
  csrfToken: string,
  id: string,
  postIds: string[],
  expectedVersion: number,
) {
  const data = await request<{ collection: CollectionSummary }>(
    `/api/v1/admin/collections/${encodeURIComponent(id)}/posts`,
    {
      method: "PUT",
      body: jsonBody({ postIds, expectedVersion }),
    },
    csrfToken,
  );
  return data.collection;
}

export async function deleteAdminCollection(
  csrfToken: string,
  id: string,
  expectedVersion: number,
) {
  await request<null>(
    `/api/v1/admin/collections/${encodeURIComponent(id)}`,
    { method: "DELETE", body: jsonBody({ expectedVersion }) },
    csrfToken,
  );
}

export async function listRevisions(csrfToken: string, id: string) {
  const data = await request<{ revisions: Revision[] }>(
    `/api/v1/admin/posts/${encodeURIComponent(id)}/revisions`,
    {},
    csrfToken,
  );
  return data.revisions;
}

export async function restoreRevision(
  csrfToken: string,
  id: string,
  revisionId: number,
  expectedVersion: number,
) {
  const data = await request<{ post: Post }>(
    `/api/v1/admin/posts/${encodeURIComponent(id)}/revisions/${revisionId}/restore`,
    { method: "POST", body: jsonBody({ expectedVersion }) },
    csrfToken,
  );
  return data.post;
}
