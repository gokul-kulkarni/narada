import { formatDuration } from "../../lib/format";
import type { HistoryEntry, McpDelivery, McpOperation, McpRequestDef } from "../../lib/model";
import { useMcpStore } from "../../state/mcp-store";
import type { DeliverySummary, ShortSummary } from "../types";

const OPERATION_NOUN: Readonly<Record<McpOperation["type"], string>> = {
  tool: "Tool",
  resource: "Resource",
  prompt: "Prompt",
};

export const operationLabel = (operation: McpOperation) =>
  operation.type === "resource" ? operation.uri : operation.name;

const serverName = (serverId: string) =>
  useMcpStore.getState().servers.find((s) => s.id === serverId)?.name ?? "Missing server";

export const mcpBadge = () => "MCP";

/** e.g. "Everything › add". */
export function mcpTarget(request: McpRequestDef): string {
  const label = operationLabel(request.operation);
  return `${serverName(request.serverId)} › ${label || `(choose a ${request.operation.type})`}`;
}

export function mcpSummary(delivery: McpDelivery): DeliverySummary {
  const noun = OPERATION_NOUN[delivery.operation];
  return delivery.isError
    ? {
        tone: "err",
        label: "Returned",
        detail: `${noun} reported an error · ${formatDuration(delivery.timeMs)}`,
        note: null,
      }
    : {
        tone: "ok",
        label: "Delivered",
        detail: `${noun} · ${formatDuration(delivery.timeMs)}`,
        note: null,
      };
}

export function mcpShortSummary(entry: HistoryEntry): ShortSummary {
  if (entry.timeMs === null) {
    return { tone: "err", label: "Not delivered", code: "ERR", timeMs: null };
  }
  return entry.isError
    ? { tone: "err", label: "Returned", code: "ERROR", timeMs: entry.timeMs }
    : { tone: "ok", label: "Delivered", code: "OK", timeMs: entry.timeMs };
}
