import WebSocket from "ws";
import { v4 as uuid } from "uuid";
import type { BridgeMessage, WorkerMessage } from "@bridge-mcp/shared";
import { OpenCodeAdapter, discoverOpenCode } from "./opencode.js";
import { RepositoryManager } from "./repository.js";

export interface WorkerConfig {
  bridgeUrl: string;
  workerId: string;
  workerToken: string;
  workerName: string;
  allowedRepositories: string[];
  opencodeUsername: string;
  opencodePassword: string;
}

export class WorkerClient {
  private ws: WebSocket | null = null;
  private config: WorkerConfig;
  private opencode: OpenCodeAdapter | null = null;
  private repos: RepositoryManager;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30_000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(config: WorkerConfig) {
    this.config = config;
    this.repos = new RepositoryManager(config.allowedRepositories);
  }

  async start(): Promise<void> {
    console.log(`[worker] Starting worker ${this.config.workerName} (${this.config.workerId})`);

    // Discover OpenCode
    const ocUrl = await discoverOpenCode();
    if (ocUrl) {
      this.opencode = new OpenCodeAdapter(ocUrl, this.config.opencodeUsername, this.config.opencodePassword);
      const health = await this.opencode.health();
      console.log(`[worker] OpenCode: ${health.ok ? "connected" : "unavailable"} at ${ocUrl}`);
    } else {
      console.log("[worker] OpenCode: not found, will retry on first request");
    }

    this.connect();
  }

  private connect(): void {
    const url = `${this.config.bridgeUrl}/ws/worker`;
    console.log(`[worker] Connecting to ${url}`);

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[worker] Connected to Bridge");
      this.reconnectDelay = 1000;

      // Try auth first, then pair if needed
      this.send({
        type: "auth",
        workerId: this.config.workerId,
        token: this.config.workerToken,
      });
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as BridgeMessage;
        this.handleMessage(msg);
      } catch (err) {
        console.error("[worker] Invalid message:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[worker] Disconnected from Bridge");
      this.stopPing();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[worker] WebSocket error:", err.message);
    });
  }

  private handleMessage(msg: BridgeMessage): void {
    switch (msg.type) {
      case "auth_ok":
        console.log(`[worker] Authenticated as ${msg.workerId}`);
        this.startPing();
        this.reportStatus("ONLINE");
        break;

      case "auth_fail":
        console.error(`[worker] Auth failed: ${msg.reason}`);
        // If auth fails, try pairing
        this.send({
          type: "pair",
          workerId: this.config.workerId,
          name: this.config.workerName,
          platform: process.platform,
          capabilities: ["opencode", "git", "filesystem"],
          token: this.config.workerToken,
        });
        break;

      case "pair_ok":
        console.log(`[worker] Paired! Code: ${msg.pairingCode}`);
        console.log(`[worker] Enter this code in Bridge dashboard to complete pairing`);
        // Retry auth after a short delay — approval may have already happened
        setTimeout(() => {
          this.send({ type: "auth", workerId: this.config.workerId, token: this.config.workerToken });
        }, 2000);
        break;

      case "execute":
        this.handleExecute(msg);
        break;

      case "stop":
        this.handleStop(msg.requestId);
        break;

      case "ping":
        this.send({ type: "pong" });
        break;

      case "session_update":
        console.log(`[worker] Session ${msg.sessionId}: ${msg.status}`);
        break;
    }
  }

  private async handleExecute(msg: { requestId: string; tool: string; args: Record<string, unknown>; sessionId?: string; timeout?: number }): Promise<void> {
    const { requestId, tool, args } = msg;
    console.log(`[worker] Executing: ${tool}`);

    try {
      // Ensure OpenCode is connected
      if (!this.opencode) {
        const ocUrl = await discoverOpenCode();
        if (ocUrl) {
          this.opencode = new OpenCodeAdapter(ocUrl, this.config.opencodeUsername, this.config.opencodePassword);
        } else {
          throw new Error("OpenCode not available");
        }
      }

      let result: unknown;

      switch (tool) {
        case "bridge.status":
          result = {
            bridge: { ok: true, version: "1.0.0" },
            opencode: await this.opencode.health(),
            worker: { id: this.config.workerId, name: this.config.workerName, platform: process.platform },
          };
          break;

        case "opencode.session.create":
          result = await this.opencode.createSession(args.title as string);
          break;

        case "opencode.session.send":
          result = await this.opencode.sendMessage(args.sessionId as string, args.prompt as string);
          break;

        case "opencode.session.stop":
          await this.opencode.abortSession(args.sessionId as string);
          result = { status: "stopped" };
          break;

        case "opencode.session.diff":
          result = await this.opencode.getDiff(args.sessionId as string);
          break;

        case "repository.status":
          result = this.repos.getStatus(args.repository as string);
          break;

        case "repository.diff":
          result = this.repos.getDiff(args.repository as string, args.ref as string);
          break;

        case "repository.files":
          result = this.repos.getFiles(args.repository as string, args.pattern as string);
          break;

        default:
          throw new Error(`Unknown tool: ${tool}`);
      }

      this.send({ type: "result", requestId, data: result });
    } catch (err: any) {
      this.send({ type: "result", requestId, error: err.message });
    }
  }

  private handleStop(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      pending.timer && clearTimeout(pending.timer);
      pending.reject(new Error("Aborted"));
      this.pendingRequests.delete(requestId);
    }
  }

  private send(msg: WorkerMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private reportStatus(state: string): void {
    this.send({
      type: "status",
      workerId: this.config.workerId,
      state,
      opencodeHealth: false, // will be updated
    });
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: "pong" });
    }, 30_000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    console.log(`[worker] Reconnecting in ${this.reconnectDelay}ms...`);
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  stop(): void {
    this.stopPing();
    this.ws?.close();
  }
}
