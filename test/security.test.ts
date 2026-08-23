import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPathSafe } from "../src/security/path-traversal";
import { corsMiddleware } from "../src/security/cors";
import { rateLimit, mcpRateLimit } from "../src/security/rate-limit";
import { authMiddleware } from "../src/auth/middleware";
import {
  generateAuthCode,
  validateAuthCode,
  issueToken,
  validateAccessToken,
  refreshAccessToken,
  revokeToken,
} from "../src/auth/oauth";

vi.mock("../src/core/config.js", () => ({
  get config() {
    return {
      nodeEnv: process.env.NODE_ENV || "development",
      bridge: { authSecret: process.env.BRIDGE_AUTH_SECRET || "", publicUrl: "http://localhost:3000" },
      oauth: { issuer: "http://localhost:3000" },
    };
  },
  isDev: () => (process.env.NODE_ENV || "development") === "development",
}));

vi.mock("../src/core/audit.js", () => ({
  logger: { error: vi.fn(), info: vi.fn() },
  audit: vi.fn(),
}));

function mockRes() {
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: null as any,
    status(s: number) { res.statusCode = s; return res; },
    json(b: any) { res.body = b; return res; },
    end() { return res; },
    set(k: string, v: string) { res.headers[k] = v; },
    setHeader(k: string, v: string) { res.headers[k] = v; },
  };
  return res;
}

describe("Path Traversal Protection", () => {
  const base = "/safe/dir";

  it("allows relative paths within base", () => {
    expect(isPathSafe(base, "file.txt")).toBe(true);
    expect(isPathSafe(base, "sub/file.txt")).toBe(true);
  });

  it("blocks parent traversal", () => {
    expect(isPathSafe(base, "../etc/passwd")).toBe(false);
    expect(isPathSafe(base, "sub/../../etc/passwd")).toBe(false);
  });

  it("blocks absolute paths", () => {
    expect(isPathSafe(base, "/etc/passwd")).toBe(false);
    expect(isPathSafe(base, "C:\\Windows\\System32")).toBe(false);
  });

  it("handles edge cases", () => {
    expect(isPathSafe(base, ".")).toBe(true);
    expect(isPathSafe(base, "..")).toBe(false);
    expect(isPathSafe(base, "")).toBe(true);
  });
});

describe("CORS Middleware", () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = "http://localhost:3000,http://localhost:5173";
    vi.resetModules();
    req = { headers: {}, method: "GET" };
    res = mockRes();
    next = vi.fn();
  });

  it("calls next for allowed origin", async () => {
    const { corsMiddleware } = await import("../src/security/cors");
    req.headers.origin = "http://localhost:3000";
    corsMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks disallowed origin", async () => {
    const { corsMiddleware } = await import("../src/security/cors");
    req.headers.origin = "http://evil.com";
    corsMiddleware(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows requests without origin", async () => {
    const { corsMiddleware } = await import("../src/security/cors");
    corsMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const { corsMiddleware } = await import("../src/security/cors");
    req.method = "OPTIONS";
    req.headers.origin = "http://localhost:3000";
    corsMiddleware(req, res, next);
    expect(res.statusCode).toBe(204);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("Rate Limiting", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.restoreAllMocks();
  });

  function makeReq(ip = "1.2.3.4") {
    return { ip, socket: { remoteAddress: ip }, auth: undefined } as any;
  }

  it("returns 429 when exceeded in non-dev mode", () => {
    process.env.NODE_ENV = "production";
    const rl = rateLimit as any;
    const req = makeReq();
    const res = mockRes();
    const next = vi.fn();

    for (let i = 0; i < 101; i++) {
      rl(makeReq("10.0.0.1"), mockRes(), vi.fn());
    }

    const finalRes = mockRes();
    rl(makeReq("10.0.0.1"), finalRes, next);
    expect(finalRes.statusCode).toBe(429);
  });

  it("allows requests under the limit", () => {
    process.env.NODE_ENV = "production";
    const rl = rateLimit as any;
    const res = mockRes();
    const next = vi.fn();

    for (let i = 0; i < 10; i++) {
      const r = makeReq("10.0.0.2");
      const rr = mockRes();
      rl(r, rr, vi.fn());
    }

    const finalRes = mockRes();
    rl(makeReq("10.0.0.2"), finalRes, next);
    expect(finalRes.statusCode).toBe(0);
    expect(next).toHaveBeenCalled();
  });

  it("skips rate limiting in dev mode", () => {
    process.env.NODE_ENV = "development";
    const rl = rateLimit as any;
    const res = mockRes();
    const next = vi.fn();

    for (let i = 0; i < 200; i++) {
      const rr = mockRes();
      rl(makeReq(), rr, vi.fn());
    }

    const finalRes = mockRes();
    rl(makeReq(), finalRes, next);
    expect(next).toHaveBeenCalled();
  });

  it("mcpRateLimit is exported", () => {
    expect(mcpRateLimit).toBeDefined();
  });
});

describe("Auth Middleware", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("rejects missing token in non-dev mode", () => {
    process.env.NODE_ENV = "production";
    process.env.BRIDGE_AUTH_SECRET = "secret";
    const req = { headers: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body?.error?.code).toBe("AUTH_REQUIRED");
  });

  it("rejects invalid token in non-dev mode", () => {
    process.env.NODE_ENV = "production";
    process.env.BRIDGE_AUTH_SECRET = "secret";
    const req = { headers: { authorization: "Bearer bad-token" } } as any;
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body?.error?.code).toBe("AUTH_INVALID");
  });

  it("accepts valid static secret", () => {
    process.env.NODE_ENV = "production";
    process.env.BRIDGE_AUTH_SECRET = "mysecret";
    const req = { headers: { authorization: "Bearer mysecret" } } as any;
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.auth?.clientId).toBe("bridge");
  });

  it("accepts valid OAuth token", () => {
    process.env.NODE_ENV = "production";
    process.env.BRIDGE_AUTH_SECRET = "secret";
    const token = issueToken("client-1", "user-1", "read");
    const req = { headers: { authorization: `Bearer ${token.access_token}` } } as any;
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.auth?.userId).toBe("user-1");
  });

  it("bypasses auth in dev mode with no secret", () => {
    process.env.NODE_ENV = "development";
    delete process.env.BRIDGE_AUTH_SECRET;
    const req = { headers: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.auth?.clientId).toBe("dev");
  });
});

describe("OAuth Token Lifecycle", () => {
  it("issues a token and returns an OAuthToken object", () => {
    const token = issueToken("client-1", "user-1", "read");
    expect(token.access_token).toBeDefined();
    expect(token.token_type).toBe("Bearer");
    expect(token.scope).toBe("read");
    expect(token.refresh_token).toBeDefined();
    expect(token.expires_in).toBeGreaterThan(0);
  });

  it("validates a valid token", () => {
    const token = issueToken("client-1", "user-1", "read write");
    const payload = validateAccessToken(token.access_token);
    expect(payload).toBeDefined();
    expect(payload!.clientId).toBe("client-1");
    expect(payload!.userId).toBe("user-1");
    expect(payload!.scope).toBe("read write");
  });

  it("rejects invalid token", () => {
    expect(validateAccessToken("garbage")).toBeNull();
    expect(validateAccessToken("")).toBeNull();
  });

  it("refreshes a token", () => {
    const original = issueToken("client-1", "user-1", "read");
    const refreshed = refreshAccessToken(original.refresh_token!);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.access_token).not.toBe(original.access_token);

    const payload = validateAccessToken(refreshed!.access_token);
    expect(payload!.userId).toBe("user-1");
  });

  it("returns null for invalid refresh token", () => {
    expect(refreshAccessToken("nonexistent")).toBeNull();
  });

  it("revokes a token by access token", () => {
    const token = issueToken("client-1", "user-1", "read");
    expect(revokeToken(token.access_token)).toBe(true);
    expect(validateAccessToken(token.access_token)).toBeNull();
  });

  it("revokes a token by refresh token", () => {
    const token = issueToken("client-1", "user-1", "read");
    expect(revokeToken(token.refresh_token!)).toBe(true);
    expect(validateAccessToken(token.access_token)).toBeNull();
  });

  it("returns false when revoking unknown token", () => {
    expect(revokeToken("nonexistent")).toBe(false);
  });
});

describe("OAuth Auth Code Lifecycle", () => {
  it("generates and validates an auth code with S256", async () => {
    const { createHash } = await import("node:crypto");
    const verifier = "test-verifier-123";
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    const code = generateAuthCode("client-1", "http://localhost/callback", challenge, "S256", "read write");
    expect(typeof code).toBe("string");
    expect(code.length).toBe(64);

    const payload = validateAuthCode(code, verifier);
    expect(payload).toBeDefined();
    expect(payload!.clientId).toBe("client-1");
    expect(payload!.scope).toBe("read write");
    expect(payload!.redirectUri).toBe("http://localhost/callback");
  });

  it("rejects invalid code", () => {
    expect(validateAuthCode("nonexistent", "any")).toBeNull();
  });

  it("rejects wrong verifier", async () => {
    const { createHash } = await import("node:crypto");
    const verifier = "correct-verifier";
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    const code = generateAuthCode("client-1", "http://localhost/callback", challenge, "S256", "read");
    expect(validateAuthCode(code, "wrong-verifier")).toBeNull();
  });

  it("consumes code on validation (single use)", async () => {
    const { createHash } = await import("node:crypto");
    const verifier = "once-verifier";
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    const code = generateAuthCode("client-1", "http://localhost/callback", challenge, "S256", "read");
    expect(validateAuthCode(code, verifier)).toBeDefined();
    expect(validateAuthCode(code, verifier)).toBeNull();
  });

  it("codes expire after TTL", async () => {
    vi.useFakeTimers();
    const { createHash } = await import("node:crypto");
    const verifier = "expire-verifier";
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    const code = generateAuthCode("client-1", "http://localhost/callback", challenge, "S256", "read");
    vi.advanceTimersByTime(600_001);

    expect(validateAuthCode(code, verifier)).toBeNull();
    vi.useRealTimers();
  });
});
