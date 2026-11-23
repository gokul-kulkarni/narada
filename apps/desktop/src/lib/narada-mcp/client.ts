import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ToolResult } from "@narada/core/mcp-server/tools";

/** A connected agent's tool call, forwarded by the Rust MCP server for the app to answer. */
export interface ToolCall {
  readonly callId: string;
  readonly tool: string;
  readonly arguments: unknown;
}

export interface NaradaMcpClient {
  /** Starts (or restarts) the server; resolves to the port it listens on. */
  start(port: number, token: string): Promise<number>;
  stop(): Promise<void>;
  reply(callId: string, answer: ToolResult): Promise<void>;
  /** Calls `handler` for each tool call; resolves to a function that stops listening. */
  onToolCall(handler: (call: ToolCall) => void): Promise<() => void>;
}

const tauriClient: NaradaMcpClient = {
  start: (port, token) => invoke<number>("narada_mcp_start", { port, token }),
  stop: () => invoke("narada_mcp_stop"),
  reply: (callId, answer) =>
    invoke("narada_mcp_reply", {
      reply:
        "error" in answer ? { callId, error: answer.error } : { callId, result: answer.result },
    }),
  onToolCall: (handler) =>
    listen<ToolCall>("narada-mcp://tool-call", (event) => handler(event.payload)),
};

let override: NaradaMcpClient | null | undefined;

/** The MCP server controls for this build; null in the browser build, which cannot serve. */
export function getNaradaMcpClient(): NaradaMcpClient | null {
  if (override !== undefined) return override;
  return isTauri() ? tauriClient : null;
}

/** Tests swap in a fake client (or null for "browser build"); undefined restores the default. */
export function setNaradaMcpClient(next: NaradaMcpClient | null | undefined): void {
  override = next;
}
