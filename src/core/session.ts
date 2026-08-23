import { v4 as uuid } from "uuid";
import type { BridgeSession, SessionStatus } from "./types.js";

const sessions = new Map<string, BridgeSession>();

export function createSession(clientId: string, repository: string, workingDirectory?: string): BridgeSession {
  const session: BridgeSession = {
    bridgeSessionId: uuid(),
    opencodeSessionId: null,
    clientId,
    repository,
    workingDirectory: workingDirectory || repository,
    status: "IDLE",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastEventAt: null,
  };
  sessions.set(session.bridgeSessionId, session);
  return session;
}

export function getSession(id: string): BridgeSession | undefined {
  return sessions.get(id);
}

export function listSessions(clientId?: string): BridgeSession[] {
  const all = Array.from(sessions.values());
  return clientId ? all.filter((s) => s.clientId === clientId) : all;
}

export function updateSession(id: string, patch: Partial<Pick<BridgeSession, "opencodeSessionId" | "status" | "lastEventAt">>): BridgeSession | undefined {
  const s = sessions.get(id);
  if (!s) return undefined;
  if (patch.opencodeSessionId !== undefined) s.opencodeSessionId = patch.opencodeSessionId;
  if (patch.status !== undefined) s.status = patch.status;
  if (patch.lastEventAt !== undefined) s.lastEventAt = patch.lastEventAt;
  s.updatedAt = new Date();
  return s;
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function findSessionByOpenCodeId(ocSessionId: string): BridgeSession | undefined {
  for (const s of sessions.values()) {
    if (s.opencodeSessionId === ocSessionId) return s;
  }
  return undefined;
}
