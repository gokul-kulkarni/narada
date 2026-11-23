import { errorMessage } from "@narada/core/format";
import type { ToolResult } from "@narada/core/mcp-server/tools";
import { getNaradaMcpClient, type NaradaMcpClient } from "../../lib/narada-mcp/client";
import { useMcpActivityStore } from "../../state/mcp-activity-store";
import { useMcpApprovalStore } from "../../state/mcp-approval-store";
import { answerToolCall } from "./answer";

let installing: Promise<void> | null = null;
let stopListeners: (() => void)[] = [];

async function install(client: NaradaMcpClient): Promise<void> {
  const activity = useMcpActivityStore.getState;
  const stopCalls = await client.onToolCall(async (call) => {
    activity().record({
      callId: call.callId,
      at: new Date().toISOString(),
      client: call.client,
      tool: call.tool,
      outcome: "waiting",
      detail: null,
    });
    let answer: ToolResult;
    try {
      answer = await answerToolCall(call.tool, call.arguments, call.client, call.callId);
    } catch (error) {
      answer = { error: `Narada failed: ${errorMessage(error)}` };
    }
    activity().settle(
      call.callId,
      "error" in answer ? "error" : "ok",
      "error" in answer ? answer.error : null,
    );
    await client.reply(call.callId, answer);
  });
  const stopCancelled = await client.onToolCancelled((callId) =>
    useMcpApprovalStore.getState().withdraw(callId),
  );
  stopListeners = [stopCalls, stopCancelled];
}

/**
 * Answers tool calls from connected agents for as long as the app runs. Installs once, even
 * when called again before the first install finished (React runs startup effects twice in
 * development, and each install would otherwise answer every call again).
 */
export function installMcpBridge(): Promise<void> {
  const client = getNaradaMcpClient();
  if (!client) return Promise.resolve();
  installing ??= install(client);
  return installing;
}

/** For tests. */
export function uninstallMcpBridge(): void {
  stopListeners.forEach((stop) => stop());
  stopListeners = [];
  installing = null;
}
