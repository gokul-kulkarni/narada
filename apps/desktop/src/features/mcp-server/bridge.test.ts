import { afterEach, describe, expect, it, vi } from "vitest";
import {
  setNaradaMcpClient,
  type NaradaMcpClient,
  type ToolCall,
} from "../../lib/narada-mcp/client";
import { resetStores } from "../../test/reset-stores";
import { installMcpBridge, uninstallMcpBridge } from "./bridge";

function fakeClient() {
  let handler: ((call: ToolCall) => void) | null = null;
  const client: NaradaMcpClient = {
    start: vi.fn(),
    stop: vi.fn(),
    reply: vi.fn(async () => {}),
    onToolCall: vi.fn(async (h) => {
      handler = h;
      return () => {};
    }),
  };
  return { client, call: (c: ToolCall) => handler?.(c) };
}

describe("installMcpBridge", () => {
  afterEach(() => {
    uninstallMcpBridge();
    resetStores();
  });

  it("answers each tool call once, and listens only once", async () => {
    const { client, call } = fakeClient();
    setNaradaMcpClient(client);
    await installMcpBridge();
    await installMcpBridge();
    expect(client.onToolCall).toHaveBeenCalledTimes(1);
    call({ callId: "c1", tool: "list_environments", arguments: {} });
    expect(client.reply).toHaveBeenCalledWith("c1", { result: [] });
  });

  it("does nothing in the browser build", async () => {
    setNaradaMcpClient(null);
    await expect(installMcpBridge()).resolves.toBeUndefined();
  });
});
