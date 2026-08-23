import type { Request, Response, NextFunction } from "express";
import { config, isDev } from "../core/config.js";
import { validateAccessToken } from "./oauth.js";
import { audit, logger } from "../core/audit.js";
import { v4 as uuid } from "uuid";

export interface AuthContext {
  clientId: string;
  userId: string;
  scope: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (isDev() && !config.bridge.authSecret) {
    req.auth = { clientId: "dev", userId: "dev", scope: "read write admin" };
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Missing authorization header" } });
    return;
  }

  const token = authHeader.slice(7);

  if (token === config.bridge.authSecret) {
    req.auth = { clientId: "bridge", userId: "admin", scope: "read write admin" };
    next();
    return;
  }

  const oauthToken = validateAccessToken(token);
  if (oauthToken) {
    req.auth = { clientId: oauthToken.clientId, userId: oauthToken.userId, scope: oauthToken.scope };
    next();
    return;
  }

  res.status(401).json({ error: { code: "AUTH_INVALID", message: "Invalid or expired token" } });
}

export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth?.scope.includes(scope)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: `Requires scope: ${scope}` } });
      return;
    }
    next();
  };
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = uuid();
  const message = err.message || "Internal error";
  const code = message.includes("OpenCode") ? "OPENCODE_ERROR" : "INTERNAL_ERROR";
  logger.error({ err: message, requestId, path: req.path }, "request error");
  audit({
    requestId,
    clientId: req.auth?.clientId || "unknown",
    userId: req.auth?.userId || "unknown",
    tool: req.path,
    argumentsHash: "",
    repository: "",
    bridgeSessionId: "",
    opencodeSessionId: "",
    permission: "",
    approvalStatus: "",
    status: "error",
    errorCode: code,
  });
  res.status(code === "OPENCODE_ERROR" ? 502 : 500).json({
    error: { code, message: isDev() ? message : "Internal error", requestId },
  });
}
