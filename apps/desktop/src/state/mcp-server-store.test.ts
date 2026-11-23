import { beforeEach, describe, expect, it, vi } from "vitest";
import { setNaradaMcpClient, type NaradaMcpClient } from "../lib/narada-mcp/client";
import { resetStores } from "../test/reset-stores";
import {
  DEFAULT_PORT,
  TOKEN_SECRET,
  parseServerSettings,
  useMcpServerStore,
} from "./mcp-server-store";
import { getServices } from "./services";

function fakeClient(start: NaradaMcpClient["start"] = async (port) => port): NaradaMcpClient {
  return {
    start: vi.fn(start),
    stop: vi.fn(async () => {}),
    reply: vi.fn(),
    onToolCall: vi.fn(async () => () => {}),
    onToolCancelled: vi.fn(async () => () => {}),
  };
}

const settingsFile = async () =>
  parseServerSettings(await getServices().documents.readLocal("mcp-server.json"));

describe("parseServerSettings", () => {
  it("defaults to off on the default port, and rejects unusable ports", () => {
    expect(parseServerSettings(null)).toEqual({ enabled: false, port: DEFAULT_PORT });
    expect(parseServerSettings('{"enabled":true,"port":8123}')).toEqual({
      enabled: true,
      port: 8123,
    });
    for (const bad of ['{"enabled":true,"port":80}', '{"enabled":"yes","port":8123}', "nope"]) {
      expect(parseServerSettings(bad)).toEqual({ enabled: false, port: DEFAULT_PORT });
    }
  });
});

describe("useMcpServerStore", () => {
  beforeEach(() => {
    resetStores();
  });

  it("stays off at startup until the user turns it on, without touching the keychain", async () => {
    const client = fakeClient();
    setNaradaMcpClient(client);
    // A keychain read can make macOS ask the user, so it must wait until the server is wanted.
    const keychain = vi.spyOn(getServices().secrets, "get");
    await useMcpServerStore.getState().load();
    expect(keychain).not.toHaveBeenCalled();
    expect(client.start).not.toHaveBeenCalled();
    expect(useMcpServerStore.getState()).toMatchObject({ loaded: true, runningPort: null });
  });

  it("reuses the token already in the keychain when turned on", async () => {
    const client = fakeClient();
    setNaradaMcpClient(client);
    await getServices().secrets.set(TOKEN_SECRET, "k".repeat(43));
    await useMcpServerStore.getState().load();
    await useMcpServerStore.getState().setEnabled(true);
    expect(client.start).toHaveBeenCalledWith(DEFAULT_PORT, "k".repeat(43));
  });

  it("turns on with a new token kept in the keychain, and off again", async () => {
    const client = fakeClient();
    setNaradaMcpClient(client);
    await useMcpServerStore.getState().load();
    await useMcpServerStore.getState().setEnabled(true);
    const token = await getServices().secrets.get(TOKEN_SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(client.start).toHaveBeenCalledWith(DEFAULT_PORT, token);
    expect(useMcpServerStore.getState()).toMatchObject({
      runningPort: DEFAULT_PORT,
      token,
      error: null,
    });
    expect(await settingsFile()).toEqual({ enabled: true, port: DEFAULT_PORT });

    await useMcpServerStore.getState().setEnabled(false);
    expect(client.stop).toHaveBeenCalled();
    expect(useMcpServerStore.getState().runningPort).toBeNull();
    expect(await settingsFile()).toEqual({ enabled: false, port: DEFAULT_PORT });
  });

  it("starts at launch when it was left on, with the saved token", async () => {
    const client = fakeClient();
    setNaradaMcpClient(client);
    await getServices().documents.writeLocal("mcp-server.json", '{"enabled":true,"port":8123}');
    await getServices().secrets.set(TOKEN_SECRET, "x".repeat(43));
    await useMcpServerStore.getState().load();
    expect(client.start).toHaveBeenCalledWith(8123, "x".repeat(43));
  });

  it("shows why it could not start", async () => {
    setNaradaMcpClient(fakeClient(async () => Promise.reject("Port 7377 is already in use.")));
    await useMcpServerStore.getState().load();
    await useMcpServerStore.getState().setEnabled(true);
    expect(useMcpServerStore.getState()).toMatchObject({
      runningPort: null,
      error: "Port 7377 is already in use.",
    });
  });

  it("restarts on a new port or token while on, and checks the port", async () => {
    const client = fakeClient();
    setNaradaMcpClient(client);
    await useMcpServerStore.getState().load();
    await useMcpServerStore.getState().setEnabled(true);
    const first = useMcpServerStore.getState().token;

    await useMcpServerStore.getState().setPort(8200);
    expect(client.start).toHaveBeenLastCalledWith(8200, first);
    await useMcpServerStore.getState().regenerateToken();
    const second = useMcpServerStore.getState().token;
    expect(second).not.toBe(first);
    expect(await getServices().secrets.get(TOKEN_SECRET)).toBe(second);
    expect(client.start).toHaveBeenLastCalledWith(8200, second);

    await useMcpServerStore.getState().setPort(80);
    expect(useMcpServerStore.getState().error).toBe("Choose a port from 1024 to 65535.");
    expect(client.start).toHaveBeenCalledTimes(3);
  });

  it("is unavailable in the browser build", async () => {
    setNaradaMcpClient(null);
    await useMcpServerStore.getState().load();
    await useMcpServerStore.getState().setEnabled(true);
    expect(useMcpServerStore.getState().error).toBe("The MCP server needs the desktop app.");
  });
});
