// A tiny stdio MCP server for the Rust tests (src/mcp/tests.rs). Needs `pnpm install` at the repo root.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "stdio-calculator", version: "1.0.0" });
server.registerTool(
  "add",
  { description: "Add two numbers", inputSchema: { a: z.number(), b: z.number() } },
  async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }),
);
server.registerTool(
  "whoami",
  { description: "Reads NARADA_TEST from the environment" },
  async () => ({
    content: [{ type: "text", text: process.env.NARADA_TEST ?? "unset" }],
  }),
);
process.stderr.write("stdio-calculator ready\n");
await server.connect(new StdioServerTransport());
