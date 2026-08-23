import { describe, it, expect } from "vitest";

describe("rate limiter", () => {
  it("exports rateLimit middleware", async () => {
    const { rateLimit } = await import("../src/security/rate-limit.js");
    expect(typeof rateLimit).toBe("function");
  });
});

describe("auth middleware", () => {
  it("exports authMiddleware and errorHandler", async () => {
    const { authMiddleware, errorHandler } = await import("../src/auth/middleware.js");
    expect(typeof authMiddleware).toBe("function");
    expect(typeof errorHandler).toBe("function");
  });
});

describe("cors middleware", () => {
  it("exports corsMiddleware", async () => {
    const { corsMiddleware } = await import("../src/security/cors.js");
    expect(typeof corsMiddleware).toBe("function");
  });
});

describe("OAuth", () => {
  it("generates and validates auth codes", async () => {
    const { generateAuthCode, validateAuthCode } = await import("../src/auth/oauth.js");
    const { createHash } = await import("node:crypto");
    const verifier = "test_verifier_12345";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const code = generateAuthCode("client1", "http://localhost/callback", challenge, "S256", "read");
    expect(code).toBeTruthy();
    expect(validateAuthCode(code, verifier)).toBeTruthy();
    expect(validateAuthCode(code, "wrong_verifier")).toBeNull();
    expect(validateAuthCode("invalid", verifier)).toBeNull();
  });

  it("issues and validates tokens", async () => {
    const { issueToken, validateAccessToken, revokeToken } = await import("../src/auth/oauth.js");
    const token = issueToken("client1", "user1", "read write");
    expect(token.access_token).toBeTruthy();
    expect(token.token_type).toBe("Bearer");
    expect(token.expires_in).toBe(3600);
    expect(token.refresh_token).toBeTruthy();
    const valid = validateAccessToken(token.access_token);
    expect(valid?.clientId).toBe("client1");
    expect(revokeToken(token.access_token)).toBe(true);
    expect(validateAccessToken(token.access_token)).toBeNull();
  });

  it("returns metadata", async () => {
    const { getMetadata, getProtectedResourceMetadata } = await import("../src/auth/oauth.js");
    const meta = getMetadata();
    expect(meta.authorization_endpoint).toContain("/oauth/authorize");
    expect(meta.token_endpoint).toContain("/oauth/token");
    expect(meta.code_challenge_methods_supported).toContain("S256");
    const prm = getProtectedResourceMetadata();
    expect(prm.resource).toBeTruthy();
  });
});
