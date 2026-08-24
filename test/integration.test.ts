import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../src/adapter/opencode.js", () => ({
  healthCheck: async () => ({ ok: true, version: "1.0.0" }),
  createSession: async () => "oc-session-1",
  sendPrompt: async () => "response",
  stopSession: async () => {},
  getDiff: async () => "+ test diff",
  listSessions: async () => ["oc-session-1"],
}));

vi.mock("../src/core/config.js", () => ({
  config: {
    nodeEnv: "test",
    opencode: { baseUrl: "http://127.0.0.1:4096", username: "", password: "", timeoutMs: 5000 },
    bridge: { host: "0.0.0.0", port: 0, publicUrl: "http://localhost:3000", authSecret: "" },
    oauth: { issuer: "http://localhost:3000", clientId: "", clientSecret: "" },
    github: { token: "", repository: "" },
    repositories: { allowed: [] },
    rateLimit: { windowMs: 60000, maxRequests: 100, mcpMaxRequests: 60 },
    audit: { logPath: "" },
    log: { level: "silent" },
  },
  isDev: () => true,
}));

import router from "../src/api/routes.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

describe("API Integration", () => {
  const app = createApp();

  it("GET /health returns status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.bridge.ok).toBe(true);
    expect(res.body.opencode.ok).toBe(true);
  });

  it("GET /ready returns ready status", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  it("GET /.well-known/oauth-authorization-server returns metadata", async () => {
    const res = await request(app).get("/.well-known/oauth-authorization-server");
    expect(res.status).toBe(200);
    expect(res.body.authorization_endpoint).toContain("/oauth/authorize");
    expect(res.body.code_challenge_methods_supported).toContain("S256");
  });

  it("POST /oauth/register creates a client", async () => {
    const res = await request(app)
      .post("/oauth/register")
      .send({ client_name: "test-app", redirect_uris: ["http://localhost/callback"] });
    expect(res.status).toBe(201);
    expect(res.body.client_id).toBeTruthy();
  });

  it("GET /api/status returns status", async () => {
    const res = await request(app).get("/api/status");
    expect(res.status).toBe(200);
    expect(res.body.bridge.ok).toBe(true);
  });

  it("POST /api/sessions creates session", async () => {
    const res = await request(app)
      .post("/api/sessions")
      .send({ repository: "/tmp/repo" });
    expect(res.status).toBe(201);
    expect(res.body.bridgeSessionId).toBeTruthy();
  });

  it("GET /api/sessions lists sessions", async () => {
    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/approvals returns array", async () => {
    const res = await request(app).get("/api/approvals");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/audit returns array", async () => {
    const res = await request(app).get("/api/audit");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /nonexistent returns 404", async () => {
    const res = await request(app).get("/nonexistent");
    expect(res.status).toBe(404);
  });

  it("POST /mcp requires session-id for subsequent requests", async () => {
    const res = await request(app).get("/mcp").set("Mcp-Session-Id", "fake");
    expect(res.status).toBe(404);
  });

  it("POST /mcp creates new session on first call", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
        id: 1,
      });
    expect(res.status).toBe(200);
    expect(res.headers["mcp-session-id"]).toBeTruthy();
  });
});
