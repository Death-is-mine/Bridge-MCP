import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      OPENCODE_BASE_URL: "http://127.0.0.1:4096",
      BRIDGE_PORT: "0",
    },
  },
});
