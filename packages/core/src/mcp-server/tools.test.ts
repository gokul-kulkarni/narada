import { describe, expect, it } from "vitest";
import { newCollection, newEnvironment, newKeyValue, newRequest } from "../factories";
import type { Collection, HistoryEntry, McpOperation } from "../model";
import {
  getRequest,
  listCollections,
  listEnvironments,
  listHistory,
  workspaceSecrets,
  type ToolWorkspace,
} from "./tools";

const order = newRequest({
  id: "r1",
  name: "Create order",
  method: "POST",
  url: "{{baseUrl}}/orders?api_key=sk-live-123456",
  headers: [newKeyValue("Authorization", "Bearer sk-live-123456"), newKeyValue("Accept", "*/*")],
  auth: { type: "bearer", token: "{{token}}" },
});

const shop: Collection = {
  ...newCollection("Shop"),
  id: "c1",
  variables: [newKeyValue("baseUrl", "https://shop.dev"), newKeyValue("apiToken", "col-secret-99")],
  items: [
    {
      kind: "folder",
      id: "f1",
      name: "Orders",
      auth: { type: "inherit" },
      items: [{ kind: "request", request: order }],
    },
    {
      kind: "request",
      request: newRequest({ id: "r2", name: "Health", url: "{{baseUrl}}/health" }),
    },
  ],
};

const dev = {
  ...newEnvironment("dev"),
  id: "e1",
  variables: [
    { ...newKeyValue("baseUrl", "http://localhost:3000"), secret: false },
    { ...newKeyValue("token", "sk-live-123456"), secret: true },
  ],
};
const prod = {
  ...newEnvironment("prod"),
  id: "e2",
  variables: [{ ...newKeyValue("token", "prod-only-secret-777"), secret: true }],
};

const entry = (id: string, url: string, status: number | null): HistoryEntry => ({
  id,
  sentAt: `2026-11-23T10:0${id}:00.000Z`,
  request: newRequest({ url, method: "GET" }),
  status,
  timeMs: 12,
  environment: "dev",
});

const workspace = (overrides: Partial<ToolWorkspace> = {}): ToolWorkspace => ({
  collections: [shop],
  environments: [dev, prod],
  globals: [newKeyValue("sessionCookie", "glob-cookie-55")],
  activeEnvironmentId: "e1",
  history: [
    entry("1", "https://shop.dev/orders?token=prod-only-secret-777", 401),
    entry("2", "{{baseUrl}}/health", null),
  ],
  ...overrides,
});

describe("workspaceSecrets", () => {
  it("covers secret variables of every environment and credential-named variables anywhere", () => {
    const values = workspaceSecrets(workspace()).map((s) => s.value);
    expect(values).toEqual(
      expect.arrayContaining([
        "sk-live-123456",
        "prod-only-secret-777",
        "col-secret-99",
        "glob-cookie-55",
      ]),
    );
    expect(values).not.toContain("https://shop.dev");
  });
});

describe("listCollections", () => {
  it("returns the tree with request ids, methods and URLs, without secrets", () => {
    const listed = listCollections(workspace());
    expect(listed).toEqual([
      {
        id: "c1",
        name: "Shop",
        items: [
          {
            type: "folder",
            name: "Orders",
            items: [
              {
                type: "request",
                id: "r1",
                name: "Create order",
                protocol: "http",
                method: "POST",
                url: "{{baseUrl}}/orders?api_key=[secret:token]",
              },
            ],
          },
          {
            type: "request",
            id: "r2",
            name: "Health",
            protocol: "http",
            method: "GET",
            url: "{{baseUrl}}/health",
          },
        ],
      },
    ]);
  });
});

describe("getRequest", () => {
  it("returns one request in full with credentials removed", () => {
    const found = getRequest(workspace(), { requestId: "r1" });
    if ("error" in found) throw new Error(found.error);
    expect(found.result).toMatchObject({ collection: "Shop", folder: ["Orders"] });
    const text = JSON.stringify(found.result);
    expect(text).not.toContain("sk-live-123456");
    expect(text).toContain("{{token}}");
  });

  it("explains a missing or malformed request id", () => {
    expect(getRequest(workspace(), { requestId: "nope" })).toEqual({
      error: 'No saved request with id "nope". Use list_collections to find one.',
    });
    expect(getRequest(workspace(), { id: 1 })).toEqual({ error: "Give requestId as a string." });
  });
});

describe("listEnvironments", () => {
  it("names variables but never their values", () => {
    const listed = listEnvironments(workspace());
    expect(listed).toEqual([
      {
        id: "e1",
        name: "dev",
        active: true,
        variables: [
          { name: "baseUrl", secret: false },
          { name: "token", secret: true },
        ],
      },
      { id: "e2", name: "prod", active: false, variables: [{ name: "token", secret: true }] },
    ]);
    expect(JSON.stringify(listed)).not.toContain("localhost:3000");
  });
});

describe("listHistory", () => {
  it("lists recent deliveries newest first, with secrets removed from URLs", () => {
    const result = listHistory(workspace(), {});
    if ("error" in result) throw new Error(result.error);
    expect(result.result).toEqual([
      {
        sentAt: "2026-11-23T10:01:00.000Z",
        method: "GET",
        url: "https://shop.dev/orders?token=[secret:token]",
        status: 401,
        timeMs: 12,
        environment: "dev",
      },
      {
        sentAt: "2026-11-23T10:02:00.000Z",
        method: "GET",
        url: "{{baseUrl}}/health",
        status: "not delivered",
        timeMs: 12,
        environment: "dev",
      },
    ]);
  });

  it("limits the list and checks the limit", () => {
    const one = listHistory(workspace(), { limit: 1 });
    expect("result" in one && (one.result as unknown[]).length).toBe(1);
    for (const bad of [{ limit: 0 }, { limit: 500 }, { limit: "3" }, { limit: 1.5 }]) {
      expect(listHistory(workspace(), bad)).toEqual({
        error: "limit must be a whole number from 1 to 200.",
      });
    }
  });

  it("describes MCP requests by operation and target", () => {
    const mcp = (id: string, operation: McpOperation): HistoryEntry => ({
      id,
      sentAt: "2026-11-23T11:00:00.000Z",
      request: { protocol: "mcp", id, name: id, serverId: "docs", operation },
      status: 200,
      timeMs: 3,
    });
    const result = listHistory(
      workspace({
        history: [
          mcp("a", { type: "tool", name: "search", arguments: {} }),
          mcp("b", { type: "resource", uri: "docs://readme" }),
        ],
      }),
      undefined,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.result).toMatchObject([
      { method: "MCP tool", url: "search", environment: null },
      { method: "MCP resource", url: "docs://readme" },
    ]);
  });
});
