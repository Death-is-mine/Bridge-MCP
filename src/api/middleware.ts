import type { Request, Response, NextFunction } from "express";
import { config } from "../core/config.js";

const VALID_TOKENS = new Set<string>();

export function registerAuthToken(token: string): void {
  VALID_TOKENS.add(token);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.bridge.authSecret) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing auth token" } });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== config.bridge.authSecret && !VALID_TOKENS.has(token)) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Invalid token" } });
    return;
  }

  next();
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const message = err.message || "Internal error";
  const code = message.includes("OpenCode") ? "OPENCODE_ERROR" : "INTERNAL_ERROR";
  res.status(code === "OPENCODE_ERROR" ? 502 : 500).json({
    error: { code, message, requestId: "" },
  });
}
