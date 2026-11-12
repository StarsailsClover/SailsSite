import { createHash, createHmac } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import {
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { parseFile } from "music-metadata";
import sharp from "sharp";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  escapeXml,
} from "./content.js";
import { SiteDatabase } from "./db.js";
import { seedSiteText } from "./seed.js";
import {
  WindowRateLimiter,
  clearSessionCookie,
  constantTimeEqual,
  hashToken,
  parseCookies,
  randomToken,
  sessionCookie,
  verifyPassword,
} from "./security.js";

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeHost(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function getRequestHost(req) {
  return normalizeHost(req.headers.host || "");
}

function applyCommonHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
}

function sendJson(res, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    ...headers,
  });
  res.end(body);
}

function sendText(res, status, body, contentType, headers = {}) {
  const buffer = Buffer.from(body);
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": buffer.length,
    ...headers,
  });
  res.end(buffer);
}

function noBody(res, status, headers = {}) {
  res.writeHead(status, headers);
  res.end();
}

async function readBuffer(req, limit) {
  const announced = Number(req.headers["content-length"] || 0);
  if (announced > limit) {
    req.resume();
    throw new HttpError(413, "body_too_large", "请求内容过大");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      req.resume();
      throw new HttpError(413, "body_too_large", "请求内容过大");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, limit) {
  const buffer = await readBuffer(req, limit);
  if (!buffer.length) return {};
  try {
    const value = JSON.parse(buffer.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value;
  } catch {
    throw new HttpError(400, "invalid_json", "请求 JSON 格式错误");
  }
}

async function streamRequestToFile(req, destination, limit) {
  const announced = Number(req.headers["content-length"] || 0);
  if (announced > limit) {
    req.resume();
    throw new HttpError(413, "file_too_large", "文件过大");
  }
  const output = createWriteStream(destination, { mode: 0o600, flags: "wx" });
  let total = 0;
  try {
    for await (const chunk of req) {
      total += chunk.length;
      if (total > limit) {
        throw new HttpError(413, "file_too_large", "文件过大");
      }
      if (!output.write(chunk)) {
        await new Promise((resolve) => output.once("drain", resolve));
      }
    }
  } catch (error) {
    output.destroy();
    await unlink(destination).catch(() => undefined);
    throw error;
  }
  await new Promise((resolve, reject) => {
    output.once("error", reject);
    output.end(resolve);
  });
  return total;
}

async function sniffVideo(filepath, mimeType) {
  const handle = await open(filepath, "r");
  try {
    const buffer = Buffer.alloc(32);
    await handle.read(buffer, 0, buffer.length, 0);
    if (
      ["video/mp4", "video/quicktime"].includes(mimeType) &&
      buffer.subarray(4, 8).toString("ascii") === "ftyp"
    ) {
      return mimeType === "video/quicktime"
        ? { extension: "mov", mimeType: "video/quicktime" }
        : { extension: "mp4", mimeType: "video/mp4" };
    }
    if (
      mimeType === "video/webm" &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    ) {
      return { extension: "webm", mimeType: "video/webm" };
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

async function sniffAudio(filepath, mimeType) {
  const handle = await open(filepath, "r");
  try {
    const buffer = Buffer.alloc(32);
    await handle.read(buffer, 0, buffer.length, 0);
    if (
      ["audio/mpeg", "audio/mp3", "audio/aac", "audio/x-aac"].includes(mimeType) &&
      (buffer.subarray(0, 3).toString("ascii") === "ID3" ||
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0))
    ) {
      const detected = ["audio/aac", "audio/x-aac"].includes(mimeType)
        ? { extension: "aac", mimeType: "audio/aac" }
        : { extension: "mp3", mimeType: "audio/mpeg" };
      const metadata = await parseFile(filepath, { skipCovers: true });
      const durationSeconds = Math.round(metadata.format.duration || 0);
      if (durationSeconds <= 0) return null;
      return { ...detected, durationSeconds };
    }
    if (
      ["audio/mp4", "audio/x-m4a", "audio/m4a"].includes(mimeType) &&
      buffer.subarray(4, 8).toString("ascii") === "ftyp"
    ) {
      const metadata = await parseFile(filepath, { skipCovers: true });
      const durationSeconds = Math.round(metadata.format.duration || 0);
      if (durationSeconds <= 0) return null;
      return { extension: "m4a", mimeType: "audio/mp4", durationSeconds };
    }
    if (
      ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"].includes(mimeType) &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WAVE"
    ) {
      const metadata = await parseFile(filepath, { skipCovers: true });
      const durationSeconds = Math.round(metadata.format.duration || 0);
      if (durationSeconds <= 0) return null;
      return { extension: "wav", mimeType: "audio/wav", durationSeconds };
    }
    if (
      mimeType === "audio/ogg" &&
      buffer.subarray(0, 4).toString("ascii") === "OggS"
    ) {
      const metadata = await parseFile(filepath, { skipCovers: true });
      const durationSeconds = Math.round(metadata.format.duration || 0);
      if (durationSeconds <= 0) return null;
      return { extension: "ogg", mimeType: "audio/ogg", durationSeconds };
    }
    if (
      ["audio/flac", "audio/x-flac"].includes(mimeType) &&
      buffer.subarray(0, 4).toString("ascii") === "fLaC"
    ) {
      const metadata = await parseFile(filepath, { skipCovers: true });
      const durationSeconds = Math.round(metadata.format.duration || 0);
      if (durationSeconds <= 0) return null;
      return { extension: "flac", mimeType: "audio/flac", durationSeconds };
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

function mimeTypeForUpload(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".webp") return "image/webp";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".aac") return "audio/aac";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".ogg") return "audio/ogg";
  if (extension === ".flac") return "audio/flac";
  return "application/octet-stream";
}

const NETEASE_MEDIA_HOST_PATTERN =
  /(^|\.)(music\.126\.net|126\.net|music\.163\.com|163\.com)$/i;

function neteaseMediaProxyUrl(rawUrl) {
  const value = String(rawUrl ?? "").trim();
  if (!value) return "";
  return `/media-proxy?url=${encodeURIComponent(value.replace(/^http:\/\//i, "https://"))}`;
}

async function fetchNeteaseJson(apiBase, pathAndQuery) {
  let response;
  try {
    response = await fetch(`${apiBase}${pathAndQuery}`, {
      headers: {
        "User-Agent": "SailsSite/1 (music studio)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new HttpError(502, "netease_upstream_unreachable", "网易云接口无法连接");
  }
  if (!response.ok) {
    throw new HttpError(502, "netease_upstream_failed", "网易云接口返回异常");
  }
  try {
    return await response.json();
  } catch {
    throw new HttpError(502, "netease_upstream_invalid", "网易云接口返回内容无法解析");
  }
}

async function searchNetease(apiBase, keyword) {
  const query = String(keyword || "").trim();
  if (!query) throw new ValidationError("请输入搜索关键词");
  const data = await fetchNeteaseJson(
    apiBase,
    `/cloudsearch?keywords=${encodeURIComponent(query)}&limit=20&type=1`,
  );
  const songs = Array.isArray(data?.result?.songs) ? data.result.songs : [];
  return songs.map((song) => ({
    id: String(song.id),
    title: String(song.name || ""),
    artist: (Array.isArray(song.ar) ? song.ar : [])
      .map((artist) => artist?.name)
      .filter(Boolean)
      .join(" / "),
    album: String(song.al?.name || ""),
    coverUrl: neteaseMediaProxyUrl(song.al?.picUrl),
    durationSeconds: Math.round(Number(song.dt || 0) / 1000),
  }));
}

async function fetchNeteaseSong(apiBase, id) {
  const songId = String(id || "").trim();
  if (!/^\d{1,20}$/.test(songId)) throw new ValidationError("曲目 ID 无效");
  const [detail, urlData, lyric] = await Promise.all([
    fetchNeteaseJson(apiBase, `/song/detail?ids=${songId}`),
    fetchNeteaseJson(apiBase, `/song/url/v1?id=${songId}&level=exhigh`).catch(() =>
      fetchNeteaseJson(apiBase, `/song/url?id=${songId}`),
    ),
    fetchNeteaseJson(apiBase, `/lyric?id=${songId}`).catch(() => ({})),
  ]);
  const song = Array.isArray(detail?.songs) ? detail.songs[0] : null;
  if (!song) throw new NotFoundError("网易云曲目不存在");
  const playable = Array.isArray(urlData?.data) ? urlData.data[0] : null;
  return {
    id: songId,
    title: String(song.name || ""),
    artist: (Array.isArray(song.ar) ? song.ar : [])
      .map((artist) => artist?.name)
      .filter(Boolean)
      .join(" / "),
    album: String(song.al?.name || ""),
    coverUrl: neteaseMediaProxyUrl(song.al?.picUrl),
    audioUrl: neteaseMediaProxyUrl(playable?.url),
    durationSeconds: Math.round(Number(song.dt || 0) / 1000),
    lyricsLrc: String(lyric?.lrc?.lyric || ""),
    translationLrc: String(lyric?.tlyric?.lyric || ""),
    genre: "网易云音乐",
  };
}

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || ""));
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null && end !== null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else {
    start = start ?? 0;
    end = end ?? size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    return null;
  }
  return { start, end: Math.min(size - 1, end) };
}

function parseContributions(html, fallbackDays = 365) {
  const dayTags = [...String(html).matchAll(/<td\b[^>]*>/g)].map((match) => match[0]);
  const tooltips = new Map(
    [...String(html).matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g)].map(
      (match) => [match[1], match[2].replace(/<[^>]+>/g, "").trim()],
    ),
  );
  const days = [];
  for (const tag of dayTags) {
    const date = /\bdata-date="([^"]+)"/.exec(tag)?.[1];
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    const level = Number(/\bdata-level="([^"]+)"/.exec(tag)?.[1] ?? 0);
    if (!date || !id) continue;
    const label = tooltips.get(id) || "";
    const countMatch = /([\d,]+)\s+contributions?/i.exec(label);
    const count = countMatch
      ? Number(countMatch[1].replaceAll(",", ""))
      : /no contributions/i.test(label)
        ? 0
        : Math.max(0, level);
    days.push({ date, count, level });
  }
  const sorted = days
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-fallbackDays);
  let longestStreak = 0;
  let running = 0;
  for (const day of sorted) {
    running = day.count > 0 ? running + 1 : 0;
    longestStreak = Math.max(longestStreak, running);
  }
  let currentStreak = 0;
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (sorted[index].count <= 0) break;
    currentStreak += 1;
  }
  return {
    days: sorted,
    total: sorted.reduce((sum, day) => sum + day.count, 0),
    currentStreak,
    longestStreak,
  };
}

function normalizeXStatuses(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results
    .map((entry) => entry?.status || entry)
    .filter((status) => status && status.id)
    .map((status) => ({
      id: String(status.id),
      text: String(status.text || ""),
      createdAt: status.created_at
        ? new Date(status.created_at).toISOString()
        : new Date().toISOString(),
      url:
        status.url ||
        `https://x.com/${status.author?.screen_name || "sailshuang_"}/status/${status.id}`,
      likes: Number(status.likes || status.favorite_count || 0),
      replies: Number(status.replies || status.reply_count || 0),
      reposts: Number(status.reposts || status.retweet_count || 0),
      views: Number(status.views || 0),
      media:
        status.media?.all?.map?.((item) => ({
          type: item.type === "video" || item.type === "gif" ? "video" : "image",
          url: item.url || item.thumbnail_url || "",
          thumbnailUrl: item.thumbnail_url || item.url || "",
        })) || [],
    }));
}

function getClientIp(req, config) {
  const remote = req.socket.remoteAddress || "";
  const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  if (config.trustProxy && isLoopback) {
    const forwarded = String(req.headers["x-real-ip"] || "").trim();
    if (forwarded) return forwarded;
  }
  return remote;
}

function ipHash(req, config) {
  return createHmac("sha256", config.ipHashSecret)
    .update(getClientIp(req, config))
    .digest("hex");
}

function isAdminHost(req, config) {
  return config.adminHosts.includes(getRequestHost(req));
}

function hasSameOrigin(req, config) {
  if (config.nodeEnv !== "production" && ["127.0.0.1", "localhost"].includes(getRequestHost(req))) {
    return true;
  }
  const host = getRequestHost(req);
  const origin = req.headers.origin;
  if (origin) {
    try {
      return normalizeHost(new URL(origin).host) === host;
    } catch {
      return false;
    }
  }
  const referer = req.headers.referer;
  if (referer) {
    try {
      return normalizeHost(new URL(referer).host) === host;
    } catch {
      return false;
    }
  }
  return false;
}

function getSession(req, db, config) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[config.sessionCookieName];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = db.getSession(tokenHash);
  if (!session) return null;
  const now = Date.now();
  if (
    session.expires_at <= now ||
    now - session.last_seen > config.sessionIdleMs
  ) {
    db.deleteSession(tokenHash);
    return null;
  }
  if (now - session.last_seen > 5 * 60 * 1000) {
    db.touchSession(tokenHash, now);
    session.last_seen = now;
  }
  return { ...session, tokenHash };
}

function requireSession(req, res, db, config) {
  const session = getSession(req, db, config);
  if (!session) {
    res.setHeader(
      "Set-Cookie",
      clearSessionCookie(config.sessionCookieName, { secure: config.secureCookies }),
    );
    sendJson(res, 401, { error: "authentication_required", message: "请先登录" });
    return null;
  }
  return session;
}

function requireCsrf(req, res, session) {
  const header = String(req.headers["x-csrf-token"] || "");
  if (!constantTimeEqual(header, session.csrf_token)) {
    sendJson(res, 403, { error: "csrf_failed", message: "请求校验失败，请刷新后重试" });
    return false;
  }
  return true;
}

function createExternalCache(db) {
  const values = new Map();
  return async function cached(key, ttlMs, loader) {
    const existing = values.get(key);
    const now = Date.now();
    if (existing?.value && existing.expiresAt > now) return existing.value;
    if (existing?.pending) return existing.pending;
    const persisted = db.getCache(key);
    if (persisted?.value) {
      values.set(key, persisted);
      return persisted.value;
    }
    const pending = loader()
      .then((value) => {
        const stored = db.setCache(key, value, ttlMs);
        values.set(key, stored);
        return value;
      })
      .catch((error) => {
        values.delete(key);
        const stale = db.getCache(key, { allowExpired: true });
        if (stale?.value) {
          values.set(key, stale);
          return stale.value;
        }
        throw error;
      });
    values.set(key, { pending });
    return pending;
  };
}

function publicCacheHeaders(maxAge = 60) {
  return {
    "Cache-Control": `public, max-age=${Math.min(maxAge, 60)}, s-maxage=${maxAge}, stale-while-revalidate=300`,
  };
}

function adminCacheHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
  };
}

function etagFor(post) {
  return `W/"${post.version}-${createHash("sha1").update(post.updatedAt).digest("hex").slice(0, 10)}"`;
}

function injectSiteText(indexHtml, siteText) {
  const encoded = Buffer.from(JSON.stringify(siteText), "utf8").toString("base64");
  const template = `<template id="sails-site-text">${encoded}</template>`;
  return indexHtml.includes("</head>")
    ? indexHtml.replace("</head>", `${template}</head>`)
    : `${template}${indexHtml}`;
}

function getParam(url, name, fallback = "") {
  return (url.searchParams.get(name) || fallback).trim();
}

function renderFeed(posts, baseUrl) {
  const items = posts
    .map((post) => {
      const link = `${baseUrl}/blog/${encodeURIComponent(post.slug)}`;
      return `<item>
  <title>${escapeXml(post.title)}</title>
  <link>${escapeXml(link)}</link>
  <guid isPermaLink="true">${escapeXml(link)}</guid>
  <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
  <description>${escapeXml(post.description)}</description>
</item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>StarsailsClover</title>
  <link>${escapeXml(baseUrl)}</link>
  <description>飞流星墅的写作与创作记录</description>
  <language>zh-CN</language>
${items}
</channel>
</rss>`;
}

function renderSitemap(posts, albums, baseUrl) {
  const urls = ["", "/blog", "/github", "/about", "/feed", "/music"]
    .map((route) => `  <url><loc>${escapeXml(`${baseUrl}${route}`)}</loc></url>`)
    .concat(
      posts.map(
        (post) =>
          `  <url><loc>${escapeXml(`${baseUrl}/blog/${encodeURIComponent(post.slug)}`)}</loc><lastmod>${escapeXml(post.updatedAt)}</lastmod></url>`,
      ),
    )
    .concat(
      albums.map(
        (album) =>
          `  <url><loc>${escapeXml(`${baseUrl}/music/${encodeURIComponent(album.slug)}`)}</loc><lastmod>${escapeXml(album.updatedAt)}</lastmod></url>`,
      ),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function requireJsonBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_body", "请求内容必须是对象");
  }
  return body;
}

export function createApp(config) {
  mkdirSync(path.dirname(config.databasePath), { recursive: true });
  mkdirSync(config.uploadsDir, { recursive: true });
  const db = new SiteDatabase(config.databasePath);
  db.ensureSiteText(seedSiteText);
  const publicLimiter = new WindowRateLimiter({ limit: 300, windowMs: 60_000 });
  const loginLimiter = new WindowRateLimiter({ limit: 20, windowMs: 15 * 60_000 });
  const externalCache = createExternalCache(db);
  const indexCache = { mtimeMs: -1, html: "" };

  async function loadGitHubOverview() {
    return externalCache("github-overview", 10 * 60_000, async () => {
      const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "StarsailsClover-Personal-Site",
      };
      const [profileResponse, reposResponse, eventsResponse, contributionsResponse] =
        await Promise.all([
          fetch(`https://api.github.com/users/${config.githubUser}`, {
            headers,
            signal: AbortSignal.timeout(8000),
          }),
          fetch(
            `https://api.github.com/users/${config.githubUser}/repos?sort=pushed&per_page=8`,
            { headers, signal: AbortSignal.timeout(8000) },
          ),
          fetch(
            `https://api.github.com/users/${config.githubUser}/events/public?per_page=20`,
            { headers, signal: AbortSignal.timeout(8000) },
          ),
          fetch(`https://github.com/users/${config.githubUser}/contributions`, {
            headers: { "User-Agent": "StarsailsClover-Personal-Site" },
            signal: AbortSignal.timeout(10000),
          }),
        ]);
      if (!profileResponse.ok || !reposResponse.ok || !eventsResponse.ok) {
        throw new Error("GitHub public data unavailable");
      }
      const [profile, repos, events] = await Promise.all([
        profileResponse.json(),
        reposResponse.json(),
        eventsResponse.json(),
      ]);
      const contributionHtml = contributionsResponse.ok
        ? await contributionsResponse.text()
        : "";
      const contributions = parseContributions(contributionHtml);
      return {
        profile: {
          login: profile.login,
          name: profile.name,
          avatarUrl: profile.avatar_url,
          bio: profile.bio,
          htmlUrl: profile.html_url,
          followers: profile.followers,
          following: profile.following,
          publicRepos: profile.public_repos,
        },
        repos: repos.map((repo) => ({
          id: repo.id,
          name: repo.name,
          description: repo.description,
          html_url: repo.html_url,
          language: repo.language,
          stargazers_count: repo.stargazers_count,
          forks_count: repo.forks_count,
          pushed_at: repo.pushed_at,
          updated_at: repo.updated_at,
        })),
        events: events.map((event) => ({
          id: event.id,
          type: event.type,
          repo: event.repo?.name || "",
          action: event.payload?.action || "",
          ref: event.payload?.ref || "",
          refType: event.payload?.ref_type || "",
          createdAt: event.created_at,
        })),
        contributions,
        fetchedAt: new Date().toISOString(),
      };
    });
  }

  async function loadXFeed() {
    return externalCache(`x-feed-${config.xHandle}`, 5 * 60_000, async () => {
      const [profileResponse, statusesResponse] = await Promise.all([
        fetch(`https://api.fxtwitter.com/2/profile/${config.xHandle}`, {
          headers: { "User-Agent": "SailsSite/1" },
          signal: AbortSignal.timeout(8000),
        }),
        fetch(
          `https://api.fxtwitter.com/2/profile/${config.xHandle}/statuses?count=20`,
          {
            headers: { "User-Agent": "SailsSite/1" },
            signal: AbortSignal.timeout(10000),
          },
        ),
      ]);
      if (!statusesResponse.ok) {
        throw new Error("X timeline unavailable");
      }
      const statuses = await statusesResponse.json();
      const profilePayload = profileResponse.ok
        ? await profileResponse.json()
        : null;
      const user = profilePayload?.user || null;
      return {
        profile: user
          ? {
              screenName: user.screen_name,
              name: user.name,
              avatarUrl: user.avatar_url,
              description: user.description,
              followers: user.followers,
              tweets: user.tweets,
              url: user.url,
            }
          : null,
        items: normalizeXStatuses(statuses),
        fetchedAt: new Date().toISOString(),
      };
    });
  }

  async function serveAppShell(req, res) {
    const indexPath = path.join(config.distDir, "index.html");
    try {
      const fileStat = await stat(indexPath);
      if (fileStat.mtimeMs !== indexCache.mtimeMs) {
        indexCache.html = await readFile(indexPath, "utf8");
        indexCache.mtimeMs = fileStat.mtimeMs;
      }
    } catch {
      throw new HttpError(503, "frontend_unavailable", "前端资源尚未就绪");
    }
    const html = injectSiteText(
      indexCache.html,
      db.getSiteText(seedSiteText),
    );
    const body = Buffer.from(html);
    res.writeHead(req.method === "HEAD" ? 200 : 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-cache, must-revalidate",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  }

  const cleanupTimer = setInterval(() => {
    db.cleanup();
    publicLimiter.cleanup();
    loginLimiter.cleanup();
  }, 30 * 60_000);
  cleanupTimer.unref();

  async function login(req, res) {
    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "method_not_allowed", message: "仅支持 POST" });
    }
    if (!hasSameOrigin(req, config)) {
      throw new HttpError(403, "origin_rejected", "请求来源无效");
    }
    const body = requireJsonBody(await readJson(req, 16 * 1024));
    const username = String(body.username || "").trim().slice(0, 80);
    const password = String(body.password || "");
    if (!username || !password || password.length > 256) {
      throw new HttpError(400, "credentials_invalid", "请输入账号和密码");
    }
    const hashedIp = ipHash(req, config);
    const limiter = loginLimiter.take(hashedIp);
    if (!limiter.allowed) {
      res.setHeader("Retry-After", String(limiter.retryAfter));
      return sendJson(res, 429, { error: "rate_limited", message: "尝试过于频繁，请稍后再试" });
    }
    const blockedFor = db.checkLoginBlock(hashedIp, username, Date.now());
    if (blockedFor) {
      res.setHeader("Retry-After", String(blockedFor));
      return sendJson(res, 429, { error: "login_blocked", message: "登录暂时锁定，请稍后再试" });
    }

    const usernameOk = constantTimeEqual(username, config.adminUsername);
    const passwordOk = await verifyPassword(password, config.adminPasswordHash);
    if (!usernameOk || !passwordOk) {
      const retryAfter = db.recordLoginFailure(hashedIp, username, Date.now());
      db.audit(
        "auth.login_failed",
        username,
        { retryAfter },
        { ipHash: hashedIp, userAgent: req.headers["user-agent"] },
      );
      if (retryAfter) res.setHeader("Retry-After", String(retryAfter));
      return sendJson(res, 401, {
        error: "credentials_rejected",
        message: "账号或密码不正确",
      });
    }

    db.clearLoginFailures(hashedIp, username);
    const token = randomToken(32);
    const csrfToken = randomToken(32);
    const now = Date.now();
    const expiresAt = now + config.sessionMaxAgeMs;
    db.createSession({
      tokenHash: hashToken(token),
      username,
      csrfToken,
      now,
      expiresAt,
    });
    res.setHeader(
      "Set-Cookie",
      sessionCookie(config.sessionCookieName, token, {
        secure: config.secureCookies,
        maxAge: config.sessionMaxAgeMs,
      }),
    );
    db.audit(
      "auth.login",
      username,
      {},
      { ipHash: hashedIp, userAgent: req.headers["user-agent"] },
    );
    sendJson(
      res,
      200,
      {
        user: { username },
        csrfToken,
        expiresAt: new Date(expiresAt).toISOString(),
      },
      adminCacheHeaders(),
    );
  }

  async function handleAdmin(req, res, url) {
    if (!isAdminHost(req, config)) {
      return sendJson(res, 404, { error: "not_found", message: "接口不存在" });
    }
    const version = String(req.headers["x-sails-api-version"] || "");
    if (version !== config.apiVersion) {
      throw new HttpError(
        426,
        "api_version_required",
        `请发送 X-Sails-API-Version: ${config.apiVersion}`,
        { currentVersion: config.apiVersion },
      );
    }
    res.setHeader("X-Sails-API-Version", config.apiVersion);
    res.setHeader("Vary", "X-Sails-API-Version");
    if (url.pathname === "/api/v1/admin/login") return login(req, res);

    if (url.pathname === "/api/v1/admin/session" && req.method === "GET") {
      const currentSession = getSession(req, db, config);
      if (!currentSession) {
        return sendJson(
          res,
          200,
          { authenticated: false },
          adminCacheHeaders(),
        );
      }
      return sendJson(
        res,
        200,
        {
          authenticated: true,
          user: { username: currentSession.username },
          csrfToken: currentSession.csrf_token,
          expiresAt: new Date(currentSession.expires_at).toISOString(),
        },
        adminCacheHeaders(),
      );
    }

    const session = requireSession(req, res, db, config);
    if (!session) return;
    if (
      ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
      (!hasSameOrigin(req, config) || !requireCsrf(req, res, session))
    ) {
      if (!res.writableEnded) {
        sendJson(res, 403, { error: "origin_rejected", message: "请求来源无效" });
      }
      return;
    }

    if (url.pathname === "/api/v1/admin/logout" && req.method === "POST") {
      db.deleteSession(session.tokenHash);
      res.setHeader(
        "Set-Cookie",
        clearSessionCookie(config.sessionCookieName, { secure: config.secureCookies }),
      );
      db.audit("auth.logout", session.username, {}, { ipHash: ipHash(req, config) });
      return noBody(res, 204, adminCacheHeaders());
    }

    if (url.pathname === "/api/v1/admin/posts" && req.method === "GET") {
      const posts = db.listAdmin({
        status: getParam(url, "status", "all"),
        q: getParam(url, "q").slice(0, 100),
        limit: getParam(url, "limit", "100"),
      });
      return sendJson(res, 200, { posts }, adminCacheHeaders());
    }

    if (url.pathname === "/api/v1/admin/posts" && req.method === "POST") {
      const body = normalizeAdminBody(await readJson(req, config.jsonLimit));
      const post = db.createPost(body, session.username);
      return sendJson(res, 201, { post }, adminCacheHeaders());
    }

    const revisionRestoreMatch = url.pathname.match(
      /^\/api\/v1\/admin\/posts\/([^/]+)\/revisions\/(\d+)\/restore$/,
    );
    if (revisionRestoreMatch && req.method === "POST") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const post = db.restoreRevision(
        decodeURIComponent(revisionRestoreMatch[1]),
        Number(revisionRestoreMatch[2]),
        body.expectedVersion,
        session.username,
      );
      return sendJson(res, 200, { post }, adminCacheHeaders());
    }

    const revisionsMatch = url.pathname.match(
      /^\/api\/v1\/admin\/posts\/([^/]+)\/revisions$/,
    );
    if (revisionsMatch && req.method === "GET") {
      const postId = decodeURIComponent(revisionsMatch[1]);
      if (!db.getAdminById(postId)) throw new NotFoundError();
      return sendJson(
        res,
        200,
        { revisions: db.listRevisions(postId) },
        adminCacheHeaders(),
      );
    }

    const duplicateMatch = url.pathname.match(
      /^\/api\/v1\/admin\/posts\/([^/]+)\/duplicate$/,
    );
    if (duplicateMatch && req.method === "POST") {
      const post = db.duplicatePost(decodeURIComponent(duplicateMatch[1]), session.username);
      return sendJson(res, 201, { post }, adminCacheHeaders());
    }

    const publishMatch = url.pathname.match(
      /^\/api\/v1\/admin\/posts\/([^/]+)\/(publish|unpublish)$/,
    );
    if (publishMatch && req.method === "POST") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const status = publishMatch[2] === "publish" ? "published" : "draft";
      const post = db.setStatus(
        decodeURIComponent(publishMatch[1]),
        status,
        body.expectedVersion,
        session.username,
        status === "published" ? body.publishedAt || new Date().toISOString() : undefined,
      );
      return sendJson(res, 200, { post }, adminCacheHeaders());
    }

    const postMatch = url.pathname.match(/^\/api\/v1\/admin\/posts\/([^/]+)$/);
    if (postMatch && req.method === "GET") {
      const post = db.getAdminById(decodeURIComponent(postMatch[1]));
      if (!post) throw new NotFoundError();
      return sendJson(res, 200, { post }, adminCacheHeaders());
    }
    if (postMatch && req.method === "PATCH") {
      const body = normalizeAdminBody(await readJson(req, config.jsonLimit));
      const expectedVersion = body.expectedVersion;
      if (!expectedVersion) {
        throw new ValidationError("缺少版本号，请刷新后重试");
      }
      const post = db.updatePost(
        decodeURIComponent(postMatch[1]),
        body,
        expectedVersion,
        session.username,
      );
      return sendJson(res, 200, { post }, adminCacheHeaders());
    }
    if (postMatch && req.method === "DELETE") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      db.deletePost(
        decodeURIComponent(postMatch[1]),
        body.expectedVersion,
        session.username,
      );
      return noBody(res, 204, adminCacheHeaders());
    }

    if (url.pathname === "/api/v1/admin/uploads" && req.method === "POST") {
      const contentType = String(req.headers["content-type"] || "").toLowerCase();
      if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(contentType)) {
        throw new HttpError(415, "unsupported_image", "仅支持 JPEG、PNG、WebP、AVIF 或 HEIC");
      }
      const input = await readBuffer(req, config.uploadLimit);
      let output;
      try {
        output = await sharp(input, {
          limitInputPixels: 40_000_000,
          failOn: "warning",
          animated: false,
        })
          .rotate()
          .resize({
            width: 2200,
            height: 2200,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 84, effort: 4 })
          .toBuffer({ resolveWithObject: true });
      } catch {
        throw new HttpError(415, "invalid_image", "图片无法解析或尺寸过大");
      }
      const filename = `${Date.now().toString(36)}-${randomToken(9).toLowerCase()}.webp`;
      await writeFile(path.join(config.uploadsDir, filename), output.data, { mode: 0o600 });
      return sendJson(
        res,
        201,
        {
          url: `/uploads/${filename}`,
          width: output.info.width,
          height: output.info.height,
          bytes: output.info.size,
        },
        adminCacheHeaders(),
      );
    }

    if (url.pathname === "/api/v1/admin/site-text" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { text: db.getSiteText(seedSiteText) },
        adminCacheHeaders(),
      );
    }
    if (url.pathname === "/api/v1/admin/site-text" && req.method === "PUT") {
      const body = requireJsonBody(await readJson(req, 256 * 1024));
      if (!body.text || typeof body.text !== "object" || Array.isArray(body.text)) {
        throw new ValidationError("网站文案格式错误");
      }
      const serialized = JSON.stringify(body.text);
      if (serialized.length > 200_000) {
        throw new ValidationError("网站文案内容过大");
      }
      db.setSiteText(body.text, session.username);
      return sendJson(
        res,
        200,
        { text: body.text },
        adminCacheHeaders(),
      );
    }

    if (url.pathname === "/api/v1/admin/collections" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { collections: db.listAdminCollections() },
        adminCacheHeaders(),
      );
    }
    if (url.pathname === "/api/v1/admin/collections" && req.method === "POST") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const collection = db.createCollection(body, session.username);
      return sendJson(res, 201, { collection }, adminCacheHeaders());
    }

    const collectionPostsMatch = url.pathname.match(
      /^\/api\/v1\/admin\/collections\/([^/]+)\/posts$/,
    );
    if (collectionPostsMatch && req.method === "PUT") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const collection = db.setCollectionPosts(
        decodeURIComponent(collectionPostsMatch[1]),
        body.postIds,
        session.username,
        body.expectedVersion,
      );
      return sendJson(res, 200, { collection }, adminCacheHeaders());
    }

    const collectionMatch = url.pathname.match(
      /^\/api\/v1\/admin\/collections\/([^/]+)$/,
    );
    if (collectionMatch && req.method === "GET") {
      const collection = db.getAdminCollection(
        decodeURIComponent(collectionMatch[1]),
      );
      if (!collection) throw new NotFoundError("合集不存在");
      return sendJson(
        res,
        200,
        {
          collection,
          posts: db.listCollectionPosts(collection.id, { includeDrafts: true }),
        },
        adminCacheHeaders(),
      );
    }
    if (collectionMatch && req.method === "PATCH") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const collection = Array.isArray(body.postIds)
        ? db.updateCollectionWithPosts(
            decodeURIComponent(collectionMatch[1]),
            body,
            body.postIds,
            body.expectedVersion,
            session.username,
          )
        : db.updateCollection(
            decodeURIComponent(collectionMatch[1]),
            body,
            body.expectedVersion,
            session.username,
          );
      return sendJson(res, 200, { collection }, adminCacheHeaders());
    }
    if (collectionMatch && req.method === "DELETE") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      db.deleteCollection(
        decodeURIComponent(collectionMatch[1]),
        body.expectedVersion,
        session.username,
      );
      return noBody(res, 204, adminCacheHeaders());
    }

    if (url.pathname === "/api/v1/admin/music/albums" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { albums: db.listAdminMusicAlbums() },
        adminCacheHeaders(),
      );
    }
    if (url.pathname === "/api/v1/admin/music/albums" && req.method === "POST") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const album = db.createMusicAlbum(body, session.username);
      return sendJson(res, 201, { album }, adminCacheHeaders());
    }

    const musicAlbumTracksMatch = url.pathname.match(
      /^\/api\/v1\/admin\/music\/albums\/([^/]+)\/tracks$/,
    );
    if (musicAlbumTracksMatch && req.method === "POST") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const album = db.createMusicTrack(
        decodeURIComponent(musicAlbumTracksMatch[1]),
        body,
        session.username,
      );
      return sendJson(res, 201, { album }, adminCacheHeaders());
    }

    const musicAlbumMatch = url.pathname.match(
      /^\/api\/v1\/admin\/music\/albums\/([^/]+)$/,
    );
    if (musicAlbumMatch && req.method === "GET") {
      const album = db.getAdminMusicAlbum(
        decodeURIComponent(musicAlbumMatch[1]),
      );
      if (!album) throw new NotFoundError("专辑不存在");
      return sendJson(res, 200, { album }, adminCacheHeaders());
    }
    if (musicAlbumMatch && req.method === "PATCH") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const album = db.updateMusicAlbum(
        decodeURIComponent(musicAlbumMatch[1]),
        body,
        body.expectedVersion,
        session.username,
      );
      return sendJson(res, 200, { album }, adminCacheHeaders());
    }
    if (musicAlbumMatch && req.method === "DELETE") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      db.deleteMusicAlbum(
        decodeURIComponent(musicAlbumMatch[1]),
        body.expectedVersion,
        session.username,
      );
      return noBody(res, 204, adminCacheHeaders());
    }

    const musicTrackMatch = url.pathname.match(
      /^\/api\/v1\/admin\/music\/tracks\/([^/]+)$/,
    );
    if (musicTrackMatch && req.method === "PATCH") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const album = db.updateMusicTrack(
        decodeURIComponent(musicTrackMatch[1]),
        body,
        body.expectedVersion,
        session.username,
      );
      return sendJson(res, 200, { album }, adminCacheHeaders());
    }
    if (musicTrackMatch && req.method === "DELETE") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const album = db.deleteMusicTrack(
        decodeURIComponent(musicTrackMatch[1]),
        body.expectedVersion,
        session.username,
      );
      return sendJson(res, 200, { album }, adminCacheHeaders());
    }

    if (url.pathname === "/api/v1/admin/music/playlists" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { playlists: db.listAdminMusicPlaylists() },
        adminCacheHeaders(),
      );
    }
    if (url.pathname === "/api/v1/admin/music/playlists" && req.method === "POST") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const playlist = db.createMusicPlaylist(body, session.username);
      return sendJson(res, 201, { playlist }, adminCacheHeaders());
    }

    const playlistTracksMatch = url.pathname.match(
      /^\/api\/v1\/admin\/music\/playlists\/([^/]+)\/tracks$/,
    );
    if (playlistTracksMatch && req.method === "POST") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const playlist = db.createMusicPlaylistTrack(
        decodeURIComponent(playlistTracksMatch[1]),
        body,
        session.username,
      );
      return sendJson(res, 201, { playlist }, adminCacheHeaders());
    }

    const playlistOrderMatch = url.pathname.match(
      /^\/api\/v1\/admin\/music\/playlists\/([^/]+)\/order$/,
    );
    if (playlistOrderMatch && req.method === "POST") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const playlist = db.reorderMusicPlaylistTracks(
        decodeURIComponent(playlistOrderMatch[1]),
        body.trackIds,
        session.username,
      );
      return sendJson(res, 200, { playlist }, adminCacheHeaders());
    }

    const playlistMatch = url.pathname.match(
      /^\/api\/v1\/admin\/music\/playlists\/([^/]+)$/,
    );
    if (playlistMatch && req.method === "GET") {
      const playlist = db.getMusicPlaylist(decodeURIComponent(playlistMatch[1]));
      if (!playlist) throw new NotFoundError("歌单不存在");
      return sendJson(res, 200, { playlist }, adminCacheHeaders());
    }
    if (playlistMatch && req.method === "PATCH") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const playlist = db.updateMusicPlaylist(
        decodeURIComponent(playlistMatch[1]),
        body,
        body.expectedVersion,
        session.username,
      );
      return sendJson(res, 200, { playlist }, adminCacheHeaders());
    }
    if (playlistMatch && req.method === "DELETE") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      db.deleteMusicPlaylist(
        decodeURIComponent(playlistMatch[1]),
        body.expectedVersion,
        session.username,
      );
      return noBody(res, 204, adminCacheHeaders());
    }

    const playlistTrackMatch = url.pathname.match(
      /^\/api\/v1\/admin\/music\/playlist-tracks\/([^/]+)$/,
    );
    if (playlistTrackMatch && req.method === "PATCH") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const playlist = db.updateMusicPlaylistTrack(
        decodeURIComponent(playlistTrackMatch[1]),
        body,
        body.expectedVersion,
        session.username,
      );
      return sendJson(res, 200, { playlist }, adminCacheHeaders());
    }
    if (playlistTrackMatch && req.method === "DELETE") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      db.deleteMusicPlaylistTrack(
        decodeURIComponent(playlistTrackMatch[1]),
        body.expectedVersion,
        session.username,
      );
      return noBody(res, 204, adminCacheHeaders());
    }

    if (url.pathname === "/api/v1/admin/music/integrations" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { integrations: db.getIntegrationSettings() },
        adminCacheHeaders(),
      );
    }
    if (url.pathname === "/api/v1/admin/music/integrations" && req.method === "PATCH") {
      const body = requireJsonBody(await readJson(req, config.jsonLimit));
      const integrations = db.setIntegrationSettings(body, session.username);
      return sendJson(res, 200, { integrations }, adminCacheHeaders());
    }

    if (url.pathname === "/api/v1/admin/music/netease/search" && req.method === "GET") {
      const integrations = db.getIntegrationSettings();
      if (!integrations.neteaseApiBase) {
        throw new HttpError(
          409,
          "netease_not_configured",
          "尚未配置网易云接口地址",
        );
      }
      const results = await searchNetease(
        integrations.neteaseApiBase,
        getParam(url, "q").slice(0, 120),
      );
      return sendJson(res, 200, { results }, adminCacheHeaders());
    }

    const neteaseSongMatch = url.pathname.match(
      /^\/api\/v1\/admin\/music\/netease\/song\/([^/]+)$/,
    );
    if (neteaseSongMatch && req.method === "GET") {
      const integrations = db.getIntegrationSettings();
      if (!integrations.neteaseApiBase) {
        throw new HttpError(
          409,
          "netease_not_configured",
          "尚未配置网易云接口地址",
        );
      }
      const song = await fetchNeteaseSong(
        integrations.neteaseApiBase,
        decodeURIComponent(neteaseSongMatch[1]),
      );
      return sendJson(res, 200, { song }, adminCacheHeaders());
    }

    if (url.pathname === "/api/v1/admin/media" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { media: db.listMedia(getParam(url, "limit", "100")) },
        adminCacheHeaders(),
      );
    }
    if (url.pathname === "/api/v1/admin/media" && req.method === "POST") {
      let mimeType = String(req.headers["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      let originalName = String(req.headers["x-file-name"] || "upload");
      try {
        originalName = decodeURIComponent(originalName);
      } catch {
        // Keep the original header when it is not URI encoded.
      }
      originalName = path.basename(originalName).slice(0, 180);
      const extension = path.extname(originalName).toLowerCase();
      if (mimeType === "application/octet-stream") {
        if (extension === ".mp3") mimeType = "audio/mpeg";
        else if (extension === ".m4a") mimeType = "audio/mp4";
        else if (extension === ".aac") mimeType = "audio/aac";
        else if (extension === ".wav") mimeType = "audio/wav";
        else if (extension === ".ogg") mimeType = "audio/ogg";
        else if (extension === ".flac") mimeType = "audio/flac";
      }
      const supportedImage = /^image\/(jpeg|png|webp|avif|heic|heif)$/.test(
        mimeType,
      );
      const supportedVideo = ["video/mp4", "video/webm", "video/quicktime"].includes(
        mimeType,
      );
      const supportedAudio = [
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/m4a",
        "audio/x-m4a",
        "audio/aac",
        "audio/x-aac",
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "audio/vnd.wave",
        "audio/ogg",
        "audio/flac",
        "audio/x-flac",
      ].includes(mimeType);
      if (!supportedImage && !supportedVideo && !supportedAudio) {
        throw new HttpError(
          415,
          "unsupported_media",
          "仅支持常用图片、MP4/WebM/MOV 视频或常见音频文件",
        );
      }
      const token = `${Date.now().toString(36)}-${randomToken(9)
        .replace(/[^a-z0-9_-]/gi, "")
        .toLowerCase()}`;
      const temporaryPath = path.join(config.uploadsDir, `.incoming-${token}`);
      let bytes;
      try {
        bytes = await streamRequestToFile(
          req,
          temporaryPath,
          supportedImage ? config.uploadLimit : config.mediaLimit,
        );
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }

      try {
        if (supportedImage) {
          let output;
          try {
            output = await sharp(temporaryPath, {
              limitInputPixels: 60_000_000,
              failOn: "warning",
              animated: false,
            })
              .rotate()
              .resize({
                width: 2600,
                height: 2600,
                fit: "inside",
                withoutEnlargement: true,
              })
              .webp({ quality: 86, effort: 4 })
              .toBuffer({ resolveWithObject: true });
          } catch {
            throw new HttpError(415, "invalid_image", "图片无法解析或尺寸过大");
          }
          const filename = `${token}.webp`;
          await writeFile(path.join(config.uploadsDir, filename), output.data, {
            mode: 0o600,
          });
          const media = db.addMedia({
            filename,
            originalName,
            mimeType: "image/webp",
            kind: "image",
            bytes: output.data.length,
            width: output.info.width,
            height: output.info.height,
          });
          return sendJson(
            res,
            201,
            {
              media,
              markdown: `![${originalName.replaceAll("]", "")}](${media.url})`,
            },
            adminCacheHeaders(),
          );
        }

        if (supportedVideo) {
          const video = await sniffVideo(temporaryPath, mimeType);
          if (!video) {
            throw new HttpError(415, "invalid_video", "视频格式与文件内容不匹配");
          }
          const filename = `${token}.${video.extension}`;
          await rename(temporaryPath, path.join(config.uploadsDir, filename));
          const media = db.addMedia({
            filename,
            originalName,
            mimeType: video.mimeType,
            kind: "video",
            bytes,
            width: null,
            height: null,
          });
          return sendJson(
            res,
            201,
            {
              media,
              markdown: `![${originalName.replaceAll("]", "")}](${media.url})`,
            },
            adminCacheHeaders(),
          );
        }

        const audio = await sniffAudio(temporaryPath, mimeType);
        if (!audio) {
          throw new HttpError(415, "invalid_audio", "音频格式与文件内容不匹配");
        }
        const filename = `${token}.${audio.extension}`;
        await rename(temporaryPath, path.join(config.uploadsDir, filename));
        const media = db.addMedia({
          filename,
          originalName,
          mimeType: audio.mimeType,
          kind: "audio",
          bytes,
          width: null,
          height: null,
        });
        return sendJson(
          res,
          201,
          {
            media,
            markdown: `[音频：${originalName.replaceAll("]", "")}](${media.url})`,
            durationSeconds: audio.durationSeconds,
          },
          adminCacheHeaders(),
        );
      } finally {
        await unlink(temporaryPath).catch(() => undefined);
      }
    }

    const mediaMatch = url.pathname.match(/^\/api\/v1\/admin\/media\/([^/]+)$/);
    if (mediaMatch && req.method === "DELETE") {
      const media = db.getMedia(decodeURIComponent(mediaMatch[1]));
      if (!media) throw new NotFoundError("媒体文件不存在");
      const references = db.findMediaReferences(media.id);
      if (references.total > 0) {
        throw new HttpError(
          409,
          "media_in_use",
          "这个媒体仍被文章、合集或音乐作品引用",
          { references },
        );
      }
      await unlink(path.join(config.uploadsDir, media.filename)).catch(
        () => undefined,
      );
      db.deleteMedia(media.id, session.username);
      return noBody(res, 204, adminCacheHeaders());
    }

    throw new NotFoundError("管理接口不存在");
  }

  async function handlePublic(req, res, url) {
    if (url.pathname === "/healthz") {
      if (!db.health()) throw new HttpError(503, "database_unavailable", "数据库不可用");
      return sendJson(
        res,
        200,
        { ok: true, version: config.apiVersion, time: new Date().toISOString() },
        { "Cache-Control": "no-store" },
      );
    }

    if (url.pathname === "/api/v1/site-text" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { text: db.getSiteText(seedSiteText) },
        publicCacheHeaders(30),
      );
    }

    if (url.pathname === "/api/v1/collections" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { collections: db.listPublicCollections() },
        publicCacheHeaders(60),
      );
    }

    const collectionMatch = url.pathname.match(
      /^\/api\/v1\/collections\/([^/]+)$/,
    );
    if (collectionMatch && req.method === "GET") {
      const collection = db.getPublicCollectionBySlug(
        decodeURIComponent(collectionMatch[1]),
      );
      if (!collection) throw new NotFoundError("合集不存在");
      return sendJson(
        res,
        200,
        {
          collection,
          posts: db.listCollectionPosts(collection.id),
        },
        publicCacheHeaders(120),
      );
    }

    if (url.pathname === "/api/v1/music/albums" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { albums: db.listPublicMusicAlbums() },
        publicCacheHeaders(60),
      );
    }

    const musicAlbumMatch = url.pathname.match(
      /^\/api\/v1\/music\/albums\/([^/]+)$/,
    );
    if (musicAlbumMatch && req.method === "GET") {
      const album = db.getPublicMusicAlbumBySlug(
        decodeURIComponent(musicAlbumMatch[1]),
      );
      if (!album) throw new NotFoundError("专辑不存在");
      return sendJson(res, 200, { album }, publicCacheHeaders(120));
    }

    if (url.pathname === "/api/v1/music/tracks" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { tracks: db.listPublicMusicTracks(getParam(url, "limit", "300")) },
        publicCacheHeaders(60),
      );
    }

    if (url.pathname === "/api/v1/music/playlists" && req.method === "GET") {
      return sendJson(
        res,
        200,
        { playlists: db.listPublicMusicPlaylists() },
        publicCacheHeaders(60),
      );
    }

    const musicPlaylistMatch = url.pathname.match(
      /^\/api\/v1\/music\/playlists\/([^/]+)$/,
    );
    if (musicPlaylistMatch && req.method === "GET") {
      const playlist = db.getPublicMusicPlaylistBySlug(
        decodeURIComponent(musicPlaylistMatch[1]),
      );
      if (!playlist) throw new NotFoundError("歌单不存在");
      return sendJson(res, 200, { playlist }, publicCacheHeaders(120));
    }

    if (url.pathname === "/api/v1/posts" && req.method === "GET") {
      const data = db.listPublished({
        limit: getParam(url, "limit", "20"),
        offset: getParam(url, "offset", "0"),
        tag: getParam(url, "tag").slice(0, 24),
        q: getParam(url, "q").slice(0, 100),
      });
      return sendJson(res, 200, data, publicCacheHeaders(60));
    }

    const postMatch = url.pathname.match(/^\/api\/v1\/posts\/([^/]+)$/);
    if (postMatch && req.method === "GET") {
      const post = db.getPublishedBySlug(decodeURIComponent(postMatch[1]));
      if (!post) throw new NotFoundError("文章不存在");
      const etag = etagFor(post);
      if (req.headers["if-none-match"] === etag) return noBody(res, 304, { ETag: etag });
      return sendJson(res, 200, { post }, { ...publicCacheHeaders(120), ETag: etag });
    }

    if (url.pathname === "/api/v1/tags" && req.method === "GET") {
      const tags = new Map();
      for (const post of db.listPublished({ limit: 50 }).posts) {
        for (const tag of post.tags) tags.set(tag, (tags.get(tag) || 0) + 1);
      }
      return sendJson(
        res,
        200,
        { tags: [...tags].map(([name, count]) => ({ name, count })) },
        publicCacheHeaders(300),
      );
    }

    const tagMatch = url.pathname.match(/^\/api\/v1\/tags\/([^/]+)$/);
    if (tagMatch && req.method === "GET") {
      return sendJson(
        res,
        200,
        db.getTagDetails(decodeURIComponent(tagMatch[1])),
        publicCacheHeaders(120),
      );
    }

    if (url.pathname === "/api/v1/x-feed" && req.method === "GET") {
      try {
        return sendJson(res, 200, await loadXFeed(), publicCacheHeaders(300));
      } catch {
        const stale = db.getCache(`x-feed-${config.xHandle}`, {
          allowExpired: true,
        });
        return sendJson(
          res,
          200,
          {
            ...(stale?.value || { profile: null, items: [] }),
            offline: true,
          },
          publicCacheHeaders(60),
        );
      }
    }

    if (url.pathname === "/api/v1/github/overview" && req.method === "GET") {
      try {
        return sendJson(
          res,
          200,
          await loadGitHubOverview(),
          publicCacheHeaders(300),
        );
      } catch {
        const stale = db.getCache("github-overview", { allowExpired: true });
        return sendJson(
          res,
          200,
          {
            ...(stale?.value || {
              profile: null,
              repos: [],
              events: [],
              contributions: {
                days: [],
                total: 0,
                currentStreak: 0,
                longestStreak: 0,
              },
            }),
            offline: true,
          },
          publicCacheHeaders(60),
        );
      }
    }

    if (url.pathname === "/api/v1/weather" && req.method === "GET") {
      const weather = await externalCache("weather", 10 * 60_000, async () => {
        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=23.1291&longitude=113.2644&current=temperature_2m,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day&timezone=Asia%2FShanghai",
          { signal: AbortSignal.timeout(6000) },
        );
        if (!response.ok) throw new Error(`weather ${response.status}`);
        return response.json();
      }).catch(() => null);
      if (!weather) {
        return sendJson(
          res,
          200,
          { current: {}, stale: true },
          publicCacheHeaders(60),
        );
      }
      return sendJson(res, 200, weather, publicCacheHeaders(600));
    }

    if (url.pathname === "/api/v1/github/repos" && req.method === "GET") {
      const overview = await loadGitHubOverview().catch(() => ({ repos: [] }));
      return sendJson(
        res,
        200,
        {
          repos: overview.repos,
        },
        publicCacheHeaders(300),
      );
    }

    if (url.pathname === "/api/v1/feed.xml" && req.method === "GET") {
      const posts = db.listPublished({ limit: 30 }).posts;
      return sendText(
        res,
        200,
        renderFeed(posts, config.publicBaseUrl),
        "application/rss+xml; charset=utf-8",
        publicCacheHeaders(300),
      );
    }

    if (url.pathname === "/api/v1/sitemap.xml" && req.method === "GET") {
      const posts = db.listPublished({ limit: 50 }).posts;
      const albums = db.listPublicMusicAlbums();
      return sendText(
        res,
        200,
        renderSitemap(posts, albums, config.publicBaseUrl),
        "application/xml; charset=utf-8",
        publicCacheHeaders(300),
      );
    }

    throw new NotFoundError("接口不存在");
  }

  async function handler(req, res) {
    applyCommonHeaders(res);
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (
        ["GET", "HEAD"].includes(req.method || "") &&
        url.pathname.startsWith("/uploads/")
      ) {
        const filename = decodeURIComponent(url.pathname.slice("/uploads/".length));
        if (
          !/^[a-z0-9_-]+\.(?:webp|mp4|webm|mov|mp3|m4a|aac|wav|ogg|flac)$/.test(
            filename,
          )
        ) {
          throw new NotFoundError();
        }
        const filepath = path.join(config.uploadsDir, filename);
        if (!existsSync(filepath) || !statSync(filepath).isFile()) throw new NotFoundError();
        const fileStat = statSync(filepath);
        const range = parseRange(req.headers.range, fileStat.size);
        if (req.headers.range && !range) {
          return noBody(res, 416, {
            "Content-Range": `bytes */${fileStat.size}`,
            "Accept-Ranges": "bytes",
          });
        }
        const status = range ? 206 : 200;
        res.writeHead(status, {
          "Content-Type": mimeTypeForUpload(filename),
          "Content-Length": range ? range.end - range.start + 1 : fileStat.size,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          "Accept-Ranges": "bytes",
          ...(range
            ? { "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}` }
            : {}),
        });
        if (req.method === "HEAD") return res.end();
        const stream = createReadStream(
          filepath,
          range ? { start: range.start, end: range.end } : undefined,
        );
        stream.on("error", () => {
          res.destroy();
        });
        return stream.pipe(res);
      }

      if (url.pathname === "/x-media" && ["GET", "HEAD"].includes(req.method || "")) {
        const targetValue = url.searchParams.get("url") || "";
        let target;
        try {
          target = new URL(targetValue);
        } catch {
          throw new HttpError(400, "invalid_media_url", "媒体地址无效");
        }
        const allowedHosts = new Set([
          "pbs.twimg.com",
          "video.twimg.com",
          "abs.twimg.com",
        ]);
        if (target.protocol !== "https:" || !allowedHosts.has(target.hostname)) {
          throw new HttpError(403, "media_host_rejected", "媒体来源未获允许");
        }
        const upstream = await fetch(target, {
          headers: {
            "User-Agent": "SailsSiteMediaProxy/1",
            Referer: "https://x.com/",
            ...(req.headers.range ? { Range: req.headers.range } : {}),
          },
          signal: AbortSignal.timeout(20000),
        });
        if (!upstream.ok) {
          throw new HttpError(502, "media_upstream_failed", "媒体暂时无法读取");
        }
        const headers = {
          "Content-Type":
            upstream.headers.get("content-type") || "application/octet-stream",
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
          "X-Content-Type-Options": "nosniff",
        };
        const contentLength = upstream.headers.get("content-length");
        const contentRange = upstream.headers.get("content-range");
        const acceptRanges = upstream.headers.get("accept-ranges");
        if (contentLength) headers["Content-Length"] = contentLength;
        if (contentRange) headers["Content-Range"] = contentRange;
        if (acceptRanges) headers["Accept-Ranges"] = acceptRanges;
        res.writeHead(upstream.status, headers);
        if (req.method === "HEAD" || !upstream.body) return res.end();
        return Readable.fromWeb(upstream.body).pipe(res);
      }

      if (
        url.pathname === "/media-proxy" &&
        ["GET", "HEAD"].includes(req.method || "")
      ) {
        const targetValue = url.searchParams.get("url") || "";
        let target;
        try {
          target = new URL(targetValue);
        } catch {
          throw new HttpError(400, "invalid_media_url", "媒体地址无效");
        }
        if (
          !["http:", "https:"].includes(target.protocol) ||
          !NETEASE_MEDIA_HOST_PATTERN.test(target.hostname)
        ) {
          throw new HttpError(403, "media_host_rejected", "媒体来源未获允许");
        }
        const upstream = await fetch(target, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
            Referer: "https://music.163.com/",
            ...(req.headers.range ? { Range: req.headers.range } : {}),
          },
          signal: AbortSignal.timeout(20000),
        });
        if (!upstream.ok) {
          throw new HttpError(502, "media_upstream_failed", "媒体暂时无法读取");
        }
        const headers = {
          "Content-Type":
            upstream.headers.get("content-type") || "application/octet-stream",
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
          "X-Content-Type-Options": "nosniff",
        };
        const contentLength = upstream.headers.get("content-length");
        const contentRange = upstream.headers.get("content-range");
        const acceptRanges = upstream.headers.get("accept-ranges");
        if (contentLength) headers["Content-Length"] = contentLength;
        if (contentRange) headers["Content-Range"] = contentRange;
        if (acceptRanges) headers["Accept-Ranges"] = acceptRanges;
        res.writeHead(upstream.status, headers);
        if (req.method === "HEAD" || !upstream.body) return res.end();
        return Readable.fromWeb(upstream.body).pipe(res);
      }

      if (url.pathname.startsWith("/api/v1/admin")) return await handleAdmin(req, res, url);

      if (url.pathname.startsWith("/api/v1") || url.pathname === "/healthz") {
        const limited = publicLimiter.take(ipHash(req, config));
        if (!limited.allowed) {
          res.setHeader("Retry-After", String(limited.retryAfter));
          throw new HttpError(429, "rate_limited", "请求过于频繁");
        }
        if (url.pathname.startsWith("/api/v1")) {
          const version = String(req.headers["x-sails-api-version"] || "");
          if (version !== config.apiVersion) {
            throw new HttpError(
              426,
              "api_version_required",
              `请发送 X-Sails-API-Version: ${config.apiVersion}`,
              { currentVersion: config.apiVersion },
            );
          }
          res.setHeader("X-Sails-API-Version", config.apiVersion);
          res.setHeader("Vary", "X-Sails-API-Version");
        }
        return await handlePublic(req, res, url);
      }

      if (["GET", "HEAD"].includes(req.method || "")) {
        return await serveAppShell(req, res);
      }

      throw new NotFoundError();
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof HttpError) {
        return sendJson(res, error.status, {
          error: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      if (error instanceof ValidationError) {
        return sendJson(res, 400, { error: error.code, message: error.message });
      }
      if (error instanceof ConflictError) {
        return sendJson(res, 409, { error: error.code, message: error.message });
      }
      if (error instanceof NotFoundError) {
        return sendJson(res, 404, { error: error.code, message: error.message });
      }
      console.error("[sails-site]", error);
      return sendJson(res, 500, {
        error: "internal_error",
        message: "服务暂时不可用",
      });
    }
  }

  return {
    handler,
    db,
    config,
    close() {
      clearInterval(cleanupTimer);
      db.close();
    },
  };
}

function normalizeAdminBody(body) {
  if ("status" in body && body.status === "scheduled" && !body.publishedAt) {
    throw new ValidationError("定时发布需要发布时间");
  }
  return body;
}
