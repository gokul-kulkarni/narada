import { describe, expect, it } from "vitest";
import { newCollection, newRequest } from "../factories";
import type { Collection } from "../model";
import { hostOf, parseSendArgs } from "./send";
import type { ToolWorkspace } from "./tools";

const shop: Collection = {
  ...newCollection("Shop"),
  id: "c1",
  items: [
    {
      kind: "request",
      request: newRequest({ id: "r1", name: "Orders", url: "{{baseUrl}}/orders" }),
    },
    {
      kind: "request",
      request: {
        protocol: "mcp",
        id: "m1",
        name: "Docs",
        serverId: "s",
        operation: { type: "resource", uri: "u" },
      },
    },
  ],
};
const workspace: ToolWorkspace = {
  collections: [shop],
  environments: [],
  globals: [],
  activeEnvironmentId: null,
  history: [],
};

describe("parseSendArgs", () => {
  it("sends a saved HTTP request", () => {
    expect(parseSendArgs(workspace, { requestId: "r1" })).toMatchObject({
      target: { kind: "saved", collectionId: "c1", request: { id: "r1", name: "Orders" } },
    });
  });

  it("sends a one-off request that is not saved", () => {
    const result = parseSendArgs(workspace, {
      request: {
        name: "Probe",
        method: "POST",
        url: "http://localhost:3000/x",
        body: { mode: "raw", raw: "{}" },
      },
    });
    expect(result).toMatchObject({
      target: {
        kind: "adhoc",
        request: { name: "Probe", method: "POST", url: "http://localhost:3000/x" },
      },
    });
  });

  it("explains what it cannot send", () => {
    expect(parseSendArgs(workspace, { requestId: "m1" })).toEqual({
      error: "Only HTTP requests can be sent by an agent for now.",
    });
    expect(parseSendArgs(workspace, { requestId: "x" })).toEqual({
      error: 'No saved request with id "x". Use list_collections to find one.',
    });
    expect(parseSendArgs(workspace, {})).toEqual({ error: "Give either requestId or request." });
    expect(parseSendArgs(workspace, { requestId: "r1", request: { name: "a", url: "b" } })).toEqual(
      {
        error: "Give either requestId or request.",
      },
    );
    expect(parseSendArgs(workspace, { request: { name: "a" } })).toMatchObject({
      error: expect.stringMatching(/^request\.url: /),
    });
  });
});

describe("hostOf", () => {
  it("finds the host to ask about, or says when it cannot", () => {
    expect(hostOf("https://shop.dev:8443/orders?x=1")).toBe("shop.dev:8443");
    expect(hostOf("http://localhost:3000/x")).toBe("localhost:3000");
    expect(hostOf("{{baseUrl}}/orders")).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });
});
