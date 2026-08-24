import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";

const transports = new Map<string, StreamableHTTPServerTransport>();

export function getTransport(sessionId: string): StreamableHTTPServerTransport | undefined {
  return transports.get(sessionId);
}

export function removeTransport(sessionId: string): void {
  transports.delete(sessionId);
}

export async function createTransport(
  server: { connect(transport: StreamableHTTPServerTransport): Promise<void> },
  sessionId?: string,
): Promise<{ transport: StreamableHTTPServerTransport; sessionId: string }> {
  const sid = sessionId || randomUUID();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sid,
    onsessioninitialized: (id) => {
      transports.set(id, transport);
    },
    onsessionclosed: (id) => {
      transports.delete(id);
    },
  });
  await server.connect(transport);
  return { transport, sessionId: sid };
}
