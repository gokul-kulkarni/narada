import { beforeEach, describe, expect, it } from "vitest";
import type { HistoryEntry, McpRequestDef } from "../../lib/model";
import { useMcpStore } from "../../state/mcp-store";
import { resetStores } from "../../test/reset-stores";
import { mcpShortSummary, mcpSummary, mcpTarget } from "./summary";

const request: McpRequestDef = {
  protocol: "mcp",
  id: "r",
  name: "Read",
  serverId: "srv",
  operation: { type: "resource", uri: "" },
};

describe("MCP summaries", () => {
  beforeEach(() => resetStores());

  it("names the server and operation", () => {
    expect(mcpTarget(request)).toBe("Missing server › (choose a resource)");
    useMcpStore.setState({
      servers: [{ id: "srv", name: "Docs", transport: { type: "http", url: "", headers: [] } }],
    });
    expect(mcpTarget({ ...request, operation: { type: "resource", uri: "file:///a" } })).toBe(
      "Docs › file:///a",
    );
  });

  it("words deliveries and history entries", () => {
    expect(
      mcpSummary({ protocol: "mcp", operation: "prompt", result: {}, isError: false, timeMs: 4 }),
    ).toMatchObject({
      tone: "ok",
      detail: "Prompt · 4 ms",
    });
    const entry: HistoryEntry = { id: "1", sentAt: "", request, status: null, timeMs: null };
    expect(mcpShortSummary(entry).label).toBe("Not delivered");
    expect(mcpShortSummary({ ...entry, timeMs: 3 }).code).toBe("OK");
    expect(mcpShortSummary({ ...entry, timeMs: 3, isError: true }).code).toBe("ERROR");
  });
});
