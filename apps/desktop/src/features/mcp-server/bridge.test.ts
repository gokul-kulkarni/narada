import { afterEach, describe, expect, it, vi } from "vitest";
import {
  setNaradaMcpClient,
  type NaradaMcpClient,
  type ToolCall,
} from "../../lib/narada-mcp/client";
import { useMcpActivityStore } from "../../state/mcp-activity-store";
import { useMcpApprovalStore } from "../../state/mcp-approval-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";
import { installMcpBridge, uninstallMcpBridge } from "./bridge";

function fakeClient() {
  let handler: ((call: ToolCall) => void) | null = null;
  let cancelled: ((callId: string) => void) | null = null;
  const client: NaradaMcpClient = {
    start: vi.fn(),
    stop: vi.fn(),
    reply: vi.fn(async () => {}),
    onToolCall: vi.fn(async (h) => {
      handler = h;
      return () => {};
    }),
    onToolCancelled: vi.fn(async (h) => {
      cancelled = h;
      return () => {};
    }),
  };
  return { client, call: (c: ToolCall) => handler?.(c), cancel: (id: string) => cancelled?.(id) };
}

describe("installMcpBridge", () => {
  afterEach(() => {
    uninstallMcpBridge();
    resetStores();
  });

  it("answers each tool call once, and listens only once", async () => {
    const { client, call } = fakeClient();
    setNaradaMcpClient(client);
    // React runs startup effects twice in development: both installs overlap.
    await Promise.all([installMcpBridge(), installMcpBridge()]);
    await installMcpBridge();
    expect(client.onToolCall).toHaveBeenCalledTimes(1);
    call({ callId: "c1", tool: "list_environments", arguments: {}, client: "Claude Code" });
    await vi.waitFor(() => expect(client.reply).toHaveBeenCalledWith("c1", { result: [] }));
    call({ callId: "c2", tool: "nope", arguments: {}, client: null });
    await vi.waitFor(() => expect(client.reply).toHaveBeenCalledTimes(2));
    expect(
      useMcpActivityStore.getState().entries.map((e) => [e.client, e.tool, e.outcome]),
    ).toEqual([
      [null, "nope", "error"],
      ["Claude Code", "list_environments", "ok"],
    ]);
  });

  it("does nothing in the browser build", async () => {
    setNaradaMcpClient(null);
    await expect(installMcpBridge()).resolves.toBeUndefined();
  });

  it("withdraws an approval when the agent stops waiting", async () => {
    const { client, call, cancel } = fakeClient();
    setNaradaMcpClient(client);
    await installMcpBridge();
    call({
      callId: "c9",
      tool: "create_collection",
      arguments: { name: "Billing" },
      client: "Claude Code",
    });
    await vi.waitFor(() => expect(useMcpApprovalStore.getState().queue).toHaveLength(1));
    cancel("c9");
    expect(useMcpApprovalStore.getState().queue).toEqual([]);
    await vi.waitFor(() =>
      expect(client.reply).toHaveBeenCalledWith("c9", {
        error:
          "You stopped waiting before the user answered, so nothing was added. Make one change at a time and wait for its result.",
      }),
    );
    expect(useWorkspaceStore.getState().collections).toEqual([]);
  });

  it("logs a call as waiting when it arrives, and settles it when answered", async () => {
    const { client, call } = fakeClient();
    setNaradaMcpClient(client);
    await installMcpBridge();
    call({
      callId: "c5",
      tool: "create_folder",
      arguments: { collection: "Shop", folder: "x" },
      client: "Codex",
    });
    await vi.waitFor(() =>
      expect(useMcpActivityStore.getState().entries[0]).toMatchObject({
        tool: "create_folder",
        outcome: "waiting",
      }),
    );
    const [pending] = useMcpApprovalStore.getState().queue;
    useMcpApprovalStore.getState().decide(pending?.id ?? "", "cancel");
    await vi.waitFor(() =>
      expect(useMcpActivityStore.getState().entries).toMatchObject([
        {
          tool: "create_folder",
          outcome: "error",
          detail: "The user declined, so nothing was added.",
        },
      ]),
    );
  });
});
