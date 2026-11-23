import { describe, expect, it } from "vitest";
import { newRequest } from "../factories";
import { DEFAULT_LIMITS, truncateContext, truncateText } from "./truncate";
import type { AgentContext } from "./types";

describe("truncateText", () => {
  it("leaves text within the limit untouched", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("keeps the head and tail and says how much was left out", () => {
    const text = "a".repeat(50) + "b".repeat(50);
    const out = truncateText(text, 20);
    expect(out.startsWith("a".repeat(10))).toBe(true);
    expect(out.endsWith("b".repeat(10))).toBe(true);
    expect(out).toContain("80 characters omitted");
  });

  it("rejects a non-positive limit", () => {
    expect(() => truncateText("x", 0)).toThrow();
  });
});

describe("truncateContext", () => {
  const limits = { ...DEFAULT_LIMITS, bodyChars: 10, scriptChars: 10, mcpResultChars: 10 };

  it("shortens request bodies, scripts and response bodies", () => {
    const ctx: AgentContext = {
      request: newRequest({
        body: { mode: "raw", raw: "x".repeat(100), language: "json" },
        testScript: "y".repeat(100),
      }),
      outcome: {
        kind: "http",
        response: {
          status: 500,
          statusText: "",
          headers: [],
          body: "z".repeat(100),
          isBinary: false,
          sizeBytes: 100,
          timeMs: 1,
          incomplete: null,
        },
      },
      tests: [],
      environment: null,
      variableNames: [],
      question: null,
    };
    const out = truncateContext(ctx, limits);
    expect(JSON.stringify(out).length).toBeLessThan(JSON.stringify(ctx).length);
    if (out.request.protocol !== "http" || out.request.body.mode !== "raw") throw new Error();
    expect(out.request.body.raw).toContain("omitted");
    expect(out.request.testScript).toContain("omitted");
    if (out.outcome.kind !== "http") throw new Error();
    expect(out.outcome.response.body).toContain("omitted");
  });

  it("turns an oversized MCP result into a shortened JSON string", () => {
    const ctx: AgentContext = {
      request: {
        protocol: "mcp",
        id: "r",
        name: "n",
        serverId: "s",
        operation: { type: "resource", uri: "u" },
      },
      outcome: {
        kind: "mcp",
        operation: "resource",
        result: { text: "q".repeat(100) },
        isError: false,
        timeMs: 1,
      },
      tests: [],
      environment: null,
      variableNames: [],
      question: null,
    };
    const out = truncateContext(ctx, limits);
    if (out.outcome.kind !== "mcp") throw new Error();
    expect(typeof out.outcome.result).toBe("string");
    expect(out.outcome.result).toContain("omitted");
  });

  it("keeps a small MCP result as structured JSON", () => {
    const ctx: AgentContext = {
      request: {
        protocol: "mcp",
        id: "r",
        name: "n",
        serverId: "s",
        operation: { type: "resource", uri: "u" },
      },
      outcome: { kind: "mcp", operation: "resource", result: { a: 1 }, isError: false, timeMs: 1 },
      tests: [],
      environment: null,
      variableNames: [],
      question: null,
    };
    expect(truncateContext(ctx, { ...limits, mcpResultChars: 1000 })).toEqual(ctx);
  });
});
