import { newId } from "../../lib/ids";
import type { McpOperation, McpRequestDef } from "../../lib/model";
import { useMcpStore } from "../../state/mcp-store";
import { useTabsStore } from "../../state/tabs-store";
import { pipelineInputFor } from "../workspace/context";

export const newMcpRequest = (serverId: string, operation: McpOperation): McpRequestDef => ({
  protocol: "mcp",
  id: newId(),
  name: operation.type === "resource" ? operation.uri : operation.name || "New MCP request",
  serverId,
  operation,
});

/** Opens a new tab that calls `operation` on the server. */
export function openMcpRequest(serverId: string, operation: McpOperation): void {
  useTabsStore.getState().openRequest(newMcpRequest(serverId, operation), null);
}

/** Opens a blank MCP request for the first server (or none yet). */
export function openBlankMcpRequest(): void {
  const [first] = useMcpStore.getState().servers;
  openMcpRequest(first?.id ?? "", { type: "tool", name: "", arguments: {} });
}

/** Variables available when connecting outside a request: environment and globals. */
export const connectionScopes = () => pipelineInputFor(null, null).scopes;
