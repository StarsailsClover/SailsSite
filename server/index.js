import http from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { seedPosts } from "./seed.js";
import { hashPassword } from "./security.js";

const config = loadConfig();
if (!config.adminPasswordHash && process.env.ADMIN_PASSWORD) {
  config.adminPasswordHash = await hashPassword(process.env.ADMIN_PASSWORD);
}
if (!config.adminPasswordHash) {
  throw new Error("ADMIN_PASSWORD_HASH or ADMIN_PASSWORD is required");
}

const app = createApp(config);
const seeded = app.db.seedIfEmpty(seedPosts);
const server = http.createServer(app.handler);

server.listen(config.port, config.host, () => {
  console.log(
    `[sails-site] listening on http://${config.host}:${config.port}${seeded ? " (seeded)" : ""}`,
  );
});

function shutdown(signal) {
  console.log(`[sails-site] ${signal}, shutting down`);
  server.close(() => {
    app.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
