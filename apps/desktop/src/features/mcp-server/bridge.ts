import { getNaradaMcpClient } from "../../lib/narada-mcp/client";
import { answerToolCall } from "./answer";

let stopListening: (() => void) | null = null;

/** Answers tool calls from connected agents for as long as the app runs; safe to call twice. */
export async function installMcpBridge(): Promise<void> {
  const client = getNaradaMcpClient();
  if (!client || stopListening) return;
  stopListening = await client.onToolCall((call) => {
    void client.reply(call.callId, answerToolCall(call.tool, call.arguments));
  });
}

/** For tests. */
export function uninstallMcpBridge(): void {
  stopListening?.();
  stopListening = null;
}
