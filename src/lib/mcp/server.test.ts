import { describe, expect, it } from "vitest";
import { newKeyValue } from "../factories";
import {
  describeTransport,
  isMcpServersConfig,
  joinArgs,
  resolveTransport,
  serverFromJson,
  serverToJson,
  serversFromConfig,
  splitArgs,
  type McpServer,
} from "./server";
import { fingerprint, needsTrust, parseTrusted } from "./trust";

const scopes = {
  global: {},
  collection: {},
  environment: { token: "s3cret", dir: "/tmp" },
  data: {},
  local: {},
};

const stdio: McpServer = {
  id: "s1",
  name: "Everything",
  transport: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    env: [newKeyValue("TOKEN", "{{token}}"), { ...newKeyValue("OFF", "x"), enabled: false }],
    cwd: "{{dir}}",
  },
};

describe("MCP server config", () => {
  it("round-trips through its file", () => {
    const back = serverFromJson(serverToJson(stdio));
    expect(back.name).toBe("Everything");
    expect(back.transport).toMatchObject({
      type: "stdio",
      command: "npx",
      env: [
        { key: "TOKEN", value: "{{token}}", enabled: true },
        { key: "OFF", enabled: false },
      ],
    });
    expect(() => serverFromJson('{"id":1}')).toThrow("Not a Narada MCP server file.");
  });

  it("resolves variables and drops disabled rows", () => {
    expect(resolveTransport(stdio.transport, scopes)).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everything"],
      env: [["TOKEN", "s3cret"]],
      cwd: "/tmp",
    });
    const http = {
      type: "http" as const,
      url: " https://x.dev/mcp ",
      headers: [newKeyValue("Authorization", "Bearer {{token}}")],
    };
    expect(resolveTransport(http, scopes)).toEqual({
      type: "http",
      url: "https://x.dev/mcp",
      headers: [["Authorization", "Bearer s3cret"]],
    });
    expect(describeTransport(http)).toBe(" https://x.dev/mcp ");
    expect(describeTransport(stdio.transport)).toBe(
      "npx -y @modelcontextprotocol/server-everything",
    );
  });

  it("splits and joins argument lines", () => {
    expect(splitArgs(`-y "a b" 'c d' e`)).toEqual(["-y", "a b", "c d", "e"]);
    expect(joinArgs(["-y", "a b", ""])).toBe('-y "a b" ""');
  });

  it("imports the mcpServers config used by other MCP clients", () => {
    const json = {
      mcpServers: {
        files: { command: "npx", args: ["-y", "fs"], env: { ROOT: "/tmp" } },
        remote: { url: "https://x.dev/mcp", headers: { "X-Key": "k" } },
      },
    };
    expect(isMcpServersConfig(json)).toBe(true);
    expect(isMcpServersConfig({ info: {} })).toBe(false);
    const [files, remote] = serversFromConfig(json);
    expect(files).toMatchObject({
      name: "files",
      transport: { type: "stdio", command: "npx", cwd: "" },
    });
    expect(remote).toMatchObject({
      name: "remote",
      transport: { type: "http", url: "https://x.dev/mcp" },
    });
    expect(() => serversFromConfig({ mcpServers: { bad: {} } })).toThrow(
      "neither a command nor a url",
    );
    expect(() => serversFromConfig({ mcpServers: 1 })).toThrow("mcpServers");
  });

  it("asks before running a new or changed local command, as it will actually run", async () => {
    const run = resolveTransport(stdio.transport, scopes);
    const print = await fingerprint(run);
    expect(print).toMatch(/^[0-9a-f]{64}$/);
    expect(await needsTrust(run, [])).toBe(true);
    expect(await needsTrust(run, [print as string])).toBe(false);
    const changedArgs = { ...run, args: ["-y", "something-else"] };
    expect(await needsTrust(changedArgs, [print as string])).toBe(true);
    // A variable in the command that now resolves to another program asks again.
    const viaVariable = { ...stdio.transport, command: "{{cmd}}" };
    const npx = await fingerprint(
      resolveTransport(viaVariable, { ...scopes, local: { cmd: "npx" } }),
    );
    const other = resolveTransport(viaVariable, { ...scopes, local: { cmd: "other" } });
    expect(await needsTrust(other, [npx as string])).toBe(true);
    expect(await needsTrust({ type: "http", url: "x", headers: [] }, [])).toBe(false);
    expect(parseTrusted('["a", 1]')).toEqual(["a"]);
    expect(parseTrusted("{bad")).toEqual([]);
  });
});
