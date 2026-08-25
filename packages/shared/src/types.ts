// Worker states
export type WorkerState = "PAIRING" | "ONLINE" | "OFFLINE" | "BUSY" | "ERROR";

// Worker record
export interface Worker {
  id: string;
  userId: string;
  name: string;
  platform: string;
  status: WorkerState;
  lastSeen: number;
  capabilities: string[];
  pairedAt: number;
  wsConnectionId?: string;
}

// Session record
export type SessionStatus = "created" | "active" | "running" | "completed" | "failed";

export interface Session {
  id: string;
  bridgeId: string;
  workerId?: string;
  opencodeSessionId?: string;
  userId: string;
  repository: string;
  workingDirectory?: string;
  title?: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  lastEventAt?: number;
}

// Approval record
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface Approval {
  id: string;
  requestId: string;
  userId: string;
  workerId?: string;
  sessionId?: string;
  action: string;
  repository: string;
  reason: string;
  proposedEffect: string;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}

// Audit entry
export interface AuditEntry {
  id?: number;
  requestId: string;
  userId: string;
  clientId: string;
  workerId?: string;
  sessionId?: string;
  tool: string;
  args?: string;
  result?: string;
  repository?: string;
  permission?: string;
  approvalStatus?: string;
  status: string;
  errorCode?: string;
  startTime?: number;
  endTime?: number;
}

// OAuth client
export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

// OAuth token
export interface OAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

// Bridge status
export interface BridgeStatus {
  ok: boolean;
  version: string;
  uptime: number;
  workerCount: number;
  onlineWorkers: number;
  activeSessions: number;
}

// OpenCode health
export interface OpenCodeHealth {
  ok: boolean;
  version?: string;
  sessions?: number;
  error?: string;
}

// Tool risk levels
export type RiskLevel = "low" | "medium" | "high" | "critical";

// MCP tool definition
export interface McpToolDef {
  name: string;
  description: string;
  risk: RiskLevel;
  requiresApproval: boolean;
  inputSchema: Record<string, unknown>;
}
