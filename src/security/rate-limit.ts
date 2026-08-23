import type { Request, Response } from "express";
import { isDev } from "../core/config.js";

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10);
const mcpMaxRequests = parseInt(process.env.RATE_LIMIT_MCP_MAX || "60", 10);

interface Client {
  count: number;
  resetAt: number;
}

const clients = new Map<string, Client>();

function keyFor(req: Request): string {
  return (req.ip || req.socket.remoteAddress || "unknown") + ":" + (req.auth?.clientId || "anon");
}

function checkLimit(key: string, max: number, window: number): { ok: boolean; remaining: number; resetAt: number } {
  if (isDev()) return { ok: true, remaining: max, resetAt: Date.now() + window };
  const now = Date.now();
  let c = clients.get(key);
  if (!c || now > c.resetAt) {
    c = { count: 0, resetAt: now + window };
    clients.set(key, c);
  }
  c.count++;
  const remaining = Math.max(0, max - c.count);
  return { ok: c.count <= max, remaining, resetAt: c.resetAt };
}

export function rateLimit(req: Request, res: Response, next: Function): void {
  const key = keyFor(req);
  const { ok, remaining, resetAt } = checkLimit(key, maxRequests, windowMs);
  res.set("X-RateLimit-Limit", String(maxRequests));
  res.set("X-RateLimit-Remaining", String(remaining));
  res.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
  if (!ok) {
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } });
    return;
  }
  next();
}

export function mcpRateLimit(req: Request, res: Response, next: Function): void {
  const key = "mcp:" + keyFor(req);
  const { ok, remaining, resetAt } = checkLimit(key, mcpMaxRequests, windowMs);
  res.set("X-RateLimit-Limit", String(mcpMaxRequests));
  res.set("X-RateLimit-Remaining", String(remaining));
  res.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
  if (!ok) {
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "MCP rate limit exceeded" } });
    return;
  }
  next();
}
