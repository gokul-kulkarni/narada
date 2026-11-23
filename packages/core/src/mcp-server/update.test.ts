import { describe, expect, it } from "vitest";
import { newCollection, newEnvironment, newKeyValue, newRequest } from "../factories";
import type { Collection } from "../model";
import type { ToolWorkspace } from "./tools";
import { applyUpdate, planUpdate } from "./update";

const order = newRequest({
  id: "r1",
  name: "Create order",
  method: "GET",
  url: "{{baseUrl}}/orders",
  headers: [newKeyValue("Authorization", "Bearer {{token}}")],
});
const shop: Collection = {
  ...newCollection("Shop"),
  id: "c1",
  items: [
    { kind: "request", request: order },
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
  environments: [
    {
      ...newEnvironment("dev"),
      variables: [{ ...newKeyValue("token", "sk-live-424242"), secret: true }],
    },
  ],
  globals: [],
  activeEnvironmentId: null,
  history: [],
};

describe("planUpdate", () => {
  it("plans the change as a diff, keeping auth and other fields", () => {
    const result = planUpdate(workspace, {
      requestId: "r1",
      changes: {
        method: "POST",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Authorization", value: "Bearer [redacted]" },
        ],
        body: { mode: "raw", language: "json", raw: '{"qty":1}' },
        auth: { type: "none" },
      },
    });
    if ("error" in result) throw new Error(result.error);
    const { plan } = result;
    expect(plan).toMatchObject({
      collectionId: "c1",
      collectionName: "Shop",
      requestName: "Create order",
    });
    expect(plan.changes.map((c) => c.label)).toEqual(["Method", "Header Content-Type", "Body"]);
    expect(plan.after.auth).toEqual(order.auth);
    expect(plan.after.headers.find((h) => h.key === "Authorization")?.value).toBe(
      "Bearer {{token}}",
    );
  });

  it("keeps literal secrets out of the saved request", () => {
    const result = planUpdate(workspace, {
      requestId: "r1",
      changes: {
        url: "{{baseUrl}}/orders?api_key=sk-live-424242",
        headers: [{ key: "X-Api-Key", value: "abc123xyz" }],
      },
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.plan.after.url).toBe("{{baseUrl}}/orders?api_key={{token}}");
    expect(result.plan.after.headers.find((h) => h.key === "X-Api-Key")?.value).toBe("{{xApiKey}}");
    expect(result.plan.replacedSecrets).toEqual(["token", "xApiKey"]);
  });

  it("turns [secret:name] placeholders back into variables", () => {
    const result = planUpdate(workspace, {
      requestId: "r1",
      changes: { url: "{{baseUrl}}/o?k=[secret:token]" },
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.plan.after.url).toBe("{{baseUrl}}/o?k={{token}}");
  });

  it("explains what it cannot do", () => {
    expect(planUpdate(workspace, { requestId: "nope", changes: { method: "PUT" } })).toEqual({
      error: 'No saved request with id "nope". Use list_collections to find one.',
    });
    expect(planUpdate(workspace, { requestId: "m1", changes: { method: "PUT" } })).toEqual({
      error: "Only HTTP requests can be changed this way.",
    });
    expect(planUpdate(workspace, { requestId: "r1", changes: { method: "GET" } })).toEqual({
      error: "That would not change the request.",
    });
    expect(planUpdate(workspace, { requestId: "r1", changes: { method: "FETCH" } })).toEqual({
      error: "The changes couldn't be read, so they can't be applied.",
    });
    expect(planUpdate(workspace, { changes: {} })).toEqual({
      error: "Give requestId and changes.",
    });
  });
});

describe("applyUpdate", () => {
  it("replaces only that request, returning a new collection", () => {
    const result = planUpdate(workspace, { requestId: "r1", changes: { method: "POST" } });
    if ("error" in result) throw new Error(result.error);
    const updated = applyUpdate(shop, result.plan);
    expect(updated.items[0]).toMatchObject({ request: { id: "r1", method: "POST" } });
    expect(updated.items[1]).toBe(shop.items[1]);
    expect(shop.items[0]).toMatchObject({ request: { method: "GET" } });
  });
});
