// WebSocket protocol messages between Bridge and Worker

// ─── Worker → Bridge ───

export interface WorkerAuthMessage {
  type: "auth";
  workerId: string;
  token: string;
}

export interface WorkerPairMessage {
  type: "pair";
  workerId: string;
  name: string;
  platform: string;
  capabilities?: string[];
  token?: string;
}

export interface WorkerResultMessage {
  type: "result";
  requestId: string;
  data?: unknown;
  error?: string;
}

export interface WorkerStatusMessage {
  type: "status";
  workerId: string;
  state: string;
  opencodeHealth?: boolean;
  activeSessionCount?: number;
}

export interface WorkerPongMessage {
  type: "pong";
}

export interface WorkerReconnectMessage {
  type: "reconnect";
  workerId: string;
  token: string;
  lastSeen: number;
}

export type WorkerMessage =
  | WorkerAuthMessage
  | WorkerPairMessage
  | WorkerResultMessage
  | WorkerStatusMessage
  | WorkerPongMessage
  | WorkerReconnectMessage;

// ─── Bridge → Worker ───

export interface BridgeAuthOkMessage {
  type: "auth_ok";
  workerId: string;
}

export interface BridgeAuthFailMessage {
  type: "auth_fail";
  reason: string;
}

export interface BridgePairOkMessage {
  type: "pair_ok";
  workerId: string;
  pairingCode: string;
}

export interface BridgeExecuteMessage {
  type: "execute";
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
  sessionId?: string;
  timeout?: number;
}

export interface BridgeStopMessage {
  type: "stop";
  requestId: string;
}

export interface BridgePingMessage {
  type: "ping";
}

export interface BridgeSessionUpdateMessage {
  type: "session_update";
  sessionId: string;
  status: string;
  data?: unknown;
}

export type BridgeMessage =
  | BridgeAuthOkMessage
  | BridgeAuthFailMessage
  | BridgePairOkMessage
  | BridgeExecuteMessage
  | BridgeStopMessage
  | BridgePingMessage
  | BridgeSessionUpdateMessage;
