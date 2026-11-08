import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createApp } from "./app.js";
import { seedPosts } from "./seed.js";
import { hashPassword } from "./security.js";

test("public and admin API flow", async (t) => {
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
  assert.equal(collectionDetail.posts[0].id, published.id);

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
