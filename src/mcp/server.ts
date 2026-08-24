import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { healthCheck, createSession, sendPrompt, stopSession, getDiff, listSessions } from "../adapter/opencode.js";
import { getSession, createSession as createBridgeSession, listSessions as listBridgeSessions, updateSession } from "../core/session.js";
import { createApproval, listPendingApprovals, resolveApproval, listAllApprovals } from "../core/approval.js";
import { audit, listAuditLogs, logger } from "../core/audit.js";
import { config } from "../core/config.js";
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { validatePath } from "../security/path-traversal.js";

const shell = process.platform === "win32" ? "powershell.exe" : undefined;

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "bridge-mcp",
    version: "1.0.0",
  });

  // ─── bridge.status ───
  server.tool("bridge.status", "Check health and status of the Bridge-MCP server and connected OpenCode instance", {}, async () => {
    const oc = await healthCheck();
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ bridge: { ok: true, version: "1.0.0" }, opencode: oc }) }],
    };
  });

  // ─── bridge.capabilities ───
  server.tool("bridge.capabilities", "List available tools and features of this MCP server", {}, async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({
      tools: [
        "bridge.status", "bridge.capabilities",
        "opencode.sessions.list", "opencode.session.create", "opencode.session.get", "opencode.session.send", "opencode.session.stop", "opencode.session.diff",
        "repository.status", "repository.diff", "repository.files",
        "github.status", "github.review", "github.pull_request",
        "bridge.approval.list", "bridge.approval.request", "bridge.approval.resolve",
        "bridge.execution.get",
      ],
      features: ["oauth2.1", "pkce", "streamable-http", "multi-session", "audit-log"],
    }) }],
  }));

  // ─── opencode.sessions.list ───
  server.tool("opencode.sessions.list", "List all active OpenCode sessions managed by this bridge", {}, async () => {
    const sessions = listBridgeSessions();
    return { content: [{ type: "text" as const, text: JSON.stringify(sessions) }] };
  });

  // ─── opencode.session.create ───
  server.tool("opencode.session.create", "Create a new OpenCode session", {
    repository: z.string().optional().describe("Repository name or path"),
    workingDirectory: z.string().optional().describe("Working directory for the session"),
    title: z.string().optional().describe("Session title"),
  }, async (args) => {
    const repo = args.repository || config.repositories.allowed[0] || "default";
    const bridge = createBridgeSession("mcp-client", repo, args.workingDirectory);
    try {
      const ocSessionId = await createSession(args.title);
      updateSession(bridge.bridgeSessionId, { opencodeSessionId: ocSessionId, status: "RUNNING" });
      audit({ requestId: "", clientId: "mcp", userId: "mcp", tool: "opencode.session.create", argumentsHash: JSON.stringify(args), repository: repo, bridgeSessionId: bridge.bridgeSessionId, opencodeSessionId: ocSessionId, permission: "", approvalStatus: "", status: "ok" });
      return { content: [{ type: "text" as const, text: JSON.stringify({ bridgeSessionId: bridge.bridgeSessionId, opencodeSessionId: ocSessionId, status: "RUNNING" }) }] };
    } catch (err: any) {
      updateSession(bridge.bridgeSessionId, { status: "FAILED" });
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── opencode.session.get ───
  server.tool("opencode.session.get", "Get details of a specific bridge session", {
    bridgeSessionId: z.string().describe("Bridge session ID"),
  }, async (args) => {
    const session = getSession(args.bridgeSessionId);
    if (!session) return { content: [{ type: "text" as const, text: "Session not found" }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify(session) }] };
  });

  // ─── opencode.session.send ───
  server.tool("opencode.session.send", "Send a prompt to an active OpenCode session", {
    bridgeSessionId: z.string().describe("Bridge session ID"),
    prompt: z.string().describe("Prompt to send to OpenCode"),
  }, async (args) => {
    const session = getSession(args.bridgeSessionId);
    if (!session?.opencodeSessionId) return { content: [{ type: "text" as const, text: "Session not found or not connected" }], isError: true };
    try {
      const result = await sendPrompt(session.opencodeSessionId, args.prompt);
      updateSession(session.bridgeSessionId, { lastEventAt: new Date() });
      audit({ requestId: "", clientId: "mcp", userId: "mcp", tool: "opencode.session.send", argumentsHash: JSON.stringify({ prompt: args.prompt.length }), repository: session.repository, bridgeSessionId: session.bridgeSessionId, opencodeSessionId: session.opencodeSessionId, permission: "", approvalStatus: "", status: "ok" });
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── opencode.session.stop ───
  server.tool("opencode.session.stop", "Stop an active OpenCode session", {
    bridgeSessionId: z.string().describe("Bridge session ID"),
  }, async (args) => {
    const session = getSession(args.bridgeSessionId);
    if (!session?.opencodeSessionId) return { content: [{ type: "text" as const, text: "Session not found" }], isError: true };
    try {
      await stopSession(session.opencodeSessionId);
      updateSession(session.bridgeSessionId, { status: "COMPLETED" });
      return { content: [{ type: "text" as const, text: JSON.stringify({ status: "COMPLETED" }) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── opencode.session.diff ───
  server.tool("opencode.session.diff", "Get the diff of changes made in an OpenCode session", {
    bridgeSessionId: z.string().describe("Bridge session ID"),
  }, async (args) => {
    const session = getSession(args.bridgeSessionId);
    if (!session?.opencodeSessionId) return { content: [{ type: "text" as const, text: "Session not found" }], isError: true };
    try {
      const diff = await getDiff(session.opencodeSessionId);
      return { content: [{ type: "text" as const, text: diff || "No changes" }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── repository.status ───
  server.tool("repository.status", "Get git status of a repository", {
    repository: z.string().describe("Repository path"),
  }, async (args) => {
    const repo = config.repositories.allowed.length > 0
      ? config.repositories.allowed.find((r) => r === args.repository)
      : args.repository;
    if (!repo) return { content: [{ type: "text" as const, text: "Repository not in allowed list" }], isError: true };
    try {
      const status = execSync("git status --porcelain", { cwd: repo, encoding: "utf-8", timeout: 5000, shell });
      return { content: [{ type: "text" as const, text: status || "Clean" }] };
    } catch {
      // ponytail: fs fallback when git CLI absent
      try {
        function walkSync(dir: string, base: string): string[] {
          const entries = readdirSync(dir, { withFileTypes: true });
          const out: string[] = [];
          for (const e of entries) {
            if (e.name === "node_modules" || e.name === ".git") continue;
            const full = join(dir, e.name);
            const rel = relative(base, full).replace(/\\/g, "/");
            if (e.isDirectory()) out.push(...walkSync(full, base));
            else out.push(rel);
          }
          return out;
        }
        const files = walkSync(repo, repo).join("\n");
        return { content: [{ type: "text" as const, text: files || "Empty" }] };
      } catch (err2: any) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: err2.message }) }], isError: true };
      }
    }
  });

  // ─── repository.diff ───
  server.tool("repository.diff", "Get git diff of a repository", {
    repository: z.string().describe("Repository path"),
    ref: z.string().optional().describe("Git ref to diff against"),
  }, async (args) => {
    const repo = config.repositories.allowed.length > 0
      ? config.repositories.allowed.find((r) => r === args.repository)
      : args.repository;
    if (!repo) return { content: [{ type: "text" as const, text: "Repository not in allowed list" }], isError: true };
    try {
      const cmd = args.ref ? `git diff ${args.ref}` : "git diff";
      const diff = execSync(cmd, { cwd: repo, encoding: "utf-8", timeout: 10000, shell });
      return { content: [{ type: "text" as const, text: diff || "No changes" }] };
    } catch {
      // ponytail: no git, show file listing as best-effort status
      try {
        function walkSync(dir: string, base: string): string[] {
          const entries = readdirSync(dir, { withFileTypes: true });
          const out: string[] = [];
          for (const e of entries) {
            if (e.name === "node_modules" || e.name === ".git") continue;
            const full = join(dir, e.name);
            const rel = relative(base, full).replace(/\\/g, "/");
            if (e.isDirectory()) out.push(...walkSync(full, base));
            else out.push(`  M ${rel}`);
          }
          return out;
        }
        return { content: [{ type: "text" as const, text: "(no git — listing files)\n" + walkSync(repo, repo).join("\n") }] };
      } catch (err2: any) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: err2.message }) }], isError: true };
      }
    }
  });

  // ─── repository.files ───
  server.tool("repository.files", "List or read files in a repository", {
    repository: z.string().describe("Repository path"),
    path: z.string().optional().describe("Relative path within repo"),
    pattern: z.string().optional().describe("Glob pattern to filter files"),
  }, async (args) => {
    const repo = config.repositories.allowed.length > 0
      ? config.repositories.allowed.find((r) => r === args.repository)
      : args.repository;
    if (!repo) return { content: [{ type: "text" as const, text: "Repository not in allowed list" }], isError: true };
    const targetPath = args.path || ".";
    const safe = validatePath(repo, targetPath);
    if (!safe) return { content: [{ type: "text" as const, text: "Path traversal detected" }], isError: true };
    try {
      const cmd = args.pattern
        ? `git ls-files "${args.pattern}"`
        : `git ls-files`;
      const files = execSync(cmd, { cwd: repo, encoding: "utf-8", timeout: 5000, shell });
      return { content: [{ type: "text" as const, text: files || "No files" }] };
    } catch {
      // ponytail: fs fallback when git CLI absent
      try {
        function walkSync(dir: string, base: string): string[] {
          const entries = readdirSync(dir, { withFileTypes: true });
          const out: string[] = [];
          for (const e of entries) {
            if (e.name === "node_modules" || e.name === ".git") continue;
            const full = join(dir, e.name);
            const rel = relative(base, full).replace(/\\/g, "/");
            if (e.isDirectory()) out.push(...walkSync(full, base));
            else out.push(rel);
          }
          return out;
        }
        const files = walkSync(repo, repo).join("\n");
        return { content: [{ type: "text" as const, text: files || "No files" }] };
      } catch (err2: any) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: err2.message }) }], isError: true };
      }
    }
  });

  // ─── github.status ───
  server.tool("github.status", "Get GitHub repository status (open PRs, recent commits)", {
    repository: z.string().optional().describe("GitHub owner/repo (default: from env)"),
  }, async (args) => {
    const repo = args.repository || config.github.repository;
    if (!repo) return { content: [{ type: "text" as const, text: "No repository specified" }], isError: true };
    if (!config.github.token) return { content: [{ type: "text" as const, text: "GitHub token not configured" }], isError: true };
    try {
      const headers = { Authorization: `token ${config.github.token}`, Accept: "application/vnd.github+json" };
      const [owner, name] = repo.split("/");
      const prsRes = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls?state=open&per_page=5`, { headers });
      const prs = await prsRes.json() as any[];
      const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${name}/commits?per_page=3`, { headers });
      const commits = await commitsRes.json() as any[];
      return { content: [{ type: "text" as const, text: JSON.stringify({
        openPullRequests: prs.map((p: any) => ({ number: p.number, title: p.title, author: p.user.login })),
        recentCommits: commits.map((c: any) => ({ sha: c.sha.slice(0, 7), message: c.commit.message, author: c.commit.author.name })),
      }) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }], isError: true };
    }
  });

  // ─── github.review ───
  server.tool("github.review", "Review a GitHub pull request", {
    repository: z.string().optional().describe("GitHub owner/repo"),
    pullRequest: z.number().describe("PR number"),
    review: z.string().describe("Review body"),
    event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]).describe("Review event"),
  }, async (args) => {
    const repo = args.repository || config.github.repository;
    if (!repo) return { content: [{ type: "text" as const, text: "No repository specified" }], isError: true };
    if (!config.github.token) return { content: [{ type: "text" as const, text: "GitHub token not configured" }], isError: true };
    const approval = createApproval("github.review", repo, "", `Review PR #${args.pullRequest}: ${args.event}`, args.review);
    audit({ requestId: approval.requestId, clientId: "mcp", userId: "mcp", tool: "github.review", argumentsHash: JSON.stringify(args), repository: repo, bridgeSessionId: "", opencodeSessionId: "", permission: "REQUIRES_APPROVAL", approvalStatus: "PENDING", status: "pending_approval" });
    return { content: [{ type: "text" as const, text: JSON.stringify({ approvalId: approval.id, status: "PENDING", message: "Review requires approval" }) }] };
  });

  // ─── github.pull_request ───
  server.tool("github.pull_request", "Create a GitHub pull request", {
    repository: z.string().optional().describe("GitHub owner/repo"),
    title: z.string().describe("PR title"),
    body: z.string().describe("PR body"),
    head: z.string().describe("Source branch"),
    base: z.string().describe("Target branch"),
  }, async (args) => {
    const repo = args.repository || config.github.repository;
    if (!repo) return { content: [{ type: "text" as const, text: "No repository specified" }], isError: true };
    if (!config.github.token) return { content: [{ type: "text" as const, text: "GitHub token not configured" }], isError: true };
    const approval = createApproval("github.pull_request", repo, "", `Create PR: ${args.title}`, `${args.head} -> ${args.base}`);
    audit({ requestId: approval.requestId, clientId: "mcp", userId: "mcp", tool: "github.pull_request", argumentsHash: JSON.stringify(args), repository: repo, bridgeSessionId: "", opencodeSessionId: "", permission: "REQUIRES_APPROVAL", approvalStatus: "PENDING", status: "pending_approval" });
    return { content: [{ type: "text" as const, text: JSON.stringify({ approvalId: approval.id, status: "PENDING", message: "PR creation requires approval" }) }] };
  });

  // ─── bridge.approval.list ───
  server.tool("bridge.approval.list", "List pending or all approval requests", {
    status: z.enum(["pending", "all"]).optional().describe("Filter by status"),
  }, async (args) => {
    const items = args.status === "all" ? listAllApprovals() : listPendingApprovals();
    return { content: [{ type: "text" as const, text: JSON.stringify(items) }] };
  });

  // ─── bridge.approval.request ───
  server.tool("bridge.approval.request", "Request approval for a sensitive operation", {
    action: z.string().describe("Action requiring approval"),
    repository: z.string().describe("Target repository"),
    reason: z.string().describe("Reason for the action"),
    proposedEffect: z.string().describe("What this action will change"),
  }, async (args) => {
    const approval = createApproval(args.action, args.repository, "", args.reason, args.proposedEffect);
    audit({ requestId: approval.requestId, clientId: "mcp", userId: "mcp", tool: "bridge.approval.request", argumentsHash: JSON.stringify(args), repository: args.repository, bridgeSessionId: "", opencodeSessionId: "", permission: "REQUIRES_APPROVAL", approvalStatus: "PENDING", status: "pending_approval" });
    return { content: [{ type: "text" as const, text: JSON.stringify({ approvalId: approval.id, status: "PENDING" }) }] };
  });

  // ─── bridge.approval.resolve ───
  server.tool("bridge.approval.resolve", "Approve or reject a pending approval request", {
    approvalId: z.string().describe("Approval ID"),
    resolution: z.enum(["approve", "reject"]).describe("Resolution"),
    resolvedBy: z.string().describe("Who resolved this"),
  }, async (args) => {
    const status = args.resolution === "approve" ? "APPROVED" : "REJECTED";
    const result = resolveApproval(args.approvalId, status, args.resolvedBy);
    if (!result) return { content: [{ type: "text" as const, text: "Approval not found or already resolved" }], isError: true };
    audit({ requestId: result.requestId, clientId: "mcp", userId: args.resolvedBy, tool: "bridge.approval.resolve", argumentsHash: JSON.stringify(args), repository: result.repository, bridgeSessionId: "", opencodeSessionId: "", permission: "", approvalStatus: status, status: "ok" });
    return { content: [{ type: "text" as const, text: JSON.stringify({ ...result, status }) }] };
  });

  // ─── bridge.execution.get ───
  server.tool("bridge.execution.get", "Get audit log entries for execution tracking", {
    limit: z.number().optional().describe("Max entries to return"),
    clientId: z.string().optional().describe("Filter by client ID"),
  }, async (args) => {
    const entries = listAuditLogs(args.limit || 20, args.clientId);
    return { content: [{ type: "text" as const, text: JSON.stringify(entries) }] };
  });

  return server;
}
