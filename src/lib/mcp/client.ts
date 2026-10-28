import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import type { McpOperation } from "../model";
import type { ResolvedTransport } from "./server";

export type ListKind = "tools" | "resources" | "resourceTemplates" | "prompts";

/** What the server said about itself during the MCP handshake (raw MCP JSON). */
export interface ServerInfo {
  readonly protocolVersion?: string;
  readonly serverInfo?: { readonly name?: string; readonly version?: string };
  readonly capabilities?: Readonly<Record<string, unknown>>;
  readonly instructions?: string;
}

export type ClientEvent =
  | { readonly kind: "notification"; readonly method: string; readonly params: unknown }
  | { readonly kind: "stderr"; readonly line: string };

export interface Timed {
  readonly result: unknown;
  readonly timeMs: number;
}

/** One MCP connection per id; the desktop app and the browser build implement it differently. */
export interface McpClient {
  connect(
    id: string,
    transport: ResolvedTransport,
    onEvent: (event: ClientEvent) => void,
  ): Promise<ServerInfo>;
  list(id: string, kind: ListKind): Promise<readonly unknown[]>;
  run(id: string, operation: McpOperation, timeoutMs: number): Promise<Timed>;
  disconnect(id: string): Promise<void>;
}

/** Talks to the Rust side (src-tauri/src/mcp), which supports stdio and Streamable HTTP. */
export const tauriMcpClient: McpClient = {
  async connect(id, transport, onEvent) {
    const channel = new Channel<ClientEvent>();
    channel.onmessage = onEvent;
    return invoke<ServerInfo>("mcp_connect", { id, transport, channel });
  },
  list: (id, kind) => invoke<unknown[]>("mcp_list", { id, kind }),
  run: (id, operation, timeoutMs) => invoke<Timed>("mcp_run", { id, operation, timeoutMs }),
  disconnect: (id) => invoke("mcp_disconnect", { id }),
};

let client: McpClient | null = null;

/** The client for this build, loading the browser SDK only when it is needed. */
export async function getMcpClient(): Promise<McpClient> {
  if (client) return client;
  client = isTauri() ? tauriMcpClient : (await import("./browser-client")).createBrowserMcpClient();
  return client;
}

/** Tests swap in a fake client. */
export function setMcpClient(next: McpClient | null): void {
  client = next;
}
