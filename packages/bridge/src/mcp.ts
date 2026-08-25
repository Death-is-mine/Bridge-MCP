import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import type { WorkerWsServer } from "./ws.js";

export interface AuthContext {
  clientId: string;
  userId: string;
  scope: string;
}

export function createMcpServer(db: Database.Database, wsServer: WorkerWsServer, auth: AuthContext): McpServer {
  const server = new McpServer({
    name: "bridge-mcp",
    version: "1.0.0",
  });

  // ─── bridge.status ───
  server.tool("bridge.status", "Check health and status of the Bridge-MCP server and connected workers", {}, async () => {
    const workerCount = db.prepare("SELECT COUNT(*) as count FROM workers").get() as any;
    const onlineWorkers = wsServer.getOnlineWorkers();
    const activeSessions = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status IN ('active', 'running')").get() as any;

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        bridge: { ok: true, version: "1.0.0", uptime: process.uptime() },
        workers: { total: workerCount.count, online: onlineWorkers.length },
        sessions: { active: activeSessions.count },
      }) }],
    };
  });

  // ─── bridge.capabilities ───
  server.tool("bridge.capabilities", "List available tools and features of this MCP server", {}, async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      tools: [
        "bridge.status", "bridge.capabilities",
        "worker.list", "worker.status",
        "opencode.sessions.list", "opencode.session.create", "opencode.session.get", "opencode.session.send", "opencode.session.stop", "opencode.session.diff",
        "repository.status", "repository.diff", "repository.files",
        "approval.list", "approval.request", "approval.resolve",
        "execution.get",
      ],
      features: ["oauth2.1", "pkce", "streamable-http", "websocket-workers", "sqlite-persistence", "multi-session", "audit-log"],
    }) }],
  }));

  // ─── worker.list ───
  server.tool("worker.list", "List your paired workers and their status", {}, async () => {
    const workers = db.prepare("SELECT id, name, platform, status, last_seen, paired_at FROM workers WHERE user_id = ?").all(auth.userId);
    return { content: [{ type: "text" as const, text: JSON.stringify(workers) }] };
  });

  // ─── worker.status ───
  server.tool("worker.status", "Get status of a specific worker", {
    workerId: z.string().describe("Worker ID"),
  }, async (args) => {
    const worker = db.prepare("SELECT * FROM workers WHERE id = ? AND user_id = ?").get(args.workerId, auth.userId) as any;
    if (!worker) return { content: [{ type: "text" as const, text: "Worker not found" }], isError: true };
    const connected = wsServer.isConnected(args.workerId);
    return { content: [{ type: "text" as const, text: JSON.stringify({ ...worker, connected }) }] };
  });

  // ─── opencode.sessions.list ───
  server.tool("opencode.sessions.list", "List your active sessions", {}, async () => {
    const sessions = db.prepare("SELECT * FROM sessions WHERE user_id = ? AND status IN ('active', 'running') ORDER BY created_at DESC").all(auth.userId);
    return { content: [{ type: "text" as const, text: JSON.stringify(sessions) }] };
  });

  // ─── opencode.session.create ───
  server.tool("opencode.session.create", "Create a new coding session on a paired worker", {
    repository: z.string().optional().describe("Repository name or path"),
    title: z.string().optional().describe("Session title"),
  }, async (args) => {
    const onlineWorkers = wsServer.getOnlineWorkers().filter((w) => w.userId === auth.userId);
    if (onlineWorkers.length === 0) return { content: [{ type: "text" as const, text: "No workers online" }], isError: true };

    const worker = onlineWorkers[0];
    const bridgeId = uuid();

    try {
      const ocSessionId = await wsServer.executeOnWorker(worker.workerId, "opencode.session.create", { title: args.title });

      db.prepare(`INSERT INTO sessions (id, bridge_id, worker_id, opencode_session_id, user_id, repository, title, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`)
        .run(uuid(), bridgeId, worker.workerId, ocSessionId, auth.userId, args.repository || "default", args.title, Date.now(), Date.now());

      return { content: [{ type: "text" as const, text: JSON.stringify({ bridgeSessionId: bridgeId, opencodeSessionId: ocSessionId, workerId: worker.workerId, status: "running" }) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── opencode.session.get ───
  server.tool("opencode.session.get", "Get details of a specific session", {
    sessionId: z.string().describe("Session ID (bridge session ID)"),
  }, async (args) => {
    const session = db.prepare("SELECT * FROM sessions WHERE bridge_id = ? AND user_id = ?").get(args.sessionId, auth.userId);
    if (!session) return { content: [{ type: "text" as const, text: "Session not found" }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify(session) }] };
  });

  // ─── opencode.session.send ───
  server.tool("opencode.session.send", "Send a coding prompt to an active session", {
    sessionId: z.string().describe("Session ID (bridge session ID)"),
    prompt: z.string().describe("Coding instruction"),
  }, async (args) => {
    const session = db.prepare("SELECT * FROM sessions WHERE bridge_id = ? AND user_id = ?").get(args.sessionId, auth.userId) as any;
    if (!session) return { content: [{ type: "text" as const, text: "Session not found" }], isError: true };
    if (!session.worker_id) return { content: [{ type: "text" as const, text: "No worker assigned" }], isError: true };

    try {
      const result = await wsServer.executeOnWorker(session.worker_id, "opencode.session.send", {
        sessionId: session.opencode_session_id,
        prompt: args.prompt,
      });

      db.prepare("UPDATE sessions SET last_event_at = ?, updated_at = ? WHERE bridge_id = ?")
        .run(Date.now(), Date.now(), args.sessionId);

      return { content: [{ type: "text" as const, text: typeof result === "string" ? result : JSON.stringify(result) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── opencode.session.stop ───
  server.tool("opencode.session.stop", "Stop an active session", {
    sessionId: z.string().describe("Session ID (bridge session ID)"),
  }, async (args) => {
    const session = db.prepare("SELECT * FROM sessions WHERE bridge_id = ? AND user_id = ?").get(args.sessionId, auth.userId) as any;
    if (!session) return { content: [{ type: "text" as const, text: "Session not found" }], isError: true };

    try {
      if (session.worker_id && session.opencode_session_id) {
        await wsServer.executeOnWorker(session.worker_id, "opencode.session.stop", {
          sessionId: session.opencode_session_id,
        });
      }
      db.prepare("UPDATE sessions SET status = 'completed', updated_at = ? WHERE bridge_id = ?")
        .run(Date.now(), args.sessionId);
      return { content: [{ type: "text" as const, text: JSON.stringify({ status: "completed" }) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── opencode.session.diff ───
  server.tool("opencode.session.diff", "Get the diff of changes made in a session", {
    sessionId: z.string().describe("Session ID (bridge session ID)"),
  }, async (args) => {
    const session = db.prepare("SELECT * FROM sessions WHERE bridge_id = ? AND user_id = ?").get(args.sessionId, auth.userId) as any;
    if (!session?.worker_id || !session?.opencode_session_id) {
      return { content: [{ type: "text" as const, text: "Session not found or no worker" }], isError: true };
    }

    try {
      const diff = await wsServer.executeOnWorker(session.worker_id, "opencode.session.diff", {
        sessionId: session.opencode_session_id,
      });
      return { content: [{ type: "text" as const, text: (diff as string) || "No changes" }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── repository.status ───
  server.tool("repository.status", "Get git status of a repository on the worker", {
    repository: z.string().describe("Repository path"),
  }, async (args) => {
    const onlineWorkers = wsServer.getOnlineWorkers().filter((w) => w.userId === auth.userId);
    if (onlineWorkers.length === 0) return { content: [{ type: "text" as const, text: "No workers online" }], isError: true };

    try {
      const result = await wsServer.executeOnWorker(onlineWorkers[0].workerId, "repository.status", {
        repository: args.repository,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── repository.diff ───
  server.tool("repository.diff", "Get git diff of a repository on the worker", {
    repository: z.string().describe("Repository path"),
    ref: z.string().optional().describe("Git ref to diff against"),
  }, async (args) => {
    const onlineWorkers = wsServer.getOnlineWorkers().filter((w) => w.userId === auth.userId);
    if (onlineWorkers.length === 0) return { content: [{ type: "text" as const, text: "No workers online" }], isError: true };

    try {
      const result = await wsServer.executeOnWorker(onlineWorkers[0].workerId, "repository.diff", {
        repository: args.repository,
        ref: args.ref,
      });
      return { content: [{ type: "text" as const, text: (result as string) || "No changes" }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── repository.files ───
  server.tool("repository.files", "List files in a repository on the worker", {
    repository: z.string().describe("Repository path"),
    pattern: z.string().optional().describe("Glob pattern to filter"),
  }, async (args) => {
    const onlineWorkers = wsServer.getOnlineWorkers().filter((w) => w.userId === auth.userId);
    if (onlineWorkers.length === 0) return { content: [{ type: "text" as const, text: "No workers online" }], isError: true };

    try {
      const result = await wsServer.executeOnWorker(onlineWorkers[0].workerId, "repository.files", {
        repository: args.repository,
        pattern: args.pattern,
      });
      return { content: [{ type: "text" as const, text: Array.isArray(result) ? result.join("\n") : JSON.stringify(result) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── approval.list ───
  server.tool("approval.list", "List your pending approval requests", {
    status: z.enum(["pending", "all"]).optional().describe("Filter by status"),
  }, async (args) => {
    const items = args.status === "all"
      ? db.prepare("SELECT * FROM approvals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(auth.userId)
      : db.prepare("SELECT * FROM approvals WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC").all(auth.userId);
    return { content: [{ type: "text" as const, text: JSON.stringify(items) }] };
  });

  // ─── approval.request ───
  server.tool("approval.request", "Request approval for a sensitive operation", {
    action: z.string().describe("Action requiring approval"),
    repository: z.string().describe("Target repository"),
    reason: z.string().describe("Reason for the action"),
    proposedEffect: z.string().describe("What this action will change"),
  }, async (args) => {
    const id = "apr_" + uuid().replace(/-/g, "").slice(0, 12);
    const now = Date.now();
    db.prepare(`INSERT INTO approvals (id, request_id, user_id, action, repository, reason, proposed_effect, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .run(id, uuid(), auth.userId, args.action, args.repository, args.reason, args.proposedEffect, now, now + 300_000);
    return { content: [{ type: "text" as const, text: JSON.stringify({ approvalId: id, status: "pending" }) }] };
  });

  // ─── approval.resolve ───
  server.tool("approval.resolve", "Approve or reject a pending approval request", {
    approvalId: z.string().describe("Approval ID"),
    resolution: z.enum(["approve", "reject"]).describe("Resolution"),
  }, async (args) => {
    const status = args.resolution === "approve" ? "APPROVED" : "REJECTED";
    const result = db.prepare("UPDATE approvals SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ? AND user_id = ? AND status = 'pending'")
      .run(status, Date.now(), auth.userId, args.approvalId, auth.userId);
    if (result.changes === 0) return { content: [{ type: "text" as const, text: "Approval not found or already resolved" }], isError: true };
    const approval = db.prepare("SELECT * FROM approvals WHERE id = ?").get(args.approvalId);
    return { content: [{ type: "text" as const, text: JSON.stringify(approval) }] };
  });

  // ─── execution.get ───
  server.tool("execution.get", "Get your audit log entries for execution tracking", {
    limit: z.number().optional().describe("Max entries to return"),
  }, async (args) => {
    const entries = db.prepare("SELECT * FROM audit WHERE user_id = ? ORDER BY start_time DESC LIMIT ?").all(auth.userId, args.limit || 20);
    return { content: [{ type: "text" as const, text: JSON.stringify(entries) }] };
  });

  return server;
}
