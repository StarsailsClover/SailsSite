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
  kind: "image" | "video";
  bytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  url: string;
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
  return new Promise<{ media: MediaItem; markdown: string }>((resolve, reject) => {
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
        resolve(payload as { media: MediaItem; markdown: string });
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
  input: Partial<CollectionInput> & { expectedVersion: number },
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
