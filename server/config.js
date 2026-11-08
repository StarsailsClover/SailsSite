import path from "node:path";

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(overrides = {}) {
  const production = (overrides.nodeEnv || process.env.NODE_ENV) === "production";
  const config = {
    nodeEnv: production ? "production" : "development",
    host: process.env.HOST || "127.0.0.1",
    port: integer(process.env.PORT, 8788),
    databasePath: path.resolve(
      process.env.DATABASE_PATH || path.join(process.cwd(), "data", "site.db"),
    ),
    uploadsDir: path.resolve(
      process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads"),
    ),
    distDir: path.resolve(
      process.env.SITE_DIST_DIR || path.join(process.cwd(), "dist"),
    ),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || "https://sails.oxygenai.top",
    adminHosts: (process.env.ADMIN_HOSTS || "sails-gg.oxygenai.top")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    adminUsername: process.env.ADMIN_USERNAME || "sails",
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
    secureCookies: production,
    trustProxy: process.env.TRUST_PROXY !== "0",
    ipHashSecret:
      process.env.IP_HASH_SECRET ||
      process.env.ADMIN_PASSWORD_HASH ||
      process.env.ADMIN_PASSWORD ||
      "",
    sessionCookieName: production ? "__Host-sails_session" : "sails_session",
    sessionMaxAgeMs: 14 * 24 * 60 * 60 * 1000,
    sessionIdleMs: 8 * 60 * 60 * 1000,
    apiVersion: "1",
    jsonLimit: 2 * 1024 * 1024,
    uploadLimit: 20 * 1024 * 1024,
    mediaLimit: 200 * 1024 * 1024,
    githubUser: process.env.GITHUB_USER || "StarsailsClover",
    xHandle: process.env.X_HANDLE || "sailshuang_",
  };

  Object.assign(config, overrides);
  if (config.nodeEnv === "production" && !config.adminPasswordHash) {
    throw new Error("ADMIN_PASSWORD_HASH is required in production");
  }
  if (!config.ipHashSecret) {
    throw new Error("IP_HASH_SECRET or ADMIN_PASSWORD_HASH is required");
  }
  return config;
}
