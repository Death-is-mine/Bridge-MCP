import express from "express";
import helmet from "helmet";
import { config } from "./core/config.js";
import { logger, audit } from "./core/audit.js";
import router from "./api/routes.js";
import { errorHandler } from "./auth/middleware.js";
import { corsMiddleware } from "./security/cors.js";
import { expireOldApprovals } from "./core/approval.js";

const app = express();

// ─── Security ───
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));

// ─── Request logging ───
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    logger.info({ method: req.method, path: req.path, status: res.statusCode, ms }, "request");
  });
  next();
});

// ─── Routes ───
app.use(router);

// ─── 404 ───
app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Endpoint not found" } });
});

// ─── Error handler ───
app.use(errorHandler);

// ─── Expire old approvals periodically ───
setInterval(() => {
  const expired = expireOldApprovals();
  if (expired > 0) logger.info({ expired }, "expired old approvals");
}, 60_000);

// ─── Start ───
app.listen(config.bridge.port, config.bridge.host, () => {
  logger.info({ host: config.bridge.host, port: config.bridge.port, env: config.nodeEnv }, "bridge started");
  audit({
    requestId: "startup",
    clientId: "system",
    userId: "system",
    tool: "bridge.start",
    argumentsHash: "",
    repository: "",
    bridgeSessionId: "",
    opencodeSessionId: "",
    permission: "",
    approvalStatus: "",
    status: "ok",
  });
});

export default app;
