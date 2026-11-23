import { describe, expect, it } from "vitest";
import { newKeyValue, newRequest } from "../factories";
import { fence, renderPrompt } from "./prompt";
import type { AgentContext } from "./types";

const ctx = (overrides: Partial<AgentContext> = {}): AgentContext => ({
  request: newRequest({
    method: "POST",
    url: "{{baseUrl}}/orders",
    headers: [
      newKeyValue("Content-Type", "application/json"),
      { ...newKeyValue("X-Off", "1"), enabled: false },
    ],
    body: { mode: "raw", raw: '{"sku":"a"}', language: "json" },
    auth: { type: "bearer", token: "{{token}}" },
  }),
  outcome: {
    kind: "http",
    response: {
      status: 422,
      statusText: "Unprocessable Entity",
      headers: [["Content-Type", "application/json"]],
      body: '{"error":"qty required"}',
      isBinary: false,
      sizeBytes: 24,
      timeMs: 31,
      incomplete: null,
    },
  },
  tests: [
    { name: "status is 201", passed: false, error: "expected 422 to equal 201" },
    { name: "has body", passed: true },
  ],
  environment: "dev",
  variableNames: ["baseUrl", "token"],
  question: null,
  ...overrides,
});

describe("fence", () => {
  it("uses a fence longer than any backtick run inside", () => {
    expect(fence("a ``` b", "text")).toBe("````text\na ``` b\n````");
    expect(fence("plain")).toBe("```\nplain\n```");
  });
});

describe("renderPrompt", () => {
  it("describes an HTTP request and its failing response", () => {
    const out = renderPrompt(ctx());
    expect(out).toContain("POST {{baseUrl}}/orders");
    expect(out).toContain("Content-Type: application/json");
    expect(out).not.toContain("X-Off");
    expect(out).toContain("Auth: bearer");
    expect(out).toContain('{"sku":"a"}');
    expect(out).toContain("422 Unprocessable Entity · 31 ms · 24 B");
    expect(out).toContain('{"error":"qty required"}');
    expect(out).toContain("FAIL status is 201: expected 422 to equal 201");
    expect(out).toContain("PASS has body");
    expect(out).toContain("Environment: dev");
    expect(out).toContain("baseUrl, token");
    expect(out).toContain("Why did this request fail");
  });

  it("uses the user's question when given", () => {
    expect(renderPrompt(ctx({ question: "Is the body shape right?" }))).toContain(
      "Is the body shape right?",
    );
  });

  it("describes a request that was never delivered", () => {
    const out = renderPrompt(
      ctx({ outcome: { kind: "not-delivered", message: "ECONNREFUSED" }, tests: [] }),
    );
    expect(out).toContain("Not delivered");
    expect(out).toContain("ECONNREFUSED");
    expect(out).not.toContain("## Tests");
  });

  it("describes an MCP call", () => {
    const out = renderPrompt(
      ctx({
        request: {
          protocol: "mcp",
          id: "r",
          name: "search",
          serverId: "docs",
          operation: { type: "tool", name: "search", arguments: { q: "x" } },
        },
        outcome: {
          kind: "mcp",
          operation: "tool",
          result: { isError: true },
          isError: true,
          timeMs: 9,
        },
        tests: [],
      }),
    );
    expect(out).toContain("MCP tool `search` on server `docs`");
    expect(out).toContain('"q": "x"');
    expect(out).toContain("Tool reported an error · 9 ms");
  });

  it("notes binary and incomplete bodies", () => {
    const base = ctx();
    if (base.outcome.kind !== "http") throw new Error();
    const out = renderPrompt({
      ...base,
      outcome: {
        kind: "http",
        response: { ...base.outcome.response, isBinary: true, body: "", incomplete: "stopped" },
      },
    });
    expect(out).toContain("binary body not included");
    expect(out).toContain("Body is incomplete: stopped");
  });
});
