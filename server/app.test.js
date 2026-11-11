import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createApp } from "./app.js";
import { renderMarkdown } from "./content.js";
import { seedPosts } from "./seed.js";
import { hashPassword } from "./security.js";

function makeWav(seconds = 1, sampleRate = 8000) {
  const samples = seconds * sampleRate;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

test("public and admin API flow", async (t) => {
  assert.match(
    renderMarkdown("![视频](/uploads/example.mp4)"),
    /<video[^>]+controls/,
  );
  const temp = mkdtempSync(path.join(os.tmpdir(), "sails-site-test-"));
  const distDir = path.join(temp, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(
    path.join(distDir, "index.html"),
    "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>",
  );
  const adminPasswordHash = await hashPassword("correct-horse-battery-staple");
  const app = createApp({
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    databasePath: path.join(temp, "site.db"),
    uploadsDir: path.join(temp, "uploads"),
    distDir,
    publicBaseUrl: "https://sails.example.test",
    adminHosts: ["127.0.0.1"],
    adminUsername: "sails",
    adminPasswordHash,
    secureCookies: false,
    trustProxy: false,
    ipHashSecret: "test-secret",
    sessionCookieName: "sails_session",
    sessionMaxAgeMs: 60_000,
    sessionIdleMs: 60_000,
    apiVersion: "1",
    jsonLimit: 2 * 1024 * 1024,
    uploadLimit: 12 * 1024 * 1024,
    mediaLimit: 32 * 1024 * 1024,
  });
  app.db.seedIfEmpty(seedPosts);
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const api = (pathname, options = {}) =>
    fetch(`${base}${pathname}`, {
      ...options,
      headers: {
        Origin: base,
        "X-Sails-API-Version": "1",
        ...(options.headers || {}),
      },
    });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.close();
    rmSync(temp, { recursive: true, force: true });
  });

  let response = await fetch(`${base}/api/v1/posts`);
  assert.equal(response.status, 426);
  response = await fetch(`${base}/api/v1/admin/session`);
  assert.equal(response.status, 426);

  response = await api("/api/v1/posts");
  assert.equal(response.status, 200);
  const publicList = await response.json();
  assert.equal(publicList.posts.length, 3);

  response = await api("/api/v1/site-text");
  assert.equal(response.status, 200);
  assert.ok((await response.json()).text.home.title);

  response = await fetch(`${base}/blog`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /sails-site-text/);

  response = await api("/api/v1/posts/local-first-editor");
  assert.equal(response.status, 200);
  const publicPost = await response.json();
  assert.match(publicPost.post.bodyHtml, /本地优先的写作台/);

  response = await api("/api/v1/admin/session");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).authenticated, false);

  response = await api("/api/v1/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "sails", password: "wrong-password" }),
  });
  assert.equal(response.status, 401);

  response = await api("/api/v1/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "sails",
      password: "correct-horse-battery-staple",
    }),
  });
  assert.equal(response.status, 200);
  const login = await response.json();
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.ok(login.csrfToken);

  const adminHeaders = {
    Cookie: cookie,
    "Content-Type": "application/json",
  };

  response = await api("/api/v1/admin/posts", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      title: "测试文章",
      slug: "test-article",
      bodyMarkdown: "# Hello\n\n<script>alert(1)</script>\n\n正文。",
      tags: ["Test"],
      status: "draft",
    }),
  });
  assert.equal(response.status, 403);

  response = await api("/api/v1/admin/posts", {
    method: "POST",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      title: "测试文章",
      slug: "test-article",
      bodyMarkdown: "# Hello\n\n<script>alert(1)</script>\n\n正文。",
      tags: ["Test"],
      status: "draft",
    }),
  });
  assert.equal(response.status, 201);
  const created = (await response.json()).post;
  assert.doesNotMatch(created.bodyHtml, /<script/i);

  response = await api(`/api/v1/admin/posts/${created.id}`, {
    method: "PATCH",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      title: "测试文章更新",
      expectedVersion: created.version,
    }),
  });
  assert.equal(response.status, 200);
  const updated = (await response.json()).post;
  assert.equal(updated.version, created.version + 1);

  response = await api(`/api/v1/admin/posts/${created.id}`, {
    method: "PATCH",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      title: "过期写入",
      expectedVersion: created.version,
    }),
  });
  assert.equal(response.status, 409);

  response = await api(`/api/v1/admin/posts/${created.id}/publish`, {
    method: "POST",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({ expectedVersion: updated.version }),
  });
  assert.equal(response.status, 200);
  const published = (await response.json()).post;
  assert.equal(published.status, "published");

  response = await api("/api/v1/posts/test-article");
  assert.equal(response.status, 200);

  response = await api("/api/v1/tags/Test");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).tag, "Test");

  response = await api("/api/v1/admin/site-text", {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  const siteText = (await response.json()).text;
  siteText.nav.villa = "Home";
  response = await api("/api/v1/admin/site-text", {
    method: "PUT",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({ text: siteText }),
  });
  assert.equal(response.status, 200);
  response = await api("/api/v1/site-text");
  assert.equal((await response.json()).text.nav.villa, "Home");

  response = await api("/api/v1/admin/collections", {
    method: "POST",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      title: "测试合集",
      slug: "test-collection",
      description: "合集简介",
      status: "draft",
      sortOrder: "newest",
    }),
  });
  assert.equal(response.status, 201);
  let collection = (await response.json()).collection;
  response = await api(`/api/v1/admin/collections/${collection.id}`, {
    method: "PATCH",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      status: "published",
      sortOrder: "oldest",
      expectedVersion: collection.version,
    }),
  });
  assert.equal(response.status, 200);
  collection = (await response.json()).collection;
  response = await api(`/api/v1/admin/collections/${collection.id}/posts`, {
    method: "PUT",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      postIds: [published.id],
      expectedVersion: collection.version,
    }),
  });
  assert.equal(response.status, 200);
  collection = (await response.json()).collection;
  response = await api("/api/v1/collections/test-collection");
  assert.equal(response.status, 200);
  const collectionDetail = await response.json();
  assert.equal(collectionDetail.collection.description, "合集简介");
  assert.equal(
    collectionDetail.collection.postCount,
    collectionDetail.posts.length,
  );
  assert.equal(collectionDetail.posts[0].id, published.id);
  response = await api(`/api/v1/admin/collections/${collection.id}`, {
    method: "PATCH",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      description: "原子合集更新",
      postIds: [published.id],
      expectedVersion: collection.version,
    }),
  });
  assert.equal(response.status, 200);
  collection = (await response.json()).collection;
  assert.equal(collection.description, "原子合集更新");

  response = await api("/api/v1/admin/music/albums", {
    method: "POST",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      title: "测试唱片",
      slug: "test-record",
      artistName: "StarsailsClover",
      artistBio: "独立创作者。",
      description: "一张用于 API 测试的唱片。",
      coverUrl: "",
      genre: "Ambient",
      releaseDate: "2026-11-11",
      status: "draft",
    }),
  });
  assert.equal(response.status, 201);
  let musicAlbum = (await response.json()).album;
  response = await api(`/api/v1/admin/music/albums/${musicAlbum.id}`, {
    method: "PATCH",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      status: "published",
      expectedVersion: musicAlbum.version,
    }),
  });
  assert.equal(response.status, 200);
  musicAlbum = (await response.json()).album;

  response = await api("/api/v1/music/albums");
  assert.equal(response.status, 200);
  assert.ok((await response.json()).albums.some((album) => album.slug === "test-record"));

  response = await api(`/api/v1/admin/music/albums/${musicAlbum.id}/tracks`, {
    method: "POST",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      title: "雨线",
      artistName: "StarsailsClover",
      coverUrl: "",
      genre: "Ambient",
      audioUrl: "",
      durationSeconds: 0,
      trackNumber: 1,
      lyricsLrc: "[00:00.00]雨落在屋檐\n[00:08.50]Light through the mist",
      translationLrc: "[00:00.00]雨落在屋檐\n[00:08.50]光穿过薄雾",
      status: "draft",
    }),
  });
  assert.equal(response.status, 201);
  musicAlbum = (await response.json()).album;
  let musicTrack = musicAlbum.tracks.find((track) => track.title === "雨线");
  assert.ok(musicTrack);

  response = await api(`/api/v1/admin/music/tracks/${musicTrack.id}`, {
    method: "PATCH",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      status: "published",
      expectedVersion: musicTrack.version,
    }),
  });
  assert.equal(response.status, 400);

  const audioWav = makeWav();
  response = await api("/api/v1/admin/media", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "X-CSRF-Token": login.csrfToken,
      "Content-Type": "audio/wav",
      "X-File-Name": "rain-line.wav",
    },
    body: audioWav,
  });
  assert.equal(response.status, 201);
  const audioUpload = await response.json();
  const audioMedia = audioUpload.media;
  assert.equal(audioMedia.kind, "audio");
  assert.ok(audioUpload.durationSeconds >= 1);
  const damagedMp3 = Buffer.concat([
    Buffer.from("ID3", "ascii"),
    Buffer.alloc(128, 0x41),
  ]);
  response = await api("/api/v1/admin/media", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "X-CSRF-Token": login.csrfToken,
      "Content-Type": "audio/mpeg",
      "X-File-Name": "damaged.mp3",
    },
    body: damagedMp3,
  });
  assert.equal(response.status, 415);
  assert.equal((await response.json()).error, "invalid_audio");
  response = await fetch(`${base}${audioMedia.url}`, {
    headers: { Range: "bytes=0-6" },
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "audio/wav");

  response = await api(`/api/v1/admin/music/tracks/${musicTrack.id}`, {
    method: "PATCH",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({
      audioUrl: audioMedia.url,
      durationSeconds: 72,
      status: "published",
      expectedVersion: musicTrack.version,
    }),
  });
  assert.equal(response.status, 200);
  musicAlbum = (await response.json()).album;
  musicTrack = musicAlbum.tracks.find((track) => track.id === musicTrack.id);
  assert.equal(musicTrack.audioUrl, audioMedia.url);

  response = await api("/api/v1/music/albums/test-record");
  assert.equal(response.status, 200);
  const publicMusicAlbum = (await response.json()).album;
  assert.equal(publicMusicAlbum.tracks[0].title, "雨线");
  assert.match(publicMusicAlbum.tracks[0].lyricsLrc, /\[00:08\.50\]/);
  assert.match(publicMusicAlbum.tracks[0].translationLrc, /光穿过薄雾/);
  response = await api("/api/v1/music/tracks");
  assert.equal(response.status, 200);
  const publicPlayerTracks = (await response.json()).tracks;
  assert.ok(publicPlayerTracks.some((track) => track.id === musicTrack.id));
  assert.equal(
    publicPlayerTracks.find((track) => track.id === musicTrack.id).lyricsLrc,
    "",
  );
  response = await api(`/api/v1/admin/media/${audioMedia.id}`, {
    method: "DELETE",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: "{}",
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "media_in_use");

  const png = await sharp({
    create: {
      width: 320,
      height: 180,
      channels: 3,
      background: "#1b2a2f",
    },
  })
    .png()
    .toBuffer();
  response = await api("/api/v1/admin/uploads", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "X-CSRF-Token": login.csrfToken,
      "Content-Type": "image/png",
    },
    body: png,
  });
  assert.equal(response.status, 201);
  const upload = await response.json();
  assert.match(upload.url, /^\/uploads\/.+\.webp$/);

  response = await fetch(`${base}${upload.url}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");

  response = await api("/api/v1/admin/media", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "X-CSRF-Token": login.csrfToken,
      "Content-Type": "image/png",
      "X-File-Name": encodeURIComponent("测试图片.png"),
    },
    body: png,
  });
  assert.equal(response.status, 201);
  const imageMedia = (await response.json()).media;
  assert.equal(imageMedia.kind, "image");
  response = await fetch(`${base}${imageMedia.url}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");

  const fakeMp4 = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
  ]);
  response = await api("/api/v1/admin/media", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "X-CSRF-Token": login.csrfToken,
      "Content-Type": "video/mp4",
      "X-File-Name": "clip.mp4",
    },
    body: fakeMp4,
  });
  assert.equal(response.status, 201);
  const videoMedia = (await response.json()).media;
  assert.equal(videoMedia.kind, "video");
  response = await fetch(`${base}${videoMedia.url}`, {
    headers: { Range: "bytes=0-3" },
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), `bytes 0-3/${fakeMp4.length}`);

  response = await api(`/api/v1/admin/media/${imageMedia.id}`, {
    method: "DELETE",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: "{}",
  });
  assert.equal(response.status, 204);
  response = await api(`/api/v1/admin/media/${videoMedia.id}`, {
    method: "DELETE",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: "{}",
  });
  assert.equal(response.status, 204);

  response = await api(`/api/v1/admin/music/tracks/${musicTrack.id}`, {
    method: "DELETE",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({ expectedVersion: musicTrack.version }),
  });
  assert.equal(response.status, 200);
  response = await api(`/api/v1/admin/music/albums/${musicAlbum.id}`, {
    method: "DELETE",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({ expectedVersion: musicAlbum.version }),
  });
  assert.equal(response.status, 204);
  response = await api(`/api/v1/admin/media/${audioMedia.id}`, {
    method: "DELETE",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: "{}",
  });
  assert.equal(response.status, 204);

  response = await api(`/api/v1/admin/collections/${collection.id}`, {
    method: "DELETE",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: JSON.stringify({ expectedVersion: collection.version }),
  });
  assert.equal(response.status, 204);

  response = await api("/api/v1/admin/posts?status=all", {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  assert.ok((await response.json()).posts.length >= 4);

  response = await api("/api/v1/admin/logout", {
    method: "POST",
    headers: { ...adminHeaders, "X-CSRF-Token": login.csrfToken },
    body: "{}",
  });
  assert.equal(response.status, 204);

  response = await api("/api/v1/admin/session", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).authenticated, false);
});
