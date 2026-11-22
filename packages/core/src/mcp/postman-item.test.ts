import { describe, expect, it } from "vitest";
import { newCollection, newRequest } from "../factories";
import type { McpRequestDef } from "../model";
import { fromPostmanCollection, toPostmanCollection } from "../postman/collection";

const mcp: McpRequestDef = {
  protocol: "mcp",
  id: "m1",
  name: "Add",
  serverId: "srv",
  operation: { type: "tool", name: "add", arguments: { a: 1 } },
};

describe("MCP requests in Postman collections", () => {
  it("round-trip next to HTTP requests", () => {
    const collection = {
      ...newCollection("Mixed"),
      items: [
        { kind: "request" as const, request: newRequest({ id: "h1", url: "https://a.dev" }) },
        { kind: "request" as const, request: mcp },
      ],
    };
    const json = toPostmanCollection(collection);
    const item = (json as { item: Record<string, unknown>[] }).item[1];
    expect(item.request).toMatchObject({ method: "POST", url: "mcp://srv/tool/add" });
    const back = fromPostmanCollection(JSON.parse(JSON.stringify(json)));
    expect(back.items.map((i) => (i.kind === "request" ? i.request.protocol : "folder"))).toEqual([
      "http",
      "mcp",
    ]);
    expect(back.items[1]).toEqual({ kind: "request", request: mcp });
  });

  it("treats a malformed extension as a plain HTTP item", () => {
    const back = fromPostmanCollection({
      info: { name: "x" },
      item: [{ name: "odd", request: "https://a.dev", narada: { protocol: "mcp" } }],
    });
    expect(back.items[0]).toMatchObject({ request: { protocol: "http", url: "https://a.dev" } });
  });
});
