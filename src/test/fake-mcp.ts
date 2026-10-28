import { vi } from "vitest";
import type { ClientEvent, ListKind, McpClient, ServerInfo } from "../lib/mcp/client";
import { setMcpClient } from "../lib/mcp/client";

export const ADD_TOOL = {
  name: "add",
  description: "Add two numbers",
  inputSchema: {
    type: "object",
    required: ["a", "b"],
    properties: { a: { type: "integer" }, b: { type: "integer" } },
  },
};

export const SERVER_INFO: ServerInfo = {
  protocolVersion: "2025-11-25",
  serverInfo: { name: "calculator", version: "1.0.0" },
  capabilities: { tools: {}, resources: {}, prompts: {} },
};

/** An in-memory MCP client with an `add` tool, a resource and a prompt. */
export function installFakeMcp(overrides: Partial<McpClient> = {}) {
  const events: { emit?: (event: ClientEvent) => void } = {};
  const client: McpClient = {
    connect: vi.fn(async (_id, _transport, onEvent) => {
      events.emit = onEvent;
      return SERVER_INFO;
    }),
    list: vi.fn(async (_id: string, kind: ListKind): Promise<readonly unknown[]> => {
      switch (kind) {
        case "tools":
          return [ADD_TOOL];
        case "resources":
          return [{ uri: "file:///readme", name: "readme" }];
        case "resourceTemplates":
          return [];
        case "prompts":
          return [{ name: "greet", arguments: [{ name: "who", required: true }] }];
      }
    }),
    run: vi.fn(async (_id, operation) => {
      if (operation.type === "tool") {
        const { a, b } = operation.arguments as { a: number; b: number };
        return { result: { content: [{ type: "text", text: String(a + b) }] }, timeMs: 7 };
      }
      if (operation.type === "resource") {
        return { result: { contents: [{ uri: operation.uri, text: "# Hello" }] }, timeMs: 3 };
      }
      return {
        result: { messages: [{ role: "user", content: { type: "text", text: "Hi Ada" } }] },
        timeMs: 2,
      };
    }),
    disconnect: vi.fn(async () => undefined),
    ...overrides,
  };
  setMcpClient(client);
  return { client, events };
}
