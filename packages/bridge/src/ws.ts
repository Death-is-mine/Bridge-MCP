import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import type { BridgeMessage, WorkerMessage } from "@bridge-mcp/shared";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";

export interface WorkerConnection {
  id: string;
  workerId: string;
  userId: string;
  ws: WebSocket;
  lastSeen: number;
  authenticated: boolean;
}

export class WorkerWsServer {
  private wss: WebSocketServer;
  private connections = new Map<string, WorkerConnection>();
  private db: Database.Database;
  private pendingExecutions = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(server: Server, db: Database.Database) {
    this.db = db;
    this.wss = new WebSocketServer({ server, path: "/ws/worker" });

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Ping all workers every 30s
    setInterval(() => {
      for (const [id, conn] of this.connections) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(JSON.stringify({ type: "ping" }));
        } else {
          this.connections.delete(id);
        }
      }
    }, 30_000);
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const connectionId = uuid();
    console.log(`[ws] New worker connection: ${connectionId}`);

    let authenticated = false;
    let workerId = "";

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WorkerMessage;

        if (msg.type === "auth" && !authenticated) {
          // Validate token
          const worker = this.db.prepare("SELECT * FROM workers WHERE id = ? AND auth_token = ?").get(msg.workerId, msg.token) as any;
          if (worker) {
            authenticated = true;
            workerId = msg.workerId;
            this.connections.set(connectionId, {
              id: connectionId,
              workerId: msg.workerId,
              userId: worker.user_id,
              ws,
              lastSeen: Date.now(),
              authenticated: true,
            });
            this.db.prepare("UPDATE workers SET status = 'ONLINE', last_seen = ?, ws_connection_id = ? WHERE id = ?")
              .run(Date.now(), connectionId, msg.workerId);
            ws.send(JSON.stringify({ type: "auth_ok", workerId: msg.workerId }));
            console.log(`[ws] Worker authenticated: ${msg.workerId}`);
          } else {
            ws.send(JSON.stringify({ type: "auth_fail", reason: "Invalid credentials" }));
          }
          return;
        }

        if (msg.type === "pair" && !authenticated) {
          // New worker pairing — store with the token the worker will use
          const pairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          const authToken = msg.token || uuid();
          this.db.prepare(`INSERT OR REPLACE INTO workers (id, user_id, name, platform, status, last_seen, capabilities, paired_at, auth_token)
            VALUES (?, ?, ?, ?, 'PAIRING', ?, ?, ?, ?)`)
            .run(msg.workerId, "pending", msg.name, msg.platform, Date.now(), JSON.stringify(msg.capabilities || []), Date.now(), authToken);
          ws.send(JSON.stringify({ type: "pair_ok", workerId: msg.workerId, pairingCode }));
          console.log(`[ws] Worker pairing: ${msg.workerId}, code: ${pairingCode}`);
          return;
        }

        if (!authenticated) {
          ws.send(JSON.stringify({ type: "auth_fail", reason: "Not authenticated" }));
          return;
        }

        // Handle authenticated messages
        this.handleWorkerMessage(connectionId, msg);
      } catch (err) {
        console.error("[ws] Invalid message:", err);
      }
    });

    ws.on("close", () => {
      console.log(`[ws] Worker disconnected: ${connectionId}`);
      if (workerId) {
        this.db.prepare("UPDATE workers SET status = 'OFFLINE', ws_connection_id = NULL WHERE id = ?").run(workerId);
      }
      this.connections.delete(connectionId);
    });
  }

  private handleWorkerMessage(connectionId: string, msg: WorkerMessage): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    conn.lastSeen = Date.now();

    switch (msg.type) {
      case "result": {
        const pending = this.pendingExecutions.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingExecutions.delete(msg.requestId);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.data);
          }
        }
        break;
      }

      case "status": {
        this.db.prepare("UPDATE workers SET status = ?, last_seen = ? WHERE id = ?")
          .run(msg.state, Date.now(), msg.workerId);
        break;
      }

      case "pong": {
        conn.lastSeen = Date.now();
        break;
      }
    }
  }

  executeOnWorker(workerId: string, tool: string, args: Record<string, unknown>, timeoutMs = 300_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const conn = Array.from(this.connections.values()).find((c) => c.workerId === workerId && c.authenticated);
      if (!conn) {
        reject(new Error("Worker not connected"));
        return;
      }

      const requestId = uuid();
      const timer = setTimeout(() => {
        this.pendingExecutions.delete(requestId);
        reject(new Error("Execution timeout"));
      }, timeoutMs);

      this.pendingExecutions.set(requestId, { resolve, reject, timer });

      const msg: BridgeMessage = {
        type: "execute",
        requestId,
        tool,
        args,
      };

      conn.ws.send(JSON.stringify(msg));
    });
  }

  getOnlineWorkers(): WorkerConnection[] {
    return Array.from(this.connections.values()).filter((c) => c.authenticated);
  }

  getWorkerByUserId(userId: string): WorkerConnection | undefined {
    return Array.from(this.connections.values()).find((c) => c.userId === userId && c.authenticated);
  }

  isConnected(workerId: string): boolean {
    return Array.from(this.connections.values()).some((c) => c.workerId === workerId && c.authenticated);
  }
}
