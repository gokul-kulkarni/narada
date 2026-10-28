import { beforeEach, describe, expect, it, vi } from "vitest";
import { newKeyValue } from "../lib/factories";
import type { McpServer } from "../lib/mcp/server";
import { installFakeMcp } from "../test/fake-mcp";
import { resetStores } from "../test/reset-stores";
import { LOG_LIMIT, useMcpStore } from "./mcp-store";

const scopes = { global: {}, collection: {}, environment: { port: "3000" }, data: {}, local: {} };

const httpServer = (): McpServer => ({
  id: "srv",
  name: "Calculator",
  transport: {
    type: "http",
    url: "http://localhost:{{port}}/mcp",
    headers: [newKeyValue("X-Key", "k")],
  },
});

describe("MCP store", () => {
  beforeEach(() => resetStores());

  it("saves servers and loads them back", async () => {
    const created = useMcpStore.getState().create("Files");
    await useMcpStore.getState().update(created.id, (s) => ({ ...s, name: "Files 2" }));
    useMcpStore.setState({ servers: [] });
    await useMcpStore.getState().load();
    expect(useMcpStore.getState().servers.map((s) => s.name)).toEqual(["Files 2"]);
    await useMcpStore.getState().remove(created.id);
    await useMcpStore.getState().load();
    expect(useMcpStore.getState().servers).toEqual([]);
  });

  it("connects with variables resolved and lists what the server offers", async () => {
    const { client } = installFakeMcp();
    useMcpStore.setState({ servers: [httpServer()] });
    expect(await useMcpStore.getState().connect("srv", scopes)).toBe("connected");
    expect(vi.mocked(client.connect).mock.calls[0][1]).toEqual({
      type: "http",
      url: "http://localhost:3000/mcp",
      headers: [["X-Key", "k"]],
    });
    const connection = useMcpStore.getState().connections.srv;
    expect(connection.status).toBe("connected");
    expect(connection.tools.map((t) => t.name)).toEqual(["add"]);
    expect(connection.prompts[0].arguments[0].name).toBe("who");
  });

  it("logs notifications and refreshes a list the server says changed", async () => {
    const { client, events } = installFakeMcp();
    useMcpStore.setState({ servers: [httpServer()] });
    await useMcpStore.getState().connect("srv", scopes);
    vi.mocked(client.list).mockClear();
    events.emit?.({
      kind: "notification",
      method: "notifications/tools/list_changed",
      params: null,
    });
    events.emit?.({ kind: "stderr", line: "booting" });
    await vi.waitFor(() => expect(client.list).toHaveBeenCalledWith("srv", "tools"));
    expect(useMcpStore.getState().logs.srv.map((l) => l.text)).toEqual([
      "notifications/tools/list_changed",
      "booting",
    ]);
    for (let i = 0; i < LOG_LIMIT + 5; i += 1) events.emit?.({ kind: "stderr", line: `${i}` });
    expect(useMcpStore.getState().logs.srv).toHaveLength(LOG_LIMIT);
    useMcpStore.getState().clearLog("srv");
    expect(useMcpStore.getState().logs.srv).toEqual([]);
  });

  it("asks before running a local command, then remembers the answer", async () => {
    const { client } = installFakeMcp();
    const [local] = await useMcpStore
      .getState()
      .importConfig({ mcpServers: { Local: { command: "npx", args: ["server"] } } });
    expect(await useMcpStore.getState().connect(local.id, scopes)).toBe("needs-trust");
    expect(client.connect).not.toHaveBeenCalled();
    expect(await useMcpStore.getState().trustAndConnect(local.id, scopes)).toBe("connected");
    await useMcpStore.getState().disconnect(local.id);
    useMcpStore.setState({ trusted: [] });
    await useMcpStore.getState().load();
    expect(await useMcpStore.getState().connect(local.id, scopes)).toBe("connected");
  });

  it("records a failed connection", async () => {
    installFakeMcp({ connect: async () => Promise.reject(new Error("refused")) });
    useMcpStore.setState({ servers: [httpServer()] });
    expect(await useMcpStore.getState().connect("srv", scopes)).toBe("failed");
    expect(useMcpStore.getState().connections.srv).toMatchObject({
      status: "failed",
      error: "refused",
    });
    expect(await useMcpStore.getState().connect("missing", scopes)).toBe("failed");
  });

  it("logs a list that could not be fetched", async () => {
    installFakeMcp({ list: async () => Promise.reject(new Error("nope")) });
    useMcpStore.setState({ servers: [httpServer()] });
    await useMcpStore.getState().connect("srv", scopes);
    expect(useMcpStore.getState().logs.srv[0].text).toBe("Could not list tools: nope");
  });

  it("imports an mcpServers config", async () => {
    const servers = await useMcpStore
      .getState()
      .importConfig({ mcpServers: { a: { url: "http://a" }, b: { command: "b" } } });
    expect(servers.map((s) => s.name)).toEqual(["a", "b"]);
    await useMcpStore.getState().load();
    expect(useMcpStore.getState().servers).toHaveLength(2);
  });
});
