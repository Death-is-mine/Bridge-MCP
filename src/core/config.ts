import "dotenv/config";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  nodeEnv: optional("NODE_ENV", "development"),
  opencode: {
    baseUrl: optional("OPENCODE_BASE_URL", "http://127.0.0.1:4096"),
    username: process.env.OPENCODE_SERVER_USERNAME || "",
    password: process.env.OPENCODE_SERVER_PASSWORD || "",
    timeoutMs: parseInt(optional("OPENCODE_TIMEOUT_MS", "30000"), 10),
  },
  bridge: {
    host: optional("BRIDGE_HOST", "0.0.0.0"),
    port: parseInt(optional("BRIDGE_PORT", "3000"), 10),
    publicUrl: optional("BRIDGE_PUBLIC_URL", "http://localhost:3000"),
    authSecret: process.env.BRIDGE_AUTH_SECRET || "",
  },
  oauth: {
    issuer: optional("OAUTH_ISSUER", "http://localhost:3000"),
    clientId: process.env.OAUTH_CLIENT_ID || "",
    clientSecret: process.env.OAUTH_CLIENT_SECRET || "",
  },
  github: {
    token: process.env.GITHUB_TOKEN || "",
    repository: process.env.GITHUB_REPOSITORY || "",
  },
  repositories: {
    allowed: (process.env.ALLOWED_REPOSITORIES || "").split(",").map((s) => s.trim()).filter(Boolean),
  },
  rateLimit: {
    windowMs: parseInt(optional("RATE_LIMIT_WINDOW_MS", "60000"), 10),
    maxRequests: parseInt(optional("RATE_LIMIT_MAX_REQUESTS", "100"), 10),
    mcpMaxRequests: parseInt(optional("RATE_LIMIT_MCP_MAX", "60"), 10),
  },
  audit: {
    logPath: optional("AUDIT_LOG_PATH", ""),
  },
  log: {
    level: optional("LOG_LEVEL", "info"),
  },
} as const;

export function isDev(): boolean {
  return config.nodeEnv === "development";
}
