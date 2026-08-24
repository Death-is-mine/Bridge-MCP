import { config } from "../core/config.js";
import { logger } from "../core/audit.js";

const BASE = config.opencode.baseUrl;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.opencode.username) {
    const cred = Buffer.from(`${config.opencode.username}:${config.opencode.password}`).toString("base64");
    h.Authorization = `Basic ${cred}`;
  }
  return h;
}

async function ocFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: authHeaders(),
    signal: AbortSignal.timeout(config.opencode.timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenCode ${res.status} ${path}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function healthCheck(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const data = await ocFetch<{ healthy: boolean; version?: string }>("/api/health");
    return { ok: data.healthy === true, version: data.version };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ponytail: opencode 1.17.x serves a mixed v1/v2 surface — paths verified live
export async function createSession(title?: string): Promise<string> {
  const body = title ? JSON.stringify({ title }) : JSON.stringify({});
  const data = await ocFetch<{ data: { id: string } }>("/api/session", {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  return data.data.id;
}

export async function sendPrompt(sessionId: string, text: string): Promise<string> {
  const data = await ocFetch<{ info?: unknown; parts?: unknown }>(`/session/${sessionId}/message`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ parts: [{ type: "text", text }] }),
  });
  return JSON.stringify(data);
}

export async function stopSession(sessionId: string): Promise<void> {
  await ocFetch(`/api/session/${sessionId}/interrupt`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function getDiff(sessionId?: string): Promise<string> {
  const files = await ocFetch<Array<{ file: string; patch?: string; status?: string; additions?: number; deletions?: number }>>(
    `/session/${sessionId}/diff`,
    { headers: authHeaders() },
  );
  if (!files || files.length === 0) return "";
  return files.map((f) => `${f.file}${f.additions != null ? ` (+${f.additions} -${f.deletions})` : ""}\n${f.patch ?? ""}`).join("\n\n");
}

export async function listSessions(): Promise<string[]> {
  try {
    const data = await ocFetch<{ data: Array<{ id: string }> }>("/api/session");
    return data.data.map((s) => s.id);
  } catch {
    return [];
  }
}
