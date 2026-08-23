import { spawn, execSync } from "node:child_process";
import { logger } from "../core/audit.js";
import { config } from "../core/config.js";

function ocArgs(...extra: string[]): string[] {
  const args = ["-y", "opencode", "-o", "json"];
  if (config.opencode.username) {
    args.push("-u", config.opencode.username);
  }
  return [...args, ...extra];
}

function ocExec(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ocArgs(...args), {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: config.opencode.timeoutMs,
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`OpenCode exited ${code}: ${stderr || stdout}`));
    });
    child.on("error", reject);
  });
}

export async function healthCheck(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const { stdout } = await ocExec(["version"]);
    const version = stdout.trim().split("\n")[0];
    return { ok: true, version };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function createSession(title?: string): Promise<string> {
  const args = ["session", "create"];
  if (title) args.push("--title", title);
  const { stdout } = await ocExec(args);
  const parsed = JSON.parse(stdout);
  return parsed.id || parsed.sessionId || parsed;
}

export async function sendPrompt(sessionId: string, text: string): Promise<string> {
  const { stdout } = await ocExec(["session", "send", "--session", sessionId, "--message", text]);
  return stdout.trim();
}

export async function stopSession(sessionId: string): Promise<void> {
  await ocExec(["session", "stop", "--session", sessionId]);
}

export async function getDiff(sessionId: string): Promise<string> {
  try {
    const { stdout } = await ocExec(["session", "diff", "--session", sessionId]);
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function listEvents(sessionId: string, since?: number, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const args = ["session", "events", "--session", sessionId];
      if (since) args.push("--since", String(since));
      const child = spawn("npx", ocArgs(...args), {
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
      });
      child.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(encoder.encode(chunk.toString()));
      });
      child.on("close", () => controller.close());
      child.on("error", (err) => controller.error(err));
      if (signal) {
        signal.addEventListener("abort", () => {
          child.kill();
          controller.close();
        });
      }
    },
  });
  return stream;
}

export async function listSessions(): Promise<string[]> {
  try {
    const { stdout } = await ocExec(["session", "list"]);
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) return parsed.map((s: any) => s.id || s.sessionId || String(s));
    return [];
  } catch {
    return [];
  }
}
