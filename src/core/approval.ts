import { v4 as uuid } from "uuid";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface ApprovalRequest {
  id: string;
  requestId: string;
  action: string;
  repository: string;
  session: string;
  reason: string;
  proposedEffect: string;
  status: ApprovalStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  expiresAt: Date;
}

const requests = new Map<string, ApprovalRequest>();
const DEFAULT_TTL_MS = 300_000;

export function createApproval(
  action: string,
  repository: string,
  session: string,
  reason: string,
  proposedEffect: string,
  ttlMs = DEFAULT_TTL_MS,
): ApprovalRequest {
  const req: ApprovalRequest = {
    id: uuid(),
    requestId: uuid(),
    action,
    repository,
    session,
    reason,
    proposedEffect,
    status: "PENDING",
    createdAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
    expiresAt: new Date(Date.now() + ttlMs),
  };
  requests.set(req.id, req);
  return req;
}

export function getApproval(id: string): ApprovalRequest | undefined {
  return requests.get(id);
}

export function listPendingApprovals(): ApprovalRequest[] {
  return Array.from(requests.values()).filter((r) => r.status === "PENDING");
}

export function listAllApprovals(): ApprovalRequest[] {
  return Array.from(requests.values());
}

export function resolveApproval(id: string, status: "APPROVED" | "REJECTED", resolvedBy: string): ApprovalRequest | undefined {
  const req = requests.get(id);
  if (!req || req.status !== "PENDING") return undefined;
  req.status = status;
  req.resolvedAt = new Date();
  req.resolvedBy = resolvedBy;
  return req;
}

export function expireOldApprovals(): number {
  let expired = 0;
  const now = Date.now();
  for (const req of requests.values()) {
    if (req.status === "PENDING" && now > req.expiresAt.getTime()) {
      req.status = "EXPIRED";
      req.resolvedAt = new Date();
      expired++;
    }
  }
  return expired;
}
