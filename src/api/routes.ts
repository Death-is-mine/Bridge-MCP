import { Router, type Request, type Response } from "express";
import { config } from "../core/config.js";
import { healthCheck, createSession as createOcSession, sendPrompt as ocSendPrompt, stopSession as ocStopSession } from "../adapter/opencode.js";
import { getSession, listSessions, createSession, updateSession, deleteSession } from "../core/session.js";
import { listPendingApprovals, resolveApproval, expireOldApprovals } from "../core/approval.js";
import { audit, listAuditLogs } from "../core/audit.js";
import { authMiddleware } from "../auth/middleware.js";
import { rateLimit } from "../security/rate-limit.js";
import {
  getMetadata,
  getProtectedResourceMetadata,
  generateAuthCode,
  validateAuthCode,
  issueToken,
  refreshAccessToken,
  revokeToken,
  registerClient,
  getClient,
} from "../auth/oauth.js";
import { createMcpServer } from "../mcp/server.js";
import { createTransport, getTransport, removeTransport } from "../mcp/transport.js";

const router = Router();

router.get("/health", async (_req, res) => {
  const oc = await healthCheck();
  res.status(oc.ok ? 200 : 503).json({
    status: oc.ok ? "healthy" : "degraded",
    bridge: { ok: true, version: "1.0.0", uptime: process.uptime() },
    opencode: oc,
  });
});

router.get("/ready", async (_req, res) => {
  const oc = await healthCheck();
  res.status(oc.ok ? 200 : 503).json({ ready: oc.ok, opencode: oc });
});

router.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json(getMetadata());
});

router.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(getProtectedResourceMetadata());
});

router.get("/oauth/authorize", (req, res) => {
  const q = req.query as Record<string, string>;
  const { client_id, redirect_uri, code_challenge, code_challenge_method, scope, state } = q;
  if (!client_id || !redirect_uri || !code_challenge) {
    res.status(400).json({ error: "invalid_request" }); return;
  }
  const client = getClient(client_id);
  if (!client) { res.status(400).json({ error: "invalid_client" }); return; }
  const code = generateAuthCode(client_id, redirect_uri, code_challenge, code_challenge_method || "S256", scope || "read write");
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);
  res.redirect(redirectUrl.toString());
});

router.post("/oauth/token", (req, res) => {
  const { grant_type, code, client_id, code_verifier, refresh_token } = req.body;
  if (grant_type === "authorization_code") {
    if (!code || !code_verifier || !client_id) { res.status(400).json({ error: "invalid_request" }); return; }
    const validated = validateAuthCode(code, code_verifier);
    if (!validated) { res.status(400).json({ error: "invalid_grant" }); return; }
    res.json(issueToken(client_id, "user", validated.scope));
  } else if (grant_type === "refresh_token") {
    if (!refresh_token) { res.status(400).json({ error: "invalid_request" }); return; }
    const token = refreshAccessToken(refresh_token);
    if (!token) { res.status(400).json({ error: "invalid_grant" }); return; }
    res.json(token);
  } else {
    res.status(400).json({ error: "unsupported_grant_type" });
  }
});

router.post("/oauth/revoke", (req, res) => {
  const { token } = req.body;
  if (!token) { res.status(400).json({ error: "invalid_request" }); return; }
  revokeToken(token);
  res.json({ success: true });
});

router.post("/oauth/register", (req, res) => {
  const clientId = "client_" + Date.now();
  const client = registerClient({
    client_id: clientId,
    client_name: req.body.client_name || "unknown",
    redirect_uris: req.body.redirect_uris || [],
    grant_types: req.body.grant_types || ["authorization_code"],
    response_types: req.body.response_types || ["code"],
    token_endpoint_auth_method: "none",
  });
  res.status(201).json(client);
});

// ─── MCP Streamable HTTP ───
router.all("/mcp", authMiddleware, rateLimit, async (req: Request, res: Response) => {
  const incomingReq = req as any;
  const incomingRes = res as any;
  try {
    if (req.method === "GET") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId) { res.status(400).json({ error: "Missing Mcp-Session-Id header" }); return; }
      const transport = getTransport(sessionId);
      if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
      await transport.handleRequest(incomingReq, incomingRes);
    } else if (req.method === "POST") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId) {
        const transport = getTransport(sessionId);
        if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
        await transport.handleRequest(incomingReq, incomingRes, req.body);
      } else {
        const server = createMcpServer();
        const { transport, sessionId } = await createTransport(server);
        res.setHeader("Mcp-Session-Id", sessionId);
        await transport.handleRequest(incomingReq, incomingRes, req.body);
      }
    } else if (req.method === "DELETE") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
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

// ─── API ───
router.get("/api/status", authMiddleware, rateLimit, async (_req, res) => {
  const oc = await healthCheck();
  res.json({ bridge: { ok: true, version: "1.0.0", uptime: process.uptime() }, opencode: oc });
});

router.get("/api/sessions", authMiddleware, rateLimit, (req, res) => {
  res.json(listSessions(req.auth?.clientId));
});

router.post("/api/sessions", authMiddleware, rateLimit, async (req, res) => {
  const { repository, workingDirectory, title } = req.body;
  const session = createSession(req.auth?.clientId || "browser", repository || "default", workingDirectory);
  try {
    const ocSessionId = await createOcSession(title);
    updateSession(session.bridgeSessionId, { opencodeSessionId: ocSessionId, status: "RUNNING" });
    res.status(201).json({ ...session, opencodeSessionId: ocSessionId });
  } catch (err: any) {
    updateSession(session.bridgeSessionId, { status: "FAILED" });
    res.status(502).json({ error: err.message });
  }
});

router.get("/api/sessions/:id", authMiddleware, rateLimit, (req: Request, res: Response) => {
  const session = getSession(req.params.id as string);
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  res.json(session);
});

router.post("/api/sessions/:id/send", authMiddleware, rateLimit, async (req: Request, res: Response) => {
  const session = getSession(req.params.id as string);
  if (!session?.opencodeSessionId) { res.status(404).json({ error: "Not found" }); return; }
  const { prompt } = req.body;
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }
  try {
    const result = await ocSendPrompt(session.opencodeSessionId, prompt);
    updateSession(session.bridgeSessionId, { lastEventAt: new Date() });
    res.json({ result });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

router.post("/api/sessions/:id/stop", authMiddleware, rateLimit, async (req: Request, res: Response) => {
  const session = getSession(req.params.id as string);
  if (!session?.opencodeSessionId) { res.status(404).json({ error: "Not found" }); return; }
  try {
    await ocStopSession(session.opencodeSessionId);
    updateSession(session.bridgeSessionId, { status: "COMPLETED" });
    res.json({ status: "COMPLETED" });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

router.delete("/api/sessions/:id", authMiddleware, rateLimit, (req: Request, res: Response) => {
  const deleted = deleteSession(req.params.id as string);
  res.json({ deleted });
});

router.get("/api/repository/status", authMiddleware, rateLimit, (req, res) => {
  const repo = req.query.repository as string;
  if (!repo) { res.status(400).json({ error: "repository required" }); return; }
  if (config.repositories.allowed.length > 0 && !config.repositories.allowed.includes(repo)) {
    res.status(403).json({ error: "Repository not in allowed list" }); return;
  }
  try {
    const { execSync } = require("node:child_process");
    const shell = process.platform === "win32" ? "powershell.exe" : undefined;
    const status = execSync("git status --porcelain", { cwd: repo, encoding: "utf-8", timeout: 5000, shell });
    res.json({ repository: repo, status: status || "clean", modified: status.split("\n").filter(Boolean).length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/repository/diff", authMiddleware, rateLimit, (req, res) => {
  const repo = req.query.repository as string;
  const ref = req.query.ref as string | undefined;
  if (!repo) { res.status(400).json({ error: "repository required" }); return; }
  if (config.repositories.allowed.length > 0 && !config.repositories.allowed.includes(repo)) {
    res.status(403).json({ error: "Repository not in allowed list" }); return;
  }
  try {
    const { execSync } = require("node:child_process");
    const shell = process.platform === "win32" ? "powershell.exe" : undefined;
    const cmd = ref ? `git diff ${ref}` : "git diff";
    const diff = execSync(cmd, { cwd: repo, encoding: "utf-8", timeout: 10000, shell });
    res.json({ repository: repo, diff: diff || "No changes" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/approvals", authMiddleware, rateLimit, (_req, res) => {
  expireOldApprovals();
  res.json(listPendingApprovals());
});

router.post("/api/approvals/:id/resolve", authMiddleware, rateLimit, (req: Request, res: Response) => {
  const { resolution, resolvedBy } = req.body;
  if (!resolution || !resolvedBy) { res.status(400).json({ error: "resolution and resolvedBy required" }); return; }
  const status = resolution === "approve" ? "APPROVED" : "REJECTED";
  const result = resolveApproval(req.params.id as string, status, resolvedBy);
  if (!result) { res.status(404).json({ error: "Not found or already resolved" }); return; }
  res.json(result);
});

router.get("/api/audit", authMiddleware, rateLimit, (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(listAuditLogs(limit, req.auth?.clientId));
});

export default router;
