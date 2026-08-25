#!/usr/bin/env node
// E2E runner: starts bridge+worker, runs tests, exits
import { spawn } from "node:child_process";
import http from "node:http";
import { unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const BRIDGE_PORT = 3456;
const WORKER_TOKEN = "e2e-test-token";
const WORKER_ID = "e2e-worker-001";

function httpGet(url) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    http.get({ hostname: u.hostname, port: u.port, path: u.pathname }, (r) => {
      let body = "";
      r.on("data", (c) => (body += c));
      r.on("end", () => res({ status: r.statusCode, body, headers: r.headers }));
    }).on("error", rej);
  });
}

function httpPost(url, data, extraHeaders = {}) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { "Content-Type": "application/json", ...extraHeaders } },
      (r) => {
        let body = "";
        r.on("data", (c) => (body += c));
        r.on("end", () => res({ status: r.statusCode, body, headers: r.headers }));
      }
    );
    req.on("error", rej);
    req.write(data);
    req.end();
  });
}

function waitForHealth(maxMs = 30000) {
  const start = Date.now();
  return new Promise(async (resolve, reject) => {
    while (Date.now() - start < maxMs) {
      try {
        const r = await httpGet(`http://localhost:${BRIDGE_PORT}/health`);
        if (r.status === 200) return resolve();
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    reject(new Error("Health timeout"));
  });
}

function mcpInit() {
  return httpPost(
    `http://localhost:${BRIDGE_PORT}/mcp`,
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1.0.0" } } }),
    { Accept: "application/json, text/event-stream" }
  ).then((res) => {
    const sid = res.headers["mcp-session-id"];
    if (!sid) throw new Error("No session: " + res.body.slice(0, 200));
    return sid;
  });
}

function mcpCall(sid, tool, args = {}) {
  return httpPost(
    `http://localhost:${BRIDGE_PORT}/mcp`,
    JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: tool, arguments: args } }),
    { Accept: "application/json, text/event-stream", "Mcp-Session-Id": sid }
  ).then((res) => {
    const m = res.body.match(/data: (.+)/);
    if (!m) throw new Error("No SSE: " + res.body.slice(0, 200));
    return JSON.parse(m[1]).result;
  });
}

function mcpListTools(sid) {
  return httpPost(
    `http://localhost:${BRIDGE_PORT}/mcp`,
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    { Accept: "application/json, text/event-stream", "Mcp-Session-Id": sid }
  ).then((res) => {
    const m = res.body.match(/data: (.+)/);
    return JSON.parse(m[1]).result.tools;
  });
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

// Main
for (const f of ["bridge.db", "bridge.db-wal", "bridge.db-shm"]) {
  try { unlinkSync(resolve(ROOT, f)); } catch {}
}

console.log("Starting bridge...");
const bridge = spawn("node", [resolve(ROOT, "packages/bridge/dist/index.js")], {
  cwd: ROOT,
  env: { ...process.env, BRIDGE_PORT: String(BRIDGE_PORT), OPENCODE_SERVER_PASSWORD: "", BRIDGE_AUTH_SECRET: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
bridge.stderr.on("data", (d) => process.stderr.write(d));
bridge.on("error", (e) => { console.error("Bridge error:", e.message); process.exit(1); });

try {
  await waitForHealth();
} catch {
  console.error("Bridge failed to start within timeout");
  bridge.kill();
  process.exit(1);
}
console.log("Bridge ready");

console.log("Starting worker...");
const worker = spawn("node", [resolve(ROOT, "packages/worker/dist/index.js")], {
  cwd: ROOT,
  env: {
    ...process.env,
    BRIDGE_URL: `http://localhost:${BRIDGE_PORT}`,
    WORKER_ID, WORKER_TOKEN, WORKER_NAME: "e2e-worker",
    ALLOWED_REPOSITORIES: resolve(ROOT, "test-project"),
    OPENCODE_SERVER_USERNAME: "opencode", OPENCODE_SERVER_PASSWORD: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
worker.stderr.on("data", (d) => process.stderr.write(d));
worker.on("error", (e) => { console.error("Worker error:", e.message); });

await new Promise((r) => setTimeout(r, 3000));
console.log("Worker connecting, approving...");
await httpPost(`http://localhost:${BRIDGE_PORT}/api/workers/${WORKER_ID}/approve`, "{}").catch(() => {});
await new Promise((r) => setTimeout(r, 2000));

console.log("\nRunning E2E tests:\n");

await test("health endpoint", async () => {
  const r = await httpGet(`http://localhost:${BRIDGE_PORT}/health`);
  const d = JSON.parse(r.body);
  if (!d.bridge.ok) throw new Error("not ok");
});

await test("worker is online via REST", async () => {
  const r = await httpGet(`http://localhost:${BRIDGE_PORT}/api/workers`);
  const w = JSON.parse(r.body);
  if (w.length < 1) throw new Error(`expected >=1 workers, got ${w.length}`);
  if (w[0].status !== "ONLINE") throw new Error(`expected ONLINE, got ${w[0].status}`);
});

await test("MCP initialize returns session", async () => {
  const sid = await mcpInit();
  if (!sid || sid.length === 0) throw new Error("empty session ID");
});

await test("tools/list returns tools", async () => {
  const sid = await mcpInit();
  const tools = await mcpListTools(sid);
  if (tools.length < 10) throw new Error(`expected >=10 tools, got ${tools.length}`);
});

await test("bridge.status tool", async () => {
  const sid = await mcpInit();
  const r = await mcpCall(sid, "bridge.status");
  const d = JSON.parse(r.content[0].text);
  if (!d.bridge.ok) throw new Error("bridge not ok");
  if (d.workers.online < 1) throw new Error(`expected >=1 online, got ${d.workers.online}`);
});

await test("worker.list tool", async () => {
  const sid = await mcpInit();
  const r = await mcpCall(sid, "worker.list");
  const w = JSON.parse(r.content[0].text);
  if (w.length < 1) throw new Error("no workers");
  if (!w[0].name) throw new Error("no name");
});

await test("sessions scoped to user (empty)", async () => {
  const sid = await mcpInit();
  const r = await mcpCall(sid, "opencode.sessions.list");
  const sessions = JSON.parse(r.content[0].text);
  if (!Array.isArray(sessions)) throw new Error("not array");
});

await test("dashboard serves HTML", async () => {
  const r = await httpGet(`http://localhost:${BRIDGE_PORT}/`);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  if (!r.body.includes("Bridge-MCP Dashboard")) throw new Error("missing dashboard content");
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);

bridge.kill();
worker.kill();
process.exit(failed > 0 ? 1 : 0);
