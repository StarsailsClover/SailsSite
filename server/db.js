import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  excerptFromMarkdown,
  normalizePostInput,
  readingMinutes,
  renderMarkdown,
  slugify,
} from "./content.js";

function nowIso() {
  return new Date().toISOString();
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToPost(row, { includeBody = true } = {}) {
  if (!row) return null;
  const post = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.excerpt,
    coverUrl: row.cover_url || "",
    tags: safeJson(row.tags_json, []),
    status: row.status,
    featured: Boolean(row.featured),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    readingMinutes: row.reading_minutes,
  };
  if (includeBody) {
    post.bodyMarkdown = row.body_markdown;
    post.bodyHtml = row.body_html;
  }
  return post;
}

function rowToCollection(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url || "",
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    postCount: Number(row.post_count ?? 0),
  };
}

function rowToMedia(row) {
  if (!row) return null;
  return {
    id: row.id,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    kind: row.kind,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    url: `/uploads/${row.filename}`,
  };
}

function rowToMusicAlbum(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    artistName: row.artist_name,
    artistBio: row.artist_bio,
    description: row.description,
    coverUrl: row.cover_url || "",
    genre: row.genre,
    releaseDate: row.release_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    trackCount: Number(row.track_count ?? 0),
  };
}

function rowToMusicTrack(row, { includeLyrics = true } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    albumId: row.album_id,
    albumSlug: row.album_slug || "",
    albumTitle: row.album_title || "",
    title: row.title,
    artistName: row.artist_name,
    coverUrl: row.cover_url || "",
    genre: row.genre,
    audioUrl: row.audio_url || "",
    durationSeconds: Number(row.duration_seconds ?? 0),
    trackNumber: Number(row.track_number ?? 1),
    lyricsLrc: includeLyrics ? row.lyrics_lrc || "" : "",
    translationLrc: includeLyrics ? row.translation_lrc || "" : "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function normalizeMusicText(value, field, maxLength, required = false) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new ValidationError(`${field}不能为空`);
  if (text.length > maxLength) throw new ValidationError(`${field}过长`);
  return text;
}

function normalizeMusicUrl(value, field) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (url.length > 1000) throw new ValidationError(`${field}过长`);
  if (
    !url.startsWith("/uploads/") &&
    !url.startsWith("/assets/") &&
    !/^https:\/\//i.test(url)
  ) {
    throw new ValidationError(`${field}必须是站内上传或 HTTPS 地址`);
  }
  return url;
}

function normalizeMusicReleaseDate(value) {
  const date = String(value ?? "").trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError("发行日期格式无效");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new ValidationError("发行日期格式无效");
  }
  return date;
}

function normalizeLrc(value) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  if (text.length > 120_000) throw new ValidationError("歌词内容过长");
  return text;
}

function escapeLike(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function mergeMissingDefaults(defaultValue, storedValue) {
  if (
    !defaultValue ||
    typeof defaultValue !== "object" ||
    Array.isArray(defaultValue) ||
    !storedValue ||
    typeof storedValue !== "object" ||
    Array.isArray(storedValue)
  ) {
    return storedValue === undefined ? defaultValue : storedValue;
  }
  const merged = { ...storedValue };
  for (const [key, value] of Object.entries(defaultValue)) {
    merged[key] = mergeMissingDefaults(value, merged[key]);
  }
  return merged;
}

function revisionSnapshot(post) {
  return JSON.stringify({
    title: post.title,
    slug: post.slug,
    description: post.description,
    bodyMarkdown: post.bodyMarkdown,
    bodyHtml: post.bodyHtml,
    coverUrl: post.coverUrl,
    tags: post.tags,
    status: post.status,
    featured: post.featured,
    publishedAt: post.publishedAt,
  });
}

export class SiteDatabase {
  constructor(filename) {
    mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        excerpt TEXT NOT NULL DEFAULT '',
        body_markdown TEXT NOT NULL DEFAULT '',
        body_html TEXT NOT NULL DEFAULT '',
        cover_url TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'draft',
        featured INTEGER NOT NULL DEFAULT 0,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        reading_minutes INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS post_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        FOREIGN KEY(post_id) REFERENCES posts(id)
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        token_hash TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        csrf_token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_attempts (
        ip_hash TEXT NOT NULL,
        username TEXT NOT NULL,
        failures INTEGER NOT NULL DEFAULT 0,
        window_start INTEGER NOT NULL,
        blocked_until INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(ip_hash, username)
      );

      CREATE TABLE IF NOT EXISTS admin_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        username TEXT,
        ip_hash TEXT,
        user_agent TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        cover_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        sort_order TEXT NOT NULL DEFAULT 'newest',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS collection_posts (
        collection_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(collection_id, post_id),
        FOREIGN KEY(collection_id) REFERENCES collections(id),
        FOREIGN KEY(post_id) REFERENCES posts(id)
      );

      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        kind TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cache_entries (
        cache_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS music_albums (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        artist_bio TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        cover_url TEXT,
        genre TEXT NOT NULL DEFAULT '',
        release_date TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS music_tracks (
        id TEXT PRIMARY KEY,
        album_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        cover_url TEXT,
        genre TEXT NOT NULL DEFAULT '',
        audio_url TEXT NOT NULL DEFAULT '',
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        track_number INTEGER NOT NULL DEFAULT 1,
        lyrics_lrc TEXT NOT NULL DEFAULT '',
        translation_lrc TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT,
        FOREIGN KEY(album_id) REFERENCES music_albums(id)
      );

      CREATE INDEX IF NOT EXISTS idx_posts_public ON posts(status, published_at, deleted_at);
      CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_revisions_post ON post_revisions(post_id, version DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON admin_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_collections_public ON collections(status, deleted_at);
      CREATE INDEX IF NOT EXISTS idx_collection_posts ON collection_posts(collection_id, post_id);
      CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cache_expiry ON cache_entries(expires_at);
      CREATE INDEX IF NOT EXISTS idx_music_albums_public
        ON music_albums(status, release_date DESC, deleted_at);
      CREATE INDEX IF NOT EXISTS idx_music_tracks_album
        ON music_tracks(album_id, status, track_number, deleted_at);
    `);
  }

  close() {
    this.db.close();
  }

  health() {
    return this.db.prepare("SELECT 1 AS ok").get()?.ok === 1;
  }

  seedIfEmpty(posts) {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM posts").get().count;
    if (count > 0) return false;
    for (const post of posts) {
      this.createPost(
        {
          ...post,
          description: post.description,
          bodyMarkdown: post.body,
          status: "published",
          publishedAt: post.publishedAt,
        },
        "seed",
      );
    }
    return true;
  }

  ensureSiteText(defaultText) {
    const existing = this.db
      .prepare("SELECT value_json FROM site_settings WHERE key = 'site_text'")
      .get();
    if (!existing) {
      this.db
        .prepare("INSERT INTO site_settings (key, value_json, updated_at) VALUES (?, ?, ?)")
        .run("site_text", JSON.stringify(defaultText), nowIso());
      return;
    }
    const stored = safeJson(existing.value_json, {});
    const merged = mergeMissingDefaults(defaultText, stored);
    if (JSON.stringify(merged) !== JSON.stringify(stored)) {
      this.db
        .prepare("UPDATE site_settings SET value_json = ?, updated_at = ? WHERE key = 'site_text'")
        .run(JSON.stringify(merged), nowIso());
    }
  }

  getSiteText(defaultText) {
    const row = this.db
      .prepare("SELECT value_json FROM site_settings WHERE key = 'site_text'")
      .get();
    return row ? safeJson(row.value_json, defaultText) : defaultText;
  }

  setSiteText(value, username = "admin") {
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO site_settings (key, value_json, updated_at)
         VALUES ('site_text', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(value), timestamp);
    this.audit("site_text.update", username, {});
    return value;
  }

  getCache(cacheKey, { allowExpired = false } = {}) {
    const row = this.db
      .prepare("SELECT value_json, fetched_at, expires_at FROM cache_entries WHERE cache_key = ?")
      .get(cacheKey);
    if (!row) return null;
    if (!allowExpired && row.expires_at <= Date.now()) return null;
    return {
      value: safeJson(row.value_json, null),
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
    };
  }

  setCache(cacheKey, value, ttlMs) {
    const fetchedAt = nowIso();
    const expiresAt = Date.now() + ttlMs;
    this.db
      .prepare(
        `INSERT INTO cache_entries (cache_key, value_json, fetched_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           value_json = excluded.value_json,
           fetched_at = excluded.fetched_at,
           expires_at = excluded.expires_at`,
      )
      .run(cacheKey, JSON.stringify(value), fetchedAt, expiresAt);
    return { value, fetchedAt, expiresAt };
  }

  listPublicCollections() {
    return this.db
      .prepare(
        `SELECT c.*, COUNT(p.id) AS post_count
         FROM collections c
         LEFT JOIN collection_posts cp ON cp.collection_id = c.id
         LEFT JOIN posts p ON p.id = cp.post_id AND p.deleted_at IS NULL AND p.status = 'published'
         WHERE c.status = 'published' AND c.deleted_at IS NULL
         GROUP BY c.id
         ORDER BY c.created_at DESC`,
      )
      .all()
      .map(rowToCollection);
  }

  getPublicCollectionBySlug(slug) {
    const row = this.db
      .prepare(
        `SELECT c.*, COUNT(p.id) AS post_count
         FROM collections c
         LEFT JOIN collection_posts cp ON cp.collection_id = c.id
         LEFT JOIN posts p
           ON p.id = cp.post_id
          AND p.deleted_at IS NULL
          AND p.status = 'published'
          AND p.published_at <= ?
         WHERE c.slug = ? AND c.status = 'published' AND c.deleted_at IS NULL
         GROUP BY c.id`,
      )
      .get(nowIso(), slug);
    return rowToCollection(row);
  }

  listCollectionPosts(collectionId, { includeDrafts = false } = {}) {
    this.markDuePosts();
    const conditions = [
      "cp.collection_id = ?",
      "p.deleted_at IS NULL",
    ];
    const params = [collectionId];
    if (!includeDrafts) {
      conditions.push("p.status = 'published'", "p.published_at <= ?");
      params.push(nowIso());
    }
    const collection = this.db
      .prepare("SELECT sort_order FROM collections WHERE id = ?")
      .get(collectionId);
    const direction = collection?.sort_order === "oldest" ? "ASC" : "DESC";
    return this.db
      .prepare(
        `SELECT p.* FROM posts p
         JOIN collection_posts cp ON cp.post_id = p.id
         WHERE ${conditions.join(" AND ")}
         ORDER BY p.published_at ${direction}, p.updated_at ${direction}`,
      )
      .all(...params)
      .map((row) => rowToPost(row, { includeBody: false }));
  }

  listAdminCollections() {
    return this.db
      .prepare(
        `SELECT c.*, COUNT(p.id) AS post_count
         FROM collections c
         LEFT JOIN collection_posts cp ON cp.collection_id = c.id
         LEFT JOIN posts p ON p.id = cp.post_id AND p.deleted_at IS NULL
         WHERE c.deleted_at IS NULL
         GROUP BY c.id
         ORDER BY c.updated_at DESC`,
      )
      .all()
      .map(rowToCollection);
  }

  getAdminCollection(id) {
    const row = this.db
      .prepare(
        `SELECT c.*, COUNT(p.id) AS post_count
         FROM collections c
         LEFT JOIN collection_posts cp ON cp.collection_id = c.id
         LEFT JOIN posts p ON p.id = cp.post_id AND p.deleted_at IS NULL
         WHERE c.id = ? AND c.deleted_at IS NULL
         GROUP BY c.id`,
      )
      .get(id);
    return rowToCollection(row);
  }

  createCollection(input, username = "admin") {
    const title = String(input.title || "").trim();
    if (!title) throw new ValidationError("合集标题不能为空");
    const slug = slugify(input.slug || title);
    const status = input.status === "published" ? "published" : "draft";
    const sortOrder = input.sortOrder === "oldest" ? "oldest" : "newest";
    const id = `collection_${randomUUID()}`;
    const timestamp = nowIso();
    try {
      this.db
        .prepare(
          `INSERT INTO collections (
            id, slug, title, description, cover_url, status, sort_order,
            created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          id,
          slug,
          title,
          String(input.description || "").slice(0, 1000),
          String(input.coverUrl || ""),
          status,
          sortOrder,
          timestamp,
          timestamp,
        );
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw new ConflictError("这个合集地址已被使用");
      }
      throw error;
    }
    this.audit("collection.create", username, { collectionId: id, slug });
    return this.getAdminCollection(id);
  }

  updateCollection(id, input, expectedVersion, username = "admin") {
    const current = this.getAdminCollection(id);
    if (!current) throw new NotFoundError("合集不存在");
    if (Number(expectedVersion) !== current.version) throw new ConflictError();
    const title =
      input.title !== undefined ? String(input.title).trim() : current.title;
    if (!title) throw new ValidationError("合集标题不能为空");
    const slug =
      input.slug !== undefined ? slugify(input.slug) : current.slug;
    const description =
      input.description !== undefined
        ? String(input.description).slice(0, 1000)
        : current.description;
    const coverUrl =
      input.coverUrl !== undefined ? String(input.coverUrl) : current.coverUrl;
    const status =
      input.status !== undefined
        ? input.status === "published"
          ? "published"
          : "draft"
        : current.status;
    const sortOrder =
      input.sortOrder !== undefined
        ? input.sortOrder === "oldest"
          ? "oldest"
          : "newest"
        : current.sortOrder;
    try {
      const result = this.db
        .prepare(
          `UPDATE collections SET
            slug = ?, title = ?, description = ?, cover_url = ?, status = ?,
            sort_order = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND version = ? AND deleted_at IS NULL`,
        )
        .run(
          slug,
          title,
          description,
          coverUrl,
          status,
          sortOrder,
          nowIso(),
          id,
          current.version,
        );
      if (result.changes !== 1) throw new ConflictError();
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw new ConflictError("这个合集地址已被使用");
      }
      throw error;
    }
    this.audit("collection.update", username, { collectionId: id });
    return this.getAdminCollection(id);
  }

  updateCollectionWithPosts(
    id,
    input,
    postIds,
    expectedVersion,
    username = "admin",
  ) {
    const current = this.getAdminCollection(id);
    if (!current) throw new NotFoundError("合集不存在");
    if (Number(expectedVersion) !== current.version) throw new ConflictError();
    const title =
      input.title !== undefined ? String(input.title).trim() : current.title;
    if (!title) throw new ValidationError("合集标题不能为空");
    const slug =
      input.slug !== undefined ? slugify(input.slug) : current.slug;
    const description =
      input.description !== undefined
        ? String(input.description).slice(0, 1000)
        : current.description;
    const coverUrl =
      input.coverUrl !== undefined ? String(input.coverUrl) : current.coverUrl;
    const status =
      input.status !== undefined
        ? input.status === "published"
          ? "published"
          : "draft"
        : current.status;
    const sortOrder =
      input.sortOrder !== undefined
        ? input.sortOrder === "oldest"
          ? "oldest"
          : "newest"
        : current.sortOrder;
    const ids = Array.from(
      new Set((Array.isArray(postIds) ? postIds : []).map(String)),
    ).slice(0, 200);
    for (const postId of ids) {
      if (!this.getAdminById(postId)) {
        throw new ValidationError("文章列表中包含不存在的文章");
      }
    }
    const timestamp = nowIso();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db
        .prepare(
          `UPDATE collections SET
            slug = ?, title = ?, description = ?, cover_url = ?, status = ?,
            sort_order = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND version = ? AND deleted_at IS NULL`,
        )
        .run(
          slug,
          title,
          description,
          coverUrl,
          status,
          sortOrder,
          timestamp,
          id,
          current.version,
        );
      if (result.changes !== 1) throw new ConflictError();
      this.db
        .prepare("DELETE FROM collection_posts WHERE collection_id = ?")
        .run(id);
      const insert = this.db.prepare(
        "INSERT INTO collection_posts (collection_id, post_id, created_at) VALUES (?, ?, ?)",
      );
      for (const postId of ids) insert.run(id, postId, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (String(error.message).includes("UNIQUE")) {
        throw new ConflictError("这个合集地址已被使用");
      }
      throw error;
    }
    this.audit("collection.update_with_posts", username, {
      collectionId: id,
      count: ids.length,
    });
    return this.getAdminCollection(id);
  }

  setCollectionPosts(id, postIds, username = "admin", expectedVersion) {
    const collection = this.getAdminCollection(id);
    if (!collection) throw new NotFoundError("合集不存在");
    if (
      expectedVersion !== undefined &&
      Number(expectedVersion) !== collection.version
    ) {
      throw new ConflictError();
    }
    const ids = Array.from(
      new Set((Array.isArray(postIds) ? postIds : []).map(String)),
    ).slice(0, 200);
    for (const postId of ids) {
      if (!this.getAdminById(postId)) {
        throw new ValidationError("文章列表中包含不存在的文章");
      }
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("DELETE FROM collection_posts WHERE collection_id = ?")
        .run(id);
      const insert = this.db.prepare(
        "INSERT INTO collection_posts (collection_id, post_id, created_at) VALUES (?, ?, ?)",
      );
      const timestamp = nowIso();
      for (const postId of ids) insert.run(id, postId, timestamp);
      this.db
        .prepare(
          "UPDATE collections SET updated_at = ?, version = version + 1 WHERE id = ?",
        )
        .run(timestamp, id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.audit("collection.posts.update", username, {
      collectionId: id,
      count: ids.length,
    });
    return this.getAdminCollection(id);
  }

  deleteCollection(id, expectedVersion, username = "admin") {
    const current = this.getAdminCollection(id);
    if (!current) throw new NotFoundError("合集不存在");
    if (Number(expectedVersion) !== current.version) throw new ConflictError();
    const timestamp = nowIso();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "UPDATE collections SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?",
        )
        .run(timestamp, timestamp, id, current.version);
      this.db
        .prepare("DELETE FROM collection_posts WHERE collection_id = ?")
        .run(id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.audit("collection.delete", username, { collectionId: id });
  }

  listPublicMusicAlbums() {
    return this.db
      .prepare(
        `SELECT a.*, COUNT(t.id) AS track_count
         FROM music_albums a
         LEFT JOIN music_tracks t
           ON t.album_id = a.id
          AND t.status = 'published'
          AND t.deleted_at IS NULL
         WHERE a.status = 'published' AND a.deleted_at IS NULL
         GROUP BY a.id
         ORDER BY COALESCE(a.release_date, substr(a.created_at, 1, 10)) DESC,
                  a.created_at DESC`,
      )
      .all()
      .map(rowToMusicAlbum);
  }

  listAdminMusicAlbums() {
    return this.db
      .prepare(
        `SELECT a.*, COUNT(t.id) AS track_count
         FROM music_albums a
         LEFT JOIN music_tracks t
           ON t.album_id = a.id
          AND t.deleted_at IS NULL
         WHERE a.deleted_at IS NULL
         GROUP BY a.id
         ORDER BY a.updated_at DESC`,
      )
      .all()
      .map(rowToMusicAlbum);
  }

  getAdminMusicAlbum(id) {
    const row = this.db
      .prepare(
        `SELECT a.*, COUNT(t.id) AS track_count
         FROM music_albums a
         LEFT JOIN music_tracks t
           ON t.album_id = a.id
          AND t.deleted_at IS NULL
         WHERE a.id = ? AND a.deleted_at IS NULL
         GROUP BY a.id`,
      )
      .get(id);
    const album = rowToMusicAlbum(row);
    if (!album) return null;
    album.tracks = this.db
      .prepare(
        `SELECT t.*, a.slug AS album_slug, a.title AS album_title
         FROM music_tracks t
         JOIN music_albums a ON a.id = t.album_id
         WHERE t.album_id = ? AND t.deleted_at IS NULL
         ORDER BY t.track_number ASC, t.created_at ASC`,
      )
      .all(id)
      .map(rowToMusicTrack);
    return album;
  }

  getPublicMusicAlbumBySlug(slug) {
    const row = this.db
      .prepare(
        `SELECT a.*, COUNT(t.id) AS track_count
         FROM music_albums a
         LEFT JOIN music_tracks t
           ON t.album_id = a.id
          AND t.status = 'published'
          AND t.deleted_at IS NULL
         WHERE a.slug = ? AND a.status = 'published' AND a.deleted_at IS NULL
         GROUP BY a.id`,
      )
      .get(slug);
    const album = rowToMusicAlbum(row);
    if (!album) return null;
    album.tracks = this.db
      .prepare(
        `SELECT t.*, a.slug AS album_slug, a.title AS album_title
         FROM music_tracks t
         JOIN music_albums a ON a.id = t.album_id
         WHERE t.album_id = ?
           AND t.status = 'published'
           AND t.deleted_at IS NULL
         ORDER BY t.track_number ASC, t.created_at ASC`,
      )
      .all(album.id)
      .map(rowToMusicTrack);
    return album;
  }

  listPublicMusicTracks(limit = 300) {
    const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 300));
    return this.db
      .prepare(
        `SELECT t.*, a.slug AS album_slug, a.title AS album_title
         FROM music_tracks t
         JOIN music_albums a ON a.id = t.album_id
         WHERE t.status = 'published'
           AND t.deleted_at IS NULL
           AND a.status = 'published'
           AND a.deleted_at IS NULL
         ORDER BY COALESCE(a.release_date, substr(a.created_at, 1, 10)) DESC,
                  t.track_number ASC,
                  t.created_at ASC
         LIMIT ?`,
      )
      .all(safeLimit)
      .map((row) => rowToMusicTrack(row, { includeLyrics: false }));
  }

  createMusicAlbum(input, username = "admin") {
    const title = normalizeMusicText(input.title, "专辑名称", 160, true);
    const slug = slugify(input.slug || title);
    const artistName = normalizeMusicText(
      input.artistName || "StarsailsClover",
      "歌手名称",
      120,
      true,
    );
    const artistBio = normalizeMusicText(input.artistBio, "歌手简介", 3000);
    const description = normalizeMusicText(input.description, "专辑简介", 5000);
    const coverUrl = normalizeMusicUrl(input.coverUrl, "封面地址");
    const genre = normalizeMusicText(input.genre || "未分类", "流派", 80);
    const releaseDate =
      normalizeMusicReleaseDate(input.releaseDate) ||
      new Date().toISOString().slice(0, 10);
    const status = input.status === "published" ? "published" : "draft";
    const id = `album_${randomUUID()}`;
    const timestamp = nowIso();
    try {
      this.db
        .prepare(
          `INSERT INTO music_albums (
            id, slug, title, artist_name, artist_bio, description, cover_url,
            genre, release_date, status, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          id,
          slug,
          title,
          artistName,
          artistBio,
          description,
          coverUrl,
          genre,
          releaseDate,
          status,
          timestamp,
          timestamp,
        );
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw new ConflictError("这个专辑地址已被使用");
      }
      throw error;
    }
    this.audit("music.album.create", username, { albumId: id, slug });
    return this.getAdminMusicAlbum(id);
  }

  updateMusicAlbum(id, input, expectedVersion, username = "admin") {
    const current = this.getAdminMusicAlbum(id);
    if (!current) throw new NotFoundError("专辑不存在");
    if (Number(expectedVersion) !== current.version) throw new ConflictError();

    const title =
      input.title !== undefined
        ? normalizeMusicText(input.title, "专辑名称", 160, true)
        : current.title;
    const slug =
      input.slug !== undefined ? slugify(input.slug || title) : current.slug;
    const artistName =
      input.artistName !== undefined
        ? normalizeMusicText(input.artistName, "歌手名称", 120, true)
        : current.artistName;
    const artistBio =
      input.artistBio !== undefined
        ? normalizeMusicText(input.artistBio, "歌手简介", 3000)
        : current.artistBio;
    const description =
      input.description !== undefined
        ? normalizeMusicText(input.description, "专辑简介", 5000)
        : current.description;
    const coverUrl =
      input.coverUrl !== undefined
        ? normalizeMusicUrl(input.coverUrl, "封面地址")
        : current.coverUrl;
    const genre =
      input.genre !== undefined
        ? normalizeMusicText(input.genre || "未分类", "流派", 80)
        : current.genre;
    const releaseDate =
      input.releaseDate !== undefined
        ? normalizeMusicReleaseDate(input.releaseDate)
        : current.releaseDate;
    const status =
      input.status !== undefined
        ? input.status === "published"
          ? "published"
          : "draft"
        : current.status;

    try {
      const result = this.db
        .prepare(
          `UPDATE music_albums SET
            slug = ?, title = ?, artist_name = ?, artist_bio = ?,
            description = ?, cover_url = ?, genre = ?, release_date = ?,
            status = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND version = ? AND deleted_at IS NULL`,
        )
        .run(
          slug,
          title,
          artistName,
          artistBio,
          description,
          coverUrl,
          genre,
          releaseDate,
          status,
          nowIso(),
          id,
          current.version,
        );
      if (result.changes !== 1) throw new ConflictError();
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw new ConflictError("这个专辑地址已被使用");
      }
      throw error;
    }
    this.audit("music.album.update", username, {
      albumId: id,
      version: current.version + 1,
    });
    return this.getAdminMusicAlbum(id);
  }

  deleteMusicAlbum(id, expectedVersion, username = "admin") {
    const current = this.getAdminMusicAlbum(id);
    if (!current) throw new NotFoundError("专辑不存在");
    if (Number(expectedVersion) !== current.version) throw new ConflictError();
    const timestamp = nowIso();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `UPDATE music_albums
           SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND version = ?`,
        )
        .run(timestamp, timestamp, id, current.version);
      this.db
        .prepare(
          `UPDATE music_tracks
           SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE album_id = ? AND deleted_at IS NULL`,
        )
        .run(timestamp, timestamp, id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.audit("music.album.delete", username, { albumId: id });
  }

  createMusicTrack(albumId, input, username = "admin") {
    const album = this.getAdminMusicAlbum(albumId);
    if (!album) throw new NotFoundError("专辑不存在");
    const title = normalizeMusicText(input.title, "单曲名称", 180, true);
    const artistName = normalizeMusicText(
      input.artistName || album.artistName,
      "歌手名称",
      120,
      true,
    );
    const coverUrl = normalizeMusicUrl(
      input.coverUrl || album.coverUrl,
      "单曲封面",
    );
    const genre = normalizeMusicText(
      input.genre || album.genre || "未分类",
      "流派",
      80,
    );
    const audioUrl = normalizeMusicUrl(input.audioUrl, "音频地址");
    const status = input.status === "published" ? "published" : "draft";
    if (status === "published" && !audioUrl) {
      throw new ValidationError("公开单曲必须先上传音频");
    }
    const durationSeconds = Math.min(
      86_400,
      Math.max(0, Math.round(Number(input.durationSeconds) || 0)),
    );
    const trackNumber = Math.min(
      999,
      Math.max(1, Math.round(Number(input.trackNumber) || album.tracks.length + 1)),
    );
    const lyricsLrc = normalizeLrc(input.lyricsLrc);
    const translationLrc = normalizeLrc(input.translationLrc);
    const id = `track_${randomUUID()}`;
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO music_tracks (
          id, album_id, title, artist_name, cover_url, genre, audio_url,
          duration_seconds, track_number, lyrics_lrc, translation_lrc,
          status, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        id,
        albumId,
        title,
        artistName,
        coverUrl,
        genre,
        audioUrl,
        durationSeconds,
        trackNumber,
        lyricsLrc,
        translationLrc,
        status,
        timestamp,
        timestamp,
      );
    this.audit("music.track.create", username, { albumId, trackId: id });
    return this.getAdminMusicAlbum(albumId);
  }

  updateMusicTrack(id, input, expectedVersion, username = "admin") {
    const row = this.db
      .prepare(
        `SELECT t.*, a.slug AS album_slug, a.title AS album_title
         FROM music_tracks t
         JOIN music_albums a ON a.id = t.album_id
         WHERE t.id = ? AND t.deleted_at IS NULL AND a.deleted_at IS NULL`,
      )
      .get(id);
    const current = rowToMusicTrack(row);
    if (!current) throw new NotFoundError("单曲不存在");
    if (Number(expectedVersion) !== current.version) throw new ConflictError();

    const title =
      input.title !== undefined
        ? normalizeMusicText(input.title, "单曲名称", 180, true)
        : current.title;
    const artistName =
      input.artistName !== undefined
        ? normalizeMusicText(input.artistName, "歌手名称", 120, true)
        : current.artistName;
    const coverUrl =
      input.coverUrl !== undefined
        ? normalizeMusicUrl(input.coverUrl, "单曲封面")
        : current.coverUrl;
    const genre =
      input.genre !== undefined
        ? normalizeMusicText(input.genre || "未分类", "流派", 80)
        : current.genre;
    const audioUrl =
      input.audioUrl !== undefined
        ? normalizeMusicUrl(input.audioUrl, "音频地址")
        : current.audioUrl;
    const status =
      input.status !== undefined
        ? input.status === "published"
          ? "published"
          : "draft"
        : current.status;
    if (status === "published" && !audioUrl) {
      throw new ValidationError("公开单曲必须先上传音频");
    }
    const durationSeconds =
      input.durationSeconds !== undefined
        ? Math.min(
            86_400,
            Math.max(0, Math.round(Number(input.durationSeconds) || 0)),
          )
        : current.durationSeconds;
    const trackNumber =
      input.trackNumber !== undefined
        ? Math.min(
            999,
            Math.max(1, Math.round(Number(input.trackNumber) || 1)),
          )
        : current.trackNumber;
    const lyricsLrc =
      input.lyricsLrc !== undefined
        ? normalizeLrc(input.lyricsLrc)
        : current.lyricsLrc;
    const translationLrc =
      input.translationLrc !== undefined
        ? normalizeLrc(input.translationLrc)
        : current.translationLrc;

    const result = this.db
      .prepare(
        `UPDATE music_tracks SET
          title = ?, artist_name = ?, cover_url = ?, genre = ?, audio_url = ?,
          duration_seconds = ?, track_number = ?, lyrics_lrc = ?,
          translation_lrc = ?, status = ?, updated_at = ?,
          version = version + 1
         WHERE id = ? AND version = ? AND deleted_at IS NULL`,
      )
      .run(
        title,
        artistName,
        coverUrl,
        genre,
        audioUrl,
        durationSeconds,
        trackNumber,
        lyricsLrc,
        translationLrc,
        status,
        nowIso(),
        id,
        current.version,
      );
    if (result.changes !== 1) throw new ConflictError();
    this.audit("music.track.update", username, {
      albumId: current.albumId,
      trackId: id,
      version: current.version + 1,
    });
    return this.getAdminMusicAlbum(current.albumId);
  }

  deleteMusicTrack(id, expectedVersion, username = "admin") {
    const row = this.db
      .prepare("SELECT * FROM music_tracks WHERE id = ? AND deleted_at IS NULL")
      .get(id);
    const current = rowToMusicTrack(row);
    if (!current) throw new NotFoundError("单曲不存在");
    if (Number(expectedVersion) !== current.version) throw new ConflictError();
    const timestamp = nowIso();
    this.db
      .prepare(
        `UPDATE music_tracks
         SET deleted_at = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .run(timestamp, timestamp, id, current.version);
    this.audit("music.track.delete", username, {
      albumId: current.albumId,
      trackId: id,
    });
    return this.getAdminMusicAlbum(current.albumId);
  }

  addMedia(record) {
    const id = `media_${randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO media (
          id, filename, original_name, mime_type, kind, bytes, width, height, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        record.filename,
        record.originalName,
        record.mimeType,
        record.kind,
        record.bytes,
        record.width ?? null,
        record.height ?? null,
        nowIso(),
      );
    return this.getMedia(id);
  }

  listMedia(limit = 100) {
    return this.db
      .prepare("SELECT * FROM media ORDER BY created_at DESC LIMIT ?")
      .all(Math.min(200, Math.max(1, Number(limit) || 100)))
      .map(rowToMedia);
  }

  getMedia(id) {
    return rowToMedia(
      this.db.prepare("SELECT * FROM media WHERE id = ?").get(id),
    );
  }

  findMediaReferences(id) {
    const media = this.getMedia(id);
    if (!media) throw new NotFoundError("媒体文件不存在");
    const needle = `%${media.url}%`;
    const posts = this.db
      .prepare(
        `SELECT id, title FROM posts
         WHERE deleted_at IS NULL
           AND (cover_url = ? OR body_markdown LIKE ? OR body_html LIKE ?)
         ORDER BY updated_at DESC`,
      )
      .all(media.url, needle, needle);
    const collections = this.db
      .prepare(
        `SELECT id, title FROM collections
         WHERE deleted_at IS NULL AND cover_url = ?
         ORDER BY updated_at DESC`,
      )
      .all(media.url);
    const albums = this.db
      .prepare(
        `SELECT id, title FROM music_albums
         WHERE deleted_at IS NULL AND cover_url = ?
         ORDER BY updated_at DESC`,
      )
      .all(media.url);
    const tracks = this.db
      .prepare(
        `SELECT id, title FROM music_tracks
         WHERE deleted_at IS NULL AND (cover_url = ? OR audio_url = ?)
         ORDER BY updated_at DESC`,
      )
      .all(media.url, media.url);
    return {
      total:
        posts.length + collections.length + albums.length + tracks.length,
      posts,
      collections,
      albums,
      tracks,
    };
  }

  deleteMedia(id, username = "admin") {
    const media = this.getMedia(id);
    if (!media) throw new NotFoundError("媒体文件不存在");
    this.db.prepare("DELETE FROM media WHERE id = ?").run(id);
    this.audit("media.delete", username, { mediaId: id, filename: media.filename });
    return media;
  }

  getTagDetails(tag) {
    const safeTag = String(tag || "").trim().slice(0, 24);
    if (!safeTag) throw new NotFoundError("标签不存在");
    const data = this.listPublished({ tag: safeTag, limit: 50 });
    if (data.total === 0) throw new NotFoundError("标签不存在");
    return {
      tag: safeTag,
      count: data.total,
      posts: data.posts,
      description: `关于「${safeTag}」的文章、记录与阶段性思考。`,
    };
  }

  markDuePosts() {
    const now = nowIso();
    this.db
      .prepare(
        "UPDATE posts SET status = 'published', updated_at = ? WHERE status = 'scheduled' AND published_at IS NOT NULL AND published_at <= ? AND deleted_at IS NULL",
      )
      .run(now, now);
  }

  listPublished({ limit = 20, offset = 0, tag = "", q = "" } = {}) {
    this.markDuePosts();
    const clauses = [
      "deleted_at IS NULL",
      "status = 'published'",
      "published_at IS NOT NULL",
      "published_at <= ?",
    ];
    const params = [nowIso()];
    if (tag) {
      clauses.push("tags_json LIKE ? ESCAPE '\\'");
      params.push(`%\"${escapeLike(tag.replaceAll('"', ''))}\"%`);
    }
    if (q) {
      clauses.push("(title LIKE ? OR excerpt LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const safeOffset = Math.max(0, Number(offset) || 0);
    params.push(safeLimit, safeOffset);
    const rows = this.db
      .prepare(
        `SELECT * FROM posts WHERE ${clauses.join(" AND ")} ORDER BY featured DESC, published_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params);
    const total = this.db
      .prepare(`SELECT COUNT(*) AS count FROM posts WHERE ${clauses.join(" AND ")}`)
      .get(...params.slice(0, -2)).count;
    return {
      posts: rows.map((row) => rowToPost(row, { includeBody: false })),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  getPublishedBySlug(slug) {
    this.markDuePosts();
    const row = this.db
      .prepare(
        "SELECT * FROM posts WHERE slug = ? AND status = 'published' AND published_at <= ? AND deleted_at IS NULL",
      )
      .get(slug, nowIso());
    return rowToPost(row);
  }

  listAdmin({ status = "", q = "", limit = 100 } = {}) {
    const clauses = ["deleted_at IS NULL"];
    const params = [];
    if (status && status !== "all") {
      clauses.push("status = ?");
      params.push(status);
    }
    if (q) {
      clauses.push("(title LIKE ? OR excerpt LIKE ? OR slug LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    params.push(safeLimit);
    const rows = this.db
      .prepare(
        `SELECT * FROM posts WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(...params);
    return rows.map((row) => rowToPost(row, { includeBody: false }));
  }

  getAdminById(id) {
    const row = this.db
      .prepare("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL")
      .get(id);
    return rowToPost(row);
  }

  getAdminBySlug(slug) {
    const row = this.db
      .prepare("SELECT * FROM posts WHERE slug = ? AND deleted_at IS NULL")
      .get(slug);
    return rowToPost(row);
  }

  saveRevision(post, username) {
    this.db
      .prepare(
        "INSERT INTO post_revisions (post_id, version, snapshot_json, created_at, created_by) VALUES (?, ?, ?, ?, ?)",
      )
      .run(post.id, post.version, revisionSnapshot(post), nowIso(), username);
    this.db
      .prepare(
        `DELETE FROM post_revisions
         WHERE post_id = ? AND id NOT IN (
           SELECT id FROM post_revisions WHERE post_id = ? ORDER BY id DESC LIMIT 20
         )`,
      )
      .run(post.id, post.id);
  }

  createPost(input, username = "admin") {
    const normalized = normalizePostInput(input, { partial: false });
    const timestamp = nowIso();
    const id = `post_${randomUUID()}`;
    const title = normalized.title;
    const slug = normalized.slug || slugify(title);
    const bodyMarkdown = normalized.bodyMarkdown || "";
    const bodyHtml = renderMarkdown(bodyMarkdown);
    const description =
      normalized.description || excerptFromMarkdown(bodyMarkdown);
    const status = normalized.status || "draft";
    const publishedAt =
      normalized.publishedAt ??
      (status === "published" ? timestamp : null);

    try {
      this.db
        .prepare(
          `INSERT INTO posts (
            id, slug, title, excerpt, body_markdown, body_html, cover_url,
            tags_json, status, featured, published_at, created_at, updated_at,
            version, reading_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        )
        .run(
          id,
          slug,
          title,
          description,
          bodyMarkdown,
          bodyHtml,
          normalized.coverUrl || "",
          JSON.stringify(normalized.tags || []),
          status,
          normalized.featured ? 1 : 0,
          publishedAt,
          timestamp,
          timestamp,
          readingMinutes(bodyMarkdown),
        );
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw new ConflictError("这个文章地址已被使用");
      }
      throw error;
    }

    this.audit("post.create", username, { postId: id, slug });
    return this.getAdminById(id);
  }

  updatePost(id, input, expectedVersion, username = "admin") {
    const current = this.getAdminById(id);
    if (!current) throw new NotFoundError();
    if (Number(expectedVersion) !== current.version) throw new ConflictError();

    const normalized = normalizePostInput(input, { partial: true });
    const merged = {
      title: normalized.title ?? current.title,
      slug: normalized.slug ?? current.slug,
      description: normalized.description ?? current.description,
      bodyMarkdown: normalized.bodyMarkdown ?? current.bodyMarkdown,
      bodyHtml:
        normalized.bodyMarkdown !== undefined
          ? renderMarkdown(normalized.bodyMarkdown)
          : current.bodyHtml,
      coverUrl: normalized.coverUrl ?? current.coverUrl,
      tags: normalized.tags ?? current.tags,
      status: normalized.status ?? current.status,
      featured: normalized.featured ?? current.featured,
      publishedAt: normalized.publishedAt ?? current.publishedAt,
    };
    if (!merged.description) {
      merged.description = excerptFromMarkdown(merged.bodyMarkdown);
    }
    if (merged.status === "published" && !merged.publishedAt) {
      merged.publishedAt = nowIso();
    }
    const updatedAt = nowIso();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.saveRevision(current, username);
      const result = this.db
        .prepare(
          `UPDATE posts SET
            slug = ?, title = ?, excerpt = ?, body_markdown = ?, body_html = ?,
            cover_url = ?, tags_json = ?, status = ?, featured = ?,
            published_at = ?, updated_at = ?, version = version + 1,
            reading_minutes = ?
          WHERE id = ? AND version = ? AND deleted_at IS NULL`,
        )
        .run(
          merged.slug,
          merged.title,
          merged.description,
          merged.bodyMarkdown,
          merged.bodyHtml,
          merged.coverUrl || "",
          JSON.stringify(merged.tags),
          merged.status,
          merged.featured ? 1 : 0,
          merged.publishedAt,
          updatedAt,
          readingMinutes(merged.bodyMarkdown),
          id,
          current.version,
        );
      if (result.changes !== 1) throw new ConflictError();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (String(error.message).includes("UNIQUE")) {
        throw new ConflictError("这个文章地址已被使用");
      }
      throw error;
    }

    this.audit("post.update", username, { postId: id, version: current.version + 1 });
    return this.getAdminById(id);
  }

  setStatus(id, status, expectedVersion, username, publishedAt) {
    return this.updatePost(
      id,
      {
        status,
        expectedVersion,
        ...(publishedAt !== undefined ? { publishedAt } : {}),
      },
      expectedVersion,
      username,
    );
  }

  duplicatePost(id, username = "admin") {
    const source = this.getAdminById(id);
    if (!source) throw new NotFoundError();
    return this.createPost(
      {
        title: `${source.title}（副本）`,
        slug: `${source.slug}-copy-${Date.now().toString(36)}`,
        description: source.description,
        bodyMarkdown: source.bodyMarkdown,
        coverUrl: source.coverUrl,
        tags: source.tags,
        status: "draft",
      },
      username,
    );
  }

  deletePost(id, expectedVersion, username = "admin") {
    const current = this.getAdminById(id);
    if (!current) throw new NotFoundError();
    if (Number(expectedVersion) !== current.version) throw new ConflictError();
    const timestamp = nowIso();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.saveRevision(current, username);
      this.db
        .prepare(
          "UPDATE posts SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?",
        )
        .run(timestamp, timestamp, id, current.version);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.audit("post.delete", username, { postId: id });
  }

  listRevisions(id) {
    return this.db
      .prepare(
        "SELECT id, version, created_at, created_by FROM post_revisions WHERE post_id = ? ORDER BY id DESC LIMIT 20",
      )
      .all(id)
      .map((row) => ({
        id: row.id,
        version: row.version,
        createdAt: row.created_at,
        createdBy: row.created_by,
      }));
  }

  restoreRevision(id, revisionId, expectedVersion, username = "admin") {
    const current = this.getAdminById(id);
    if (!current) throw new NotFoundError();
    if (Number(expectedVersion) !== current.version) throw new ConflictError();
    const revision = this.db
      .prepare("SELECT snapshot_json FROM post_revisions WHERE id = ? AND post_id = ?")
      .get(revisionId, id);
    if (!revision) throw new NotFoundError("历史版本不存在");
    const snapshot = safeJson(revision.snapshot_json, null);
    if (!snapshot) throw new NotFoundError("历史版本已损坏");
    return this.updatePost(
      id,
      {
        title: snapshot.title,
        slug: snapshot.slug,
        description: snapshot.description,
        bodyMarkdown: snapshot.bodyMarkdown,
        coverUrl: snapshot.coverUrl,
        tags: snapshot.tags,
        status: snapshot.status,
        featured: snapshot.featured,
        publishedAt: snapshot.publishedAt,
        expectedVersion,
      },
      expectedVersion,
      username,
    );
  }

  createSession({ tokenHash, username, csrfToken, now, expiresAt }) {
    this.db
      .prepare(
        "INSERT INTO admin_sessions (token_hash, username, csrf_token, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(tokenHash, username, csrfToken, now, now, expiresAt);
  }

  getSession(tokenHash) {
    return (
      this.db
        .prepare("SELECT * FROM admin_sessions WHERE token_hash = ?")
        .get(tokenHash) || null
    );
  }

  touchSession(tokenHash, now) {
    this.db
      .prepare("UPDATE admin_sessions SET last_seen = ? WHERE token_hash = ?")
      .run(now, tokenHash);
  }

  deleteSession(tokenHash) {
    this.db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
  }

  checkLoginBlock(ipHash, username, now) {
    const row = this.db
      .prepare(
        "SELECT failures, window_start, blocked_until FROM auth_attempts WHERE ip_hash = ? AND username = ?",
      )
      .get(ipHash, username);
    if (!row) return null;
    if (row.blocked_until > now) return Math.ceil((row.blocked_until - now) / 1000);
    return null;
  }

  recordLoginFailure(ipHash, username, now) {
    const windowMs = 15 * 60 * 1000;
    const blockMs = 15 * 60 * 1000;
    const row = this.db
      .prepare(
        "SELECT failures, window_start, blocked_until FROM auth_attempts WHERE ip_hash = ? AND username = ?",
      )
      .get(ipHash, username);
    if (!row || now - row.window_start > windowMs) {
      this.db
        .prepare(
          `INSERT INTO auth_attempts (ip_hash, username, failures, window_start, blocked_until)
           VALUES (?, ?, 1, ?, 0)
           ON CONFLICT(ip_hash, username) DO UPDATE SET failures = 1, window_start = excluded.window_start, blocked_until = 0`,
        )
        .run(ipHash, username, now);
      return 0;
    }
    const failures = row.failures + 1;
    const blockedUntil = failures >= 5 ? now + blockMs : 0;
    this.db
      .prepare(
        "UPDATE auth_attempts SET failures = ?, blocked_until = ? WHERE ip_hash = ? AND username = ?",
      )
      .run(failures, blockedUntil, ipHash, username);
    return blockedUntil ? Math.ceil(blockMs / 1000) : 0;
  }

  clearLoginFailures(ipHash, username) {
    this.db
      .prepare("DELETE FROM auth_attempts WHERE ip_hash = ? AND username = ?")
      .run(ipHash, username);
  }

  audit(event, username, metadata = {}, context = {}) {
    this.db
      .prepare(
        "INSERT INTO admin_audit (event, username, ip_hash, user_agent, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        event,
        username || null,
        context.ipHash || null,
        String(context.userAgent || "").slice(0, 500),
        JSON.stringify(metadata),
        nowIso(),
      );
  }

  cleanup(now = Date.now()) {
    this.db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(now);
    this.db
      .prepare("DELETE FROM auth_attempts WHERE window_start < ?")
      .run(now - 24 * 60 * 60 * 1000);
    this.db
      .prepare("DELETE FROM post_revisions WHERE created_at < ?")
      .run(new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString());
  }
}
