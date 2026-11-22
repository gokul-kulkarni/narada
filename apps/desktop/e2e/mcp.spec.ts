import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-expose-headers": "mcp-session-id",
};

/** A small MCP server: an `add` tool and a readme resource. */
function calculator(): McpServer {
  const server = new McpServer({ name: "calculator", version: "1.0.0" });
  server.registerTool(
    "add",
    { description: "Add two numbers", inputSchema: { a: z.number(), b: z.number() } },
    async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }),
  );
  server.registerResource(
    "readme",
    "file:///readme",
    { mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{ uri: uri.href, text: "# Calculator\nAdds numbers." }],
    }),
  );
  return server;
}

const readJson = (req: IncomingMessage) =>
  new Promise<unknown>((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body ? JSON.parse(body) : undefined));
  });

let http: Server;
let url: string;

test.beforeAll(async () => {
  http = createServer(async (req, res) => {
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    // Stateless: a fresh server per request, as the SDK's stateless example does.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = calculator();
    res.on("close", () => void transport.close().then(() => server.close()));
    await server.connect(transport);
    await transport.handleRequest(
      req,
      res,
      req.method === "POST" ? await readJson(req) : undefined,
    );
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
});

test.afterAll(() => {
  http.closeAllConnections();
  http.close();
});

async function importServer(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Import from Postman" }).click();
  await page
    .getByLabel("Import text")
    .fill(JSON.stringify({ mcpServers: { calculator: { url } } }));
  await expect(page.getByRole("list", { name: "Ready to import" })).toContainText(
    "MCP config · 1 server",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Import" }).click();
  await page
    .getByRole("region", { name: "MCP servers" })
    .getByRole("button", { name: /calculator/ })
    .click();
}

test("imports an MCP server, connects, calls a tool and reads a resource", async ({ page }) => {
  await importServer(page);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("calculator 1.0.0")).toBeVisible();

  await page.getByRole("button", { name: "Try add" }).click();
  await page.getByLabel("a", { exact: true }).fill("2");
  await page.getByLabel("b", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Dispatch" }).click();
  const latest = page.getByRole("article", { name: "Latest delivery" });
  await expect(latest.getByTestId("response-status")).toContainText("Delivered · Tool");
  await expect(latest.getByRole("list", { name: "Result content" })).toHaveText("5");

  await page.getByLabel("Operation").selectOption("resource");
  await page.getByLabel("Resource URI").fill("file:///readme");
  await page.getByRole("button", { name: "Dispatch" }).click();
  await expect(latest.getByRole("list", { name: "Result content" })).toContainText("Adds numbers.");
});

test("saves an MCP request to a collection and runs it after a reload", async ({ page }) => {
  await importServer(page);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Try add" }).click();
  await page.getByLabel("a", { exact: true }).fill("4");
  await page.getByLabel("b", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("unsaved")).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: /^▸\s*My Collection$/ }).click();
  await page.getByRole("button", { name: /^MCP\s*add$/ }).click();
  await expect(page.getByLabel("Tool")).toHaveValue("add");
  // Not connected after the reload: dispatching connects first.
  await page.getByRole("button", { name: "Dispatch" }).click();
  const latest = page.getByRole("article", { name: "Latest delivery" });
  await expect(latest.getByRole("list", { name: "Result content" })).toHaveText("9");
});
