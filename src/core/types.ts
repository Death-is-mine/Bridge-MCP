export type SessionStatus = "IDLE" | "RUNNING" | "WAITING" | "STOPPING" | "COMPLETED" | "FAILED" | "DISCONNECTED";

export interface BridgeSession {
  bridgeSessionId: string;
  opencodeSessionId: string | null;
  clientId: string;
  repository: string;
  workingDirectory: string;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  lastEventAt: Date | null;
}

export interface SendPromptRequest {
  session: BridgeSession;
  prompt: string;
}

export interface OpenCodeEvent {
  type: string;
  data: unknown;
  timestamp: Date;
}

export interface AuditEntry {
  requestId: string;
  clientId: string;
  userId: string;
  tool: string;
  argumentsHash: string;
  repository: string;
  bridgeSessionId: string;
  opencodeSessionId: string;
  permission: string;
  approvalStatus: string;
  status: string;
  errorCode?: string;
  startedAt?: string;
  completedAt?: string;
}
