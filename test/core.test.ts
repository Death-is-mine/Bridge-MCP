import { describe, it, expect } from "vitest";

describe("path traversal protection", () => {
  it("blocks relative path escapes", async () => {
    const { isPathSafe } = await import("../src/security/path-traversal.js");
    expect(isPathSafe("/home/user", "../../etc/passwd")).toBe(false);
  });

  it("allows safe paths", async () => {
    const { isPathSafe } = await import("../src/security/path-traversal.js");
    expect(isPathSafe("/home/user", "Documents/file.txt")).toBe(true);
  });
});

describe("session manager", () => {
  it("creates and retrieves sessions", async () => {
    const { createSession, getSession, listSessions } = await import("../src/core/session.js");
    const s = createSession("test-client", "/tmp/repo");
    expect(s.bridgeSessionId).toBeTruthy();
    expect(s.status).toBe("IDLE");
    expect(s.clientId).toBe("test-client");
    expect(s.repository).toBe("/tmp/repo");
    expect(getSession(s.bridgeSessionId)).toBe(s);
    expect(listSessions("test-client")).toContain(s);
  });

  it("updates session", async () => {
    const { createSession, updateSession, getSession } = await import("../src/core/session.js");
    const s = createSession("c", ".");
    expect(s.lastEventAt).toBeNull();
    updateSession(s.bridgeSessionId, { status: "RUNNING", opencodeSessionId: "oc-123" });
    const updated = getSession(s.bridgeSessionId);
    expect(updated?.status).toBe("RUNNING");
    expect(updated?.opencodeSessionId).toBe("oc-123");
    updateSession(s.bridgeSessionId, { lastEventAt: new Date() });
    expect(getSession(s.bridgeSessionId)?.lastEventAt).toBeTruthy();
  });

  it("deletes session", async () => {
    const { createSession, deleteSession, getSession } = await import("../src/core/session.js");
    const s = createSession("c", ".");
    expect(deleteSession(s.bridgeSessionId)).toBe(true);
    expect(getSession(s.bridgeSessionId)).toBeUndefined();
  });

  it("lists all or by clientId", async () => {
    const { createSession, listSessions } = await import("../src/core/session.js");
    const s1 = createSession("client-a", "/a");
    const s2 = createSession("client-b", "/b");
    expect(listSessions("client-a")).toContain(s1);
    expect(listSessions("client-b")).not.toContain(s1);
    expect(listSessions().length).toBeGreaterThanOrEqual(2);
  });
});

describe("approval system", () => {
  it("creates and resolves approvals", async () => {
    const { createApproval, getApproval, listPendingApprovals, resolveApproval } = await import("../src/core/approval.js");
    const a = createApproval("git push", "/repo", "sess-1", "User requested", "Pushes to remote");
    expect(a.status).toBe("PENDING");
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(listPendingApprovals()).toContain(a);
    resolveApproval(a.id, "APPROVED", "admin");
    expect(getApproval(a.id)?.status).toBe("APPROVED");
    expect(getApproval(a.id)?.resolvedBy).toBe("admin");
  });

  it("rejects approvals", async () => {
    const { createApproval, resolveApproval, getApproval } = await import("../src/core/approval.js");
    const a = createApproval("dangerous", "/repo", "s", "reason", "effect");
    resolveApproval(a.id, "REJECTED", "reviewer");
    expect(getApproval(a.id)?.status).toBe("REJECTED");
  });

  it("expires old approvals", async () => {
    const { createApproval, expireOldApprovals, getApproval } = await import("../src/core/approval.js");
    const a = createApproval("test", "/repo", "s", "r", "e", -1);
    expireOldApprovals();
    expect(getApproval(a.id)?.status).toBe("EXPIRED");
  });
});

describe("audit logger", () => {
  it("records entries", async () => {
    const { audit, listAuditLogs } = await import("../src/core/audit.js");
    audit({
      requestId: "req-1",
      clientId: "test",
      userId: "u",
      tool: "test_tool",
      argumentsHash: "{}",
      repository: "/repo",
      bridgeSessionId: "s1",
      opencodeSessionId: "oc1",
      permission: "",
      approvalStatus: "",
      status: "ok",
    });
    const log = listAuditLogs(5, "test");
    expect(log.length).toBeGreaterThan(0);
    expect(log[log.length - 1].tool).toBe("test_tool");
  });
});
