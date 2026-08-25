import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./db.js";
import { WorkerWsServer } from "./ws.js";
import { createMcpServer, type AuthContext } from "./mcp.js";
import { createTransport, getTransport, removeTransport } from "./transport.js";

const PORT = parseInt(process.env.BRIDGE_PORT || "3000", 10);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  console.log("[bridge] Starting Bridge-MCP...");

  const { db, close: closeDb } = createDatabase();
  console.log("[bridge] Database initialized");

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json());

  // Serve dashboard
  app.use(express.static(join(__dirname, "../web")));

  // Health
  app.get("/health", (_req, res) => {
    res.json({ status: "healthy", bridge: { ok: true, version: "1.0.0", uptime: process.uptime() } });
  });
  app.get("/ready", (_req, res) => {
    res.json({ ready: true });
  });

  // OAuth metadata
  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const issuer = `${proto}://${host}`;
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      registration_endpoint: `${issuer}/oauth/register`,
      scopes_supported: ["read", "write", "admin"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
    });
  });

  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const issuer = `${proto}://${host}`;
    res.json({
      resource: issuer,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["read", "write", "admin"],
    });
  });

  // OAuth
  app.post("/oauth/register", (req, res) => {
    const clientId = "client_" + Date.now();
    const client = {
      client_id: clientId,
      client_name: req.body.client_name || "unknown",
      redirect_uris: req.body.redirect_uris || [],
      grant_types: req.body.grant_types || ["authorization_code"],
      response_types: req.body.response_types || ["code"],
      token_endpoint_auth_method: "none",
    };
    db.prepare("INSERT INTO oauth_clients (client_id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)")
      .run(clientId, client.client_name, JSON.stringify(client.redirect_uris), Date.now());
    res.status(201).json(client);
  });

  app.get("/oauth/authorize", (req, res) => {
    const q = req.query as Record<string, string>;
    const { client_id, redirect_uri, code_challenge, code_challenge_method, scope, state } = q;
    if (!client_id || !redirect_uri || !code_challenge) {
      res.status(400).json({ error: "invalid_request" }); return;
    }
    const code = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    db.prepare("INSERT INTO oauth_codes (code, client_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(code, client_id, redirect_uri, code_challenge, code_challenge_method || "S256", scope || "read write", Date.now() + 600_000);
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);
    res.redirect(redirectUrl.toString());
  });

  app.post("/oauth/token", (req, res) => {
    const { grant_type, code, client_id, code_verifier } = req.body;
    if (grant_type !== "authorization_code") {
      res.status(400).json({ error: "unsupported_grant_type" }); return;
    }
    if (!code || !code_verifier || !client_id) {
      res.status(400).json({ error: "invalid_request" }); return;
    }
    const stored = db.prepare("SELECT * FROM oauth_codes WHERE code = ? AND client_id = ?").get(code, client_id) as any;
    if (!stored || Date.now() > stored.expires_at) {
      res.status(400).json({ error: "invalid_grant" }); return;
    }
    const hash = createHash("sha256").update(code_verifier).digest("base64url");
    if (hash !== stored.code_challenge) {
      res.status(400).json({ error: "invalid_grant" }); return;
    }
    db.prepare("DELETE FROM oauth_codes WHERE code = ?").run(code);
    const accessToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const refreshToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    db.prepare("INSERT INTO oauth_tokens (access_token, refresh_token, client_id, user_id, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(accessToken, refreshToken, client_id, "user", stored.scope, Date.now() + 3600_000);
    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: stored.scope,
      refresh_token: refreshToken,
    });
  });

  app.post("/oauth/revoke", (req, res) => {
    const { token } = req.body;
    if (!token) { res.status(400).json({ error: "invalid_request" }); return; }
    db.prepare("DELETE FROM oauth_tokens WHERE access_token = ? OR refresh_token = ?").run(token, token);
    res.json({ success: true });
  });

  // Auth middleware
  const authMiddleware = (req: any, res: any, next: any) => {
    if (!process.env.BRIDGE_AUTH_SECRET) {
      req.auth = { clientId: "dev", userId: "dev", scope: "read write admin" };
      next();
      return;
    }
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing auth" }); return;
    }
    const token = authHeader.slice(7);
    if (token === process.env.BRIDGE_AUTH_SECRET) {
      req.auth = { clientId: "bridge", userId: "admin", scope: "read write admin" };
      next();
      return;
    }
    const stored = db.prepare("SELECT * FROM oauth_tokens WHERE access_token = ?").get(token) as any;
    if (stored && Date.now() < stored.expires_at) {
      req.auth = { clientId: stored.client_id, userId: stored.user_id, scope: stored.scope };
      next();
      return;
    }
    res.status(401).json({ error: "Invalid token" });
  };

  // MCP endpoint
  let wsServer: WorkerWsServer;

  app.all("/mcp", authMiddleware, async (req: any, res: any) => {
    try {
      if (req.method === "GET") {
        const sessionId = req.headers["mcp-session-id"];
        if (!sessionId) { res.status(400).json({ error: "Missing Mcp-Session-Id" }); return; }
        const transport = getTransport(sessionId);
        if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
        await transport.handleRequest(req, res);
      } else if (req.method === "POST") {
        const sessionId = req.headers["mcp-session-id"];
        if (sessionId) {
          const transport = getTransport(sessionId);
          if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
          await transport.handleRequest(req, res, req.body);
        } else {
          const authCtx: AuthContext = req.auth;
          const server = createMcpServer(db, wsServer, authCtx);
          const { transport, sessionId } = await createTransport(server);
          res.setHeader("Mcp-Session-Id", sessionId);
          await transport.handleRequest(req, res, req.body);
        }
      } else if (req.method === "DELETE") {
        const sessionId = req.headers["mcp-session-id"];
        if (sessionId) {
          const transport = getTransport(sessionId);
          if (transport) { await transport.close(); removeTransport(sessionId); }
        }
        res.status(200).json({ ok: true });
      } else {
        res.status(405).json({ error: "Method not allowed" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Worker management API
  app.get("/api/workers", authMiddleware, (req: any, res) => {
    const workers = db.prepare("SELECT id, name, platform, status, last_seen, paired_at FROM workers WHERE user_id = ?").all(req.auth?.userId);
    res.json(workers);
  });

  app.post("/api/workers/:id/approve", authMiddleware, (req: any, res) => {
    const { id } = req.params;
    const worker = db.prepare("SELECT * FROM workers WHERE id = ?").get(id) as any;
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    db.prepare("UPDATE workers SET status = 'ONLINE', user_id = ? WHERE id = ?").run(req.auth?.userId || "admin", id);
    res.json({ ok: true, status: "ONLINE" });
  });

  // Session API
  app.get("/api/sessions", authMiddleware, (req: any, res) => {
    const sessions = db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(req.auth?.userId);
    res.json(sessions);
  });

  // Audit API
  app.get("/api/audit", authMiddleware, (req: any, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const entries = db.prepare("SELECT * FROM audit WHERE user_id = ? ORDER BY start_time DESC LIMIT ?").all(req.auth?.userId, limit);
    res.json(entries);
  });

  // Approvals API
  app.get("/api/approvals", authMiddleware, (req: any, res) => {
    const items = db.prepare("SELECT * FROM approvals WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC").all(req.auth?.userId);
    res.json(items);
  });

  app.post("/api/approvals/:id/resolve", authMiddleware, (req: any, res) => {
    const { resolution } = req.body;
    const status = resolution === "approve" ? "APPROVED" : "REJECTED";
    const result = db.prepare("UPDATE approvals SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ? AND user_id = ? AND status = 'pending'")
      .run(status, Date.now(), req.auth?.userId, req.params.id, req.auth?.userId);
    if (result.changes === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true, status });
  });

  // Create server
  const server = createServer(app);
  wsServer = new WorkerWsServer(server, db);
  console.log("[bridge] WebSocket server ready for workers");

  server.listen(PORT, () => {
    console.log(`[bridge] Listening on port ${PORT}`);
    console.log(`[bridge] MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`[bridge] Dashboard: http://localhost:${PORT}/`);
  });

  process.on("SIGINT", () => { server.close(); closeDb(); process.exit(0); });
  process.on("SIGTERM", () => { server.close(); closeDb(); process.exit(0); });
}

main().catch((err) => { console.error("[bridge] Fatal:", err); process.exit(1); });
