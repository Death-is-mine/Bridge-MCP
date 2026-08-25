import type { OpenCodeHealth } from "@bridge-mcp/shared";

export class OpenCodeAdapter {
  private baseUrl: string;
  private auth: string;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl;
    this.auth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.auth,
      "Content-Type": "application/json",
    };
  }

  async health(): Promise<OpenCodeHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as any;
      return { ok: true, version: data.version, sessions: data.sessions };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async listSessions(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/session`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      return await res.json() as any[];
    } catch {
      return [];
    }
  }

  async createSession(title?: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/session`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ title }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
    const data = await res.json() as any;
    return data.id || data.sessionId;
  }

  async getSession(sessionId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/session/${sessionId}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Session not found: ${res.status}`);
    return await res.json();
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/session/${sessionId}/message`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
    const data = await res.json() as any;
    return data.content || data.text || JSON.stringify(data);
  }

  async abortSession(sessionId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/session/${sessionId}/abort`, {
      method: "POST",
      headers: this.headers(),
      signal: AbortSignal.timeout(5000),
    });
  }

  async getDiff(sessionId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/session/${sessionId}/diff`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return "";
    const data = await res.json() as any;
    return data.diff || "";
  }
}

export async function discoverOpenCode(): Promise<string | null> {
  // 1. Try env var
  if (process.env.OPENCODE_BASE_URL) return process.env.OPENCODE_BASE_URL;

  // 2. Try common ports
  const ports = [4096, 4097, 4098, 4099, 4100];
  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return `http://127.0.0.1:${port}`;
    } catch {}
  }

  return null;
}
