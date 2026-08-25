import type { McpToolDef } from "./types.js";

export const MCP_TOOLS: McpToolDef[] = [
  // Bridge tools
  {
    name: "bridge.status",
    description: "Check health and status of the Bridge-MCP server, connected workers, and OpenCode instance",
    risk: "low",
    requiresApproval: false,
    inputSchema: {},
  },
  {
    name: "bridge.capabilities",
    description: "List available tools and features of this MCP server",
    risk: "low",
    requiresApproval: false,
    inputSchema: {},
  },
  // Worker tools
  {
    name: "worker.list",
    description: "List all paired workers and their status",
    risk: "low",
    requiresApproval: false,
    inputSchema: {},
  },
  {
    name: "worker.status",
    description: "Get status of a specific worker",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        workerId: { type: "string", description: "Worker ID" },
      },
    },
  },
  // OpenCode tools
  {
    name: "opencode.sessions.list",
    description: "List all active OpenCode sessions managed by this bridge",
    risk: "low",
    requiresApproval: false,
    inputSchema: {},
  },
  {
    name: "opencode.session.create",
    description: "Create a new OpenCode coding session on a paired worker",
    risk: "medium",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        repository: { type: "string", description: "Repository name or path" },
        title: { type: "string", description: "Session title" },
      },
    },
  },
  {
    name: "opencode.session.get",
    description: "Get details of a specific session",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID" },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "opencode.session.send",
    description: "Send a coding prompt to an active OpenCode session",
    risk: "medium",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID" },
        prompt: { type: "string", description: "Coding instruction" },
      },
      required: ["sessionId", "prompt"],
    },
  },
  {
    name: "opencode.session.stop",
    description: "Stop an active OpenCode session",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID" },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "opencode.session.diff",
    description: "Get the diff of changes made in an OpenCode session",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID" },
      },
      required: ["sessionId"],
    },
  },
  // Repository tools
  {
    name: "repository.status",
    description: "Get git status of a repository on the worker",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        repository: { type: "string", description: "Repository path" },
      },
      required: ["repository"],
    },
  },
  {
    name: "repository.diff",
    description: "Get git diff of a repository on the worker",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        repository: { type: "string", description: "Repository path" },
        ref: { type: "string", description: "Git ref to diff against" },
      },
      required: ["repository"],
    },
  },
  {
    name: "repository.files",
    description: "List files in a repository on the worker",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        repository: { type: "string", description: "Repository path" },
        pattern: { type: "string", description: "Glob pattern to filter" },
      },
      required: ["repository"],
    },
  },
  // Approval tools
  {
    name: "approval.list",
    description: "List pending approval requests",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "all"], description: "Filter by status" },
      },
    },
  },
  {
    name: "approval.request",
    description: "Request approval for a sensitive operation",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action requiring approval" },
        repository: { type: "string", description: "Target repository" },
        reason: { type: "string", description: "Reason for the action" },
        proposedEffect: { type: "string", description: "What this action will change" },
      },
      required: ["action", "repository", "reason", "proposedEffect"],
    },
  },
  {
    name: "approval.resolve",
    description: "Approve or reject a pending approval request",
    risk: "high",
    requiresApproval: true,
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string", description: "Approval ID" },
        resolution: { type: "string", enum: ["approve", "reject"], description: "Resolution" },
        resolvedBy: { type: "string", description: "Who resolved this" },
      },
      required: ["approvalId", "resolution", "resolvedBy"],
    },
  },
  // GitHub tools
  {
    name: "github.status",
    description: "Get GitHub repository status (open PRs, recent commits)",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        repository: { type: "string", description: "GitHub owner/repo" },
      },
    },
  },
  {
    name: "github.review",
    description: "Review a GitHub pull request",
    risk: "high",
    requiresApproval: true,
    inputSchema: {
      type: "object",
      properties: {
        repository: { type: "string", description: "GitHub owner/repo" },
        pullRequest: { type: "number", description: "PR number" },
        review: { type: "string", description: "Review body" },
        event: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"], description: "Review event" },
      },
      required: ["pullRequest", "review", "event"],
    },
  },
  {
    name: "github.pull_request",
    description: "Create a GitHub pull request",
    risk: "critical",
    requiresApproval: true,
    inputSchema: {
      type: "object",
      properties: {
        repository: { type: "string", description: "GitHub owner/repo" },
        title: { type: "string", description: "PR title" },
        body: { type: "string", description: "PR body" },
        head: { type: "string", description: "Source branch" },
        base: { type: "string", description: "Target branch" },
      },
      required: ["title", "body", "head", "base"],
    },
  },
  // Execution
  {
    name: "execution.get",
    description: "Get audit log entries for execution tracking",
    risk: "low",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return" },
      },
    },
  },
];
