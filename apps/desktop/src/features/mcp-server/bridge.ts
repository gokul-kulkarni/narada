import { errorMessage } from "@narada/core/format";
import type { ToolResult } from "@narada/core/mcp-server/tools";
import { getNaradaMcpClient } from "../../lib/narada-mcp/client";
import { useMcpActivityStore } from "../../state/mcp-activity-store";
import { useMcpApprovalStore } from "../../state/mcp-approval-store";
import { answerToolCall } from "./answer";

let stopListening: (() => void) | null = null;
let stopListeningCancelled: (() => void) | null = null;

/** Answers tool calls from connected agents for as long as the app runs; safe to call twice. */
export async function installMcpBridge(): Promise<void> {
  const client = getNaradaMcpClient();
  if (!client || stopListening) return;
  stopListening = await client.onToolCall(async (call) => {
    let answer: ToolResult;
    try {
      answer = await answerToolCall(call.tool, call.arguments, call.client, call.callId);
    } catch (error) {
      answer = { error: `Narada failed: ${errorMessage(error)}` };
    }
    useMcpActivityStore.getState().record({
      at: new Date().toISOString(),
      client: call.client,
      tool: call.tool,
      outcome: "error" in answer ? "error" : "ok",
      detail: "error" in answer ? answer.error : null,
    });
    await client.reply(call.callId, answer);
  });
  stopListeningCancelled = await client.onToolCancelled((callId) =>
    useMcpApprovalStore.getState().withdraw(callId),
  );
}

/** For tests. */
export function uninstallMcpBridge(): void {
  stopListening?.();
  stopListeningCancelled?.();
  stopListening = null;
  stopListeningCancelled = null;
}
