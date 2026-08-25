import "dotenv/config";
import { v4 as uuid } from "uuid";
import { WorkerClient, type WorkerConfig } from "./client.js";

function loadConfig(): WorkerConfig {
  const bridgeUrl = process.env.BRIDGE_URL || "http://localhost:3000";
  const workerId = process.env.WORKER_ID || uuid();
  const workerToken = process.env.WORKER_TOKEN || "";
  const workerName = process.env.WORKER_NAME || `${process.platform}-worker`;
  const allowedRepositories = (process.env.ALLOWED_REPOSITORIES || "").split(",").filter(Boolean);
  const opencodeUsername = process.env.OPENCODE_SERVER_USERNAME || "opencode";
  const opencodePassword = process.env.OPENCODE_SERVER_PASSWORD || "";

  if (!workerToken) {
    console.error("[worker] WORKER_TOKEN required. Generate one with: uuidgen");
    process.exit(1);
  }

  if (allowedRepositories.length === 0) {
    console.warn("[worker] No ALLOWED_REPOSITORIES set. Repository tools will be disabled.");
  }

  return {
    bridgeUrl,
    workerId,
    workerToken,
    workerName,
    allowedRepositories,
    opencodeUsername,
    opencodePassword,
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const worker = new WorkerClient(config);

  process.on("SIGINT", () => {
    console.log("\n[worker] Shutting down...");
    worker.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    worker.stop();
    process.exit(0);
  });

  await worker.start();
}

main().catch((err) => {
  console.error("[worker] Fatal:", err);
  process.exit(1);
});
