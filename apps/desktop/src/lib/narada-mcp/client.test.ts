import { afterEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({ isTauri: vi.fn(() => true), invoke: vi.fn(async () => 7377) }));
vi.mock("@tauri-apps/api/core", () => tauri);
const events = vi.hoisted(() => ({
  handler: null as ((event: { payload: unknown }) => void) | null,
  listen: vi.fn(async (_name: string, handler: (event: { payload: unknown }) => void) => {
    events.handler = handler;
    return () => {};
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: events.listen }));

const { getNaradaMcpClient, setNaradaMcpClient } = await import("./client");

afterEach(() => {
  setNaradaMcpClient(undefined);
  tauri.invoke.mockClear();
});

describe("the desktop MCP server client", () => {
  it("starts, stops and replies through the shell", async () => {
    const client = getNaradaMcpClient();
    expect(await client?.start(7377, "t")).toBe(7377);
    expect(tauri.invoke).toHaveBeenCalledWith("narada_mcp_start", { port: 7377, token: "t" });
    await client?.stop();
    expect(tauri.invoke).toHaveBeenCalledWith("narada_mcp_stop");
    await client?.reply("c1", { result: [1] });
    expect(tauri.invoke).toHaveBeenCalledWith("narada_mcp_reply", {
      reply: { callId: "c1", result: [1] },
    });
    await client?.reply("c2", { error: "nope" });
    expect(tauri.invoke).toHaveBeenCalledWith("narada_mcp_reply", {
      reply: { callId: "c2", error: "nope" },
    });
  });

  it("hands each tool call event to the handler", async () => {
    const calls: unknown[] = [];
    await getNaradaMcpClient()?.onToolCall((call) => calls.push(call));
    expect(events.listen).toHaveBeenCalledWith("narada-mcp://tool-call", expect.any(Function));
    events.handler?.({ payload: { callId: "c1", tool: "list_collections", arguments: {} } });
    expect(calls).toEqual([{ callId: "c1", tool: "list_collections", arguments: {} }]);
  });

  it("has no client in the browser build", () => {
    tauri.isTauri.mockReturnValueOnce(false);
    expect(getNaradaMcpClient()).toBeNull();
  });
});
