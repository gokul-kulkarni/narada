import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ClientEvent, ListKind, McpClient, ServerInfo } from "./client";

const CLIENT_INFO = { name: "Narada", version: "browser" };

type Page = { readonly nextCursor?: string } & Record<string, unknown>;

/** Follows `nextCursor` until the server has listed everything. */
async function listAll(
  fetchPage: (cursor?: string) => Promise<Page>,
  key: string,
): Promise<unknown[]> {
  const items: unknown[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    items.push(...((page[key] as unknown[] | undefined) ?? []));
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

/**
 * Browser build (and E2E tests): the official TypeScript SDK over Streamable HTTP.
 * Local stdio servers need the desktop app, which can start processes.
 */
export function createBrowserMcpClient(): McpClient {
  const sessions = new Map<string, Client>();
  const session = (id: string) => {
    const found = sessions.get(id);
    if (!found) throw new Error("Not connected to this server. Connect first.");
    return found;
  };

  return {
    async connect(id, transport, onEvent: (event: ClientEvent) => void): Promise<ServerInfo> {
      await sessions.get(id)?.close();
      sessions.delete(id);
      if (transport.type === "stdio") {
        throw new Error("Local (stdio) servers need the Narada desktop app.");
      }
      const client = new Client(CLIENT_INFO);
      client.fallbackNotificationHandler = async ({ method, params }) =>
        onEvent({ kind: "notification", method, params });
      const http = new StreamableHTTPClientTransport(new URL(transport.url), {
        requestInit: { headers: Object.fromEntries(transport.headers) },
      });
      await client.connect(http);
      sessions.set(id, client);
      return {
        serverInfo: client.getServerVersion(),
        capabilities: client.getServerCapabilities(),
        instructions: client.getInstructions(),
      };
    },

    async list(id, kind: ListKind) {
      const client = session(id);
      switch (kind) {
        case "tools":
          return listAll((cursor) => client.listTools({ cursor }), "tools");
        case "resources":
          return listAll((cursor) => client.listResources({ cursor }), "resources");
        case "resourceTemplates":
          return listAll((cursor) => client.listResourceTemplates({ cursor }), "resourceTemplates");
        case "prompts":
          return listAll((cursor) => client.listPrompts({ cursor }), "prompts");
      }
    },

    async run(id, operation, timeoutMs) {
      const client = session(id);
      const options = { timeout: timeoutMs };
      const started = performance.now();
      const result =
        operation.type === "tool"
          ? await client.callTool(
              { name: operation.name, arguments: { ...operation.arguments } },
              undefined,
              options,
            )
          : operation.type === "resource"
            ? await client.readResource({ uri: operation.uri }, options)
            : await client.getPrompt(
                { name: operation.name, arguments: stringArgs(operation.arguments) },
                options,
              );
      return { result, timeMs: Math.round(performance.now() - started) };
    },

    async disconnect(id) {
      await sessions.get(id)?.close();
      sessions.delete(id);
    },
  };
}

/** Prompt arguments are strings in MCP. */
const stringArgs = (args: Readonly<Record<string, unknown>>) =>
  Object.fromEntries(
    Object.entries(args).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
  );
