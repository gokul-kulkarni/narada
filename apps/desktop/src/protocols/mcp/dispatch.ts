import { errorMessage } from "../../lib/format";
import { newId } from "../../lib/ids";
import { getMcpClient } from "../../lib/mcp/client";
import type { McpRequestDef } from "../../lib/model";
import { useHistoryStore } from "../../state/history-store";
import { useMcpStore } from "../../state/mcp-store";
import { useTabsStore, type RequestTab } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { selectActiveEnvironment, useWorkspaceStore } from "../../state/workspace-store";
import { beginDelivery, endDelivery } from "../../features/request/in-flight";
import { pipelineInputFor } from "../../features/workspace/context";
import { resolveOperation, toolFailed } from "./resolve";

export const MCP_TIMEOUT_MS = 120_000;

/** Connects first when needed; a local command not yet confirmed opens the confirmation. */
async function ensureConnected(serverId: string, request: McpRequestDef) {
  const mcp = useMcpStore.getState();
  if (!mcp.servers.some((s) => s.id === serverId)) {
    throw new Error("This request's MCP server no longer exists. Choose another server.");
  }
  if (mcp.connections[serverId]?.status === "connected") return;
  const scopes = pipelineInputFor(null, request.id).scopes;
  const outcome = await mcp.connect(serverId, scopes);
  if (outcome === "needs-trust") {
    useUiStore.getState().openDialog({ kind: "mcp-trust", serverId });
    throw new Error("Confirm the server's command, then dispatch again.");
  }
  if (outcome === "failed") {
    throw new Error(useMcpStore.getState().connections[serverId]?.error ?? "Could not connect.");
  }
}

/** Resolves once `signal` aborts, so Stop ends the wait even if the server keeps working. */
const stopped = (signal: AbortSignal) =>
  new Promise<never>((_resolve, reject) =>
    signal.addEventListener(
      "abort",
      () => reject(new Error("Stopped before the server replied.")),
      {
        once: true,
      },
    ),
  );

export async function dispatchMcp(tab: RequestTab, request: McpRequestDef): Promise<void> {
  const { patchTab } = useTabsStore.getState();
  const signal = beginDelivery(tab.id);
  patchTab(tab.id, {
    loading: true,
    partial: null,
    delivery: null,
    error: null,
    tests: [],
    logs: [],
  });
  const sentAt = new Date().toISOString();
  const environment = selectActiveEnvironment(useWorkspaceStore.getState())?.name ?? null;
  const record = (outcome: { timeMs: number | null; isError?: boolean }) =>
    useHistoryStore
      .getState()
      .add({ id: newId(), sentAt, request, status: null, environment, ...outcome });
  try {
    await ensureConnected(request.serverId, request);
    const scopes = pipelineInputFor(tab.source?.collectionId ?? null, request.id).scopes;
    const connection = useMcpStore.getState().connections[request.serverId];
    const operation = resolveOperation(request.operation, scopes, connection);
    const client = await getMcpClient();
    const timed = await Promise.race([
      client.run(request.serverId, operation, MCP_TIMEOUT_MS),
      stopped(signal),
    ]);
    const isError = toolFailed(operation, timed.result);
    patchTab(tab.id, {
      loading: false,
      delivery: {
        protocol: "mcp",
        operation: operation.type,
        result: timed.result,
        isError,
        timeMs: timed.timeMs,
      },
    });
    record({ timeMs: timed.timeMs, isError });
  } catch (error) {
    patchTab(tab.id, { loading: false, error: errorMessage(error) });
    record({ timeMs: null });
  } finally {
    endDelivery(tab.id, signal);
  }
}
