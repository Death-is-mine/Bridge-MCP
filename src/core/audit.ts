import pino from "pino";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";
import type { AuditEntry } from "./types.js";

export const logger = pino({ level: config.log.level });

const auditEntries: AuditEntry[] = [];
const MAX_IN_MEMORY = 10000;

let logPath = config.audit.logPath;
if (logPath && !existsSync(dirname(logPath))) {
  mkdirSync(dirname(logPath), { recursive: true });
}

export function audit(entry: AuditEntry): void {
  const enriched = { ...entry, timestamp: new Date().toISOString() };
  auditEntries.push(enriched);
  if (auditEntries.length > MAX_IN_MEMORY) auditEntries.shift();
  if (logPath) {
    try {
      appendFileSync(logPath, JSON.stringify(enriched) + "\n");
    } catch {
      logger.warn("Failed to write audit log to file");
    }
  }
}

export function listAuditLogs(limit = 50, clientId?: string): AuditEntry[] {
  let entries = clientId ? auditEntries.filter((e) => e.clientId === clientId) : [...auditEntries];
  return entries.slice(-limit);
}
